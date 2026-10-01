import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { verifyOfferQRToken, checkRedemptionEligibility } from '@/lib/offer-visibility'
import { encodeMethod } from '@/lib/redemption-status'
import {
  AlreadyRedeemedError,
  OfferLimitReachedError,
  claimAttempt,
  ensureCapacityRow,
  linkAttemptToRedemption,
  releaseCapacity,
  reserveCapacity,
} from '@/lib/redemption-tracking'
import { createAuditLog } from '@/services/audit-log.service'
import { BUSINESS_NOTIFICATION_TEMPLATES, channels, publishBusinessNotification } from '@/services/business-notification.service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { id: offerId } = await params
    if (!offerId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_QR', message: 'Invalid QR code' } },
        { status: 400 },
      )
    }

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const branchId = searchParams.get('branch')

    if (!token) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_QR', message: 'QR token is required' } },
        { status: 400 },
      )
    }

    const tokenResult = await verifyOfferQRToken(offerId, token)
    if (!tokenResult.valid) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_QR', message: tokenResult.reason ?? 'Invalid QR code' } },
        { status: 400 },
      )
    }

    const offer = await prisma.merchantOffer.findFirst({
      where: { id: offerId, deletedAt: null },
      include: {
        merchant: {
          include: {
            branches: { where: { deletedAt: null, status: 'ACTIVE' } },
          },
        },
        pricing: { select: { configuration: true } },
        redemption: { select: { redemptionType: true, configuration: true, maxRedemptions: true } },
      },
    })

    if (!offer) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Offer not found' } },
        { status: 404 },
      )
    }

    if (offer.status !== 'LIVE') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_OFFER', message: 'Offer is not live' } },
        { status: 400 },
      )
    }
  
    const now = new Date()
    console.log('Offer start date:', offer.startDate, 'Offer end date:', offer.endDate, 'Current time:', now)
    if (offer.startDate > now) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_OFFER', message: 'Offer has not started yet' } },
        { status: 400 },
      )
    }
    if (offer.endDate <= now) {
      return NextResponse.json(
        { success: false, error: { code: 'EXPIRED_OFFER', message: 'Offer has expired' } },
        { status: 400 },
      )
    }

    if (offer.merchant.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, error: { code: 'MERCHANT_INACTIVE', message: 'Merchant is not active' } },
        { status: 400 },
      )
    }

    if (offer.merchant.deletedAt) {
      return NextResponse.json(
        { success: false, error: { code: 'MERCHANT_INACTIVE', message: 'Merchant no longer exists' } },
        { status: 400 },
      )
    }

    if (offer.redemption?.redemptionType !== 'IN_STORE_QR') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'WRONG_REDEMPTION_TYPE', message: 'This offer must be redeemed differently' },
        },
        { status: 400 },
      )
    }

    let validBranchId: string | null = null
    if (branchId) {
      const branch = offer.merchant.branches.find((b) => b.id === branchId)
      if (!branch) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_BRANCH', message: 'Branch not found' } },
          { status: 400 },
        )
      }
      if (!branch.isActive || branch.status !== 'ACTIVE') {
        return NextResponse.json(
          { success: false, error: { code: 'BRANCH_INACTIVE', message: 'Branch is not active' } },
          { status: 400 },
        )
      }
      validBranchId = branch.id
    } else {
      const branches = offer.merchant.branches
      if (branches.length === 1 && branches[0]) {
        validBranchId = branches[0].id
      } else if (branches.length > 1) {
        return NextResponse.json(
          { success: false, error: { code: 'BRANCH_REQUIRED', message: 'Please specify which branch you are visiting' } },
          { status: 400 },
        )
      }
    }

    if (!validBranchId) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_BRANCH', message: 'This offer has no associated branch' } },
        { status: 400 },
      )
    }

    const eligibility = await checkRedemptionEligibility(offerId, auth.employee.id)
    if (!eligibility.eligible) {
      if (eligibility.reason?.includes('already redeemed')) {
        return NextResponse.json(
          { success: false, error: { code: 'ALREADY_REDEEMED', message: eligibility.reason } },
          { status: 409 },
        )
      }
      if (eligibility.reason?.includes('limit reached')) {
        return NextResponse.json(
          { success: false, error: { code: 'LIMIT_REACHED', message: eligibility.reason } },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { success: false, error: { code: 'NOT_ELIGIBLE', message: eligibility.reason } },
        { status: 400 },
      )
    }

    const branch = offer.merchant.branches.find((b) => b.id === validBranchId)!

    const pricingConfig = (offer.pricing?.configuration as Record<string, unknown>) ?? {}
    const isPercentageOffer =
      offer.offerType === 'PERCENTAGE' || offer.offerType === 'percentage'
    const discountValue = Number(pricingConfig.amount ?? pricingConfig.percent ?? 0)
    const savingsValue = isPercentageOffer ? 0 : discountValue

    let reservationToken: string | null = null
    try {
      const redemption = await prisma.$transaction(async (tx) => {
        const claim = await claimAttempt(tx, offer.id, auth.employee.id)
        if (!claim.ok) throw new AlreadyRedeemedError()

        await ensureCapacityRow(tx, offer.id, offer.redemption?.maxRedemptions ?? null)
        const reserve = await reserveCapacity(tx, offer.id)
        if (!reserve.ok) throw new OfferLimitReachedError()

        const created = await tx.redemption.create({
          data: {
            merchantId: offer.merchantId,
            offerId: offer.id,
            employeeId: auth.employee.id,
            companyId: auth.employee.companyId,
            branchId: validBranchId,
            discountAmount: discountValue,
            spentAmount: null,
            savingsAmount: savingsValue,
            merchantNotes: encodeMethod('IN_STORE'),
            employeeNotes: null,
            isVerified: true,
            verifiedAt: new Date(),
            redeemedAt: new Date(),
          },
        })

        await linkAttemptToRedemption(tx, claim.attemptId!, created.id)

        await tx.offerRedemption.update({
          where: { offerId },
          data: { currentRedemptions: { increment: 1 } },
        })

        reservationToken = claim.attemptId ?? null
        return created
      })

      await createAuditLog({
        actorType: 'employee',
        actorId: auth.employee.id,
        action: 'QR_SCAN_REDEMPTION',
        entityType: 'redemption',
        entityId: redemption.id,
        metadata: {
          offerId,
          merchantId: offer.merchantId,
          branchId: validBranchId,
          employeeId: auth.employee.id,
          redemptionType: 'IN_STORE_QR',
          scanMethod: 'QR',
        },
      })

      const template = BUSINESS_NOTIFICATION_TEMPLATES.redemptionSuccessful(offer.merchant.businessName)
      await publishBusinessNotification({
        ...template,
        recipients: [{ role: 'merchant', id: offer.merchantId }],
        channels: channels('IN_APP', 'PUSH'),
        referenceType: 'redemption',
        referenceId: redemption.id,
        metadata: {
          employeeId: auth.employee.id,
          offerId: offer.id,
          branchId: validBranchId,
            redeemedAt: redemption.redeemedAt?.toISOString() ?? new Date().toISOString(),
        },
      })

      return NextResponse.json(
        {
          success: true,
          data: {
            redemptionId: redemption.id,
            offerId: offer.id,
            merchant: {
              id: offer.merchant.id,
              businessName: offer.merchant.businessName,
              logoUrl: offer.merchant.logoUrl,
            },
            branch: {
              id: branch.id,
              name: branch.name,
              addressLine1: branch.addressLine1,
              addressLine2: branch.addressLine2,
              city: branch.city,
              state: branch.state,
              postalCode: branch.postalCode,
              phone: branch.phone,
              latitude: branch.latitude ? Number(branch.latitude) : null,
              longitude: branch.longitude ? Number(branch.longitude) : null,
            },
          redeemedAt: redemption.redeemedAt?.toISOString() ?? new Date().toISOString(),
            verified: true,
            message: 'Offer redeemed successfully.',
          },
        },
        { status: 201 },
      )
    } catch (err: unknown) {
      if (err instanceof AlreadyRedeemedError) {
        return NextResponse.json(
          { success: false, error: { code: 'ALREADY_REDEEMED', message: err.message } },
          { status: 409 },
        )
      }
      if (err instanceof OfferLimitReachedError) {
        return NextResponse.json(
          { success: false, error: { code: 'LIMIT_REACHED', message: err.message } },
          { status: 409 },
        )
      }
      if (reservationToken) {
        await releaseCapacity(prisma, offer.id).catch(() => {})
      }
      throw err
    }
  } catch (error) {
    console.error('[POST /api/mobile/offers/[id]/scan]', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
