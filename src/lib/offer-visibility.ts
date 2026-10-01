// Centralized business rules for the employee offer visibility flow.
// Used by:
//   - GET /api/employee/offers               (inlined as evaluateVisibility)
//   - POST /api/employee/redeem              (isOfferVisibleToEmployees)
//   - POST /api/employee/redeem              (checkRedemptionEligibility)
//   - verifyOfferQRToken                     (in-store QR validation)
//
// Rules:
// 1. offer.status = 'LIVE'
// 2. offer.startDate <= now
// 3. offer.endDate > now
// 4. merchant.status = 'ACTIVE' (and not deleted)
// 5. merchant has at least one active branch (or an ONLINE branch if delivery/digital only)
//
// Note: per-employee redemption limit is enforced at redemption time (not at
// visibility time) by counting the employee's existing redemptions for the offer.

import { prisma } from '@/lib/prisma'
import { deriveCapacityStatus } from '@/lib/redemption-tracking'

export interface OfferVisibilityResult {
  visible: boolean
  reason?: string
}

export async function isOfferVisibleToEmployees(
  offerId: string
): Promise<OfferVisibilityResult> {
  const offer = await prisma.merchantOffer.findFirst({
    where: { id: offerId, deletedAt: null },
    include: {
      merchant: {
        include: {
          branches: { where: { deletedAt: null } },
        },
      },
    },
  })
  if (!offer) return { visible: false, reason: 'Offer not found' }
  if (offer.status !== 'LIVE') return { visible: false, reason: 'Offer is not live' }
  const now = new Date()
  if (offer.startDate > now) return { visible: false, reason: 'Offer has not started yet' }
  if (offer.endDate <= now) return { visible: false, reason: 'Offer has expired' }
  if (offer.merchant.status !== 'ACTIVE') {
    return { visible: false, reason: 'Merchant is not active' }
  }
  if (offer.merchant.deletedAt) {
    return { visible: false, reason: 'Merchant no longer exists' }
  }
  const hasActiveBranch = offer.merchant.branches.some((b) => b.isActive && b.status === 'ACTIVE')
  const hasOnlineBranch = offer.merchant.branches.some(
    (b) => b.branchType === 'ONLINE' && b.status === 'ACTIVE'
  )
  if (!hasActiveBranch && !hasOnlineBranch) {
    return { visible: false, reason: 'Merchant has no active branches' }
  }
  return { visible: true }
}

export interface RedemptionEligibility {
  eligible: boolean
  reason?: string
}

export interface QROwnerResult {
  valid: boolean
  reason?: string
  offerId?: string
  merchantId?: string
}

export async function verifyOfferQRToken(
  offerId: string,
  token: string
): Promise<QROwnerResult> {
  const offer = await prisma.merchantOffer.findFirst({
    where: { id: offerId, deletedAt: null },
    select: {
      id: true,
      merchantId: true,
      redemption: { select: { redemptionType: true, configuration: true } },
    },
  })

  if (!offer) {
    return { valid: false, reason: 'Offer not found' }
  }

  if (offer.redemption?.redemptionType !== 'IN_STORE_QR') {
    return { valid: false, reason: 'Offer is not an in-store QR offer' }
  }

  const config = (offer.redemption?.configuration as Record<string, unknown>) ?? {}
  const storedToken = config.qrToken as string | undefined

  if (!storedToken || storedToken !== token) {
    return { valid: false, reason: 'Invalid or expired QR token' }
  }

  return { valid: true, offerId: offer.id, merchantId: offer.merchantId }
}

export async function checkRedemptionEligibility(
  offerId: string,
  employeeId: string
): Promise<RedemptionEligibility> {
  const visibility = await isOfferVisibleToEmployees(offerId)
  if (!visibility.visible) return { eligible: false, reason: visibility.reason }

  const offer = await prisma.merchantOffer.findFirst({
    where: { id: offerId, deletedAt: null },
    select: {
      id: true,
      capacity: { select: { maxRedemptions: true, redeemedCount: true } },
    },
  })
  if (!offer) return { eligible: false, reason: 'Offer not found' }

  if (deriveCapacityStatus(offer.capacity) === 'ENDED') {
    return { eligible: false, reason: 'Offer usage limit reached' }
  }

  const employeeRedemptions = await prisma.redemption.count({
    where: { offerId, employeeId },
  })
  if (employeeRedemptions > 0) {
    return { eligible: false, reason: 'You have already redeemed this offer' }
  }

  return { eligible: true }
}
