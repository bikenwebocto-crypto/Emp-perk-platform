import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findFirst: vi.fn() },
    merchantBranch: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/lib/offer-visibility', () => ({ checkRedemptionEligibility: vi.fn() }))
vi.mock('@/lib/redemption-status', () => ({
  encodeMethod: vi.fn(() => 'ENCODED_METHOD'),
}))
vi.mock('@/lib/redemption-code', () => ({ generateRedemptionCode: vi.fn(() => 'CODE-1234') }))
vi.mock('@/lib/redemption-tracking', () => ({
  AlreadyRedeemedError: class AlreadyRedeemedError extends Error {},
  OfferLimitReachedError: class OfferLimitReachedError extends Error {},
  claimAttempt: vi.fn(),
  ensureCapacityRow: vi.fn(),
  linkAttemptToRedemption: vi.fn(),
  releaseCapacity: vi.fn(),
  reserveCapacity: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/business-notification.service', () => ({
  BUSINESS_NOTIFICATION_TEMPLATES: {
    redemptionPending: vi.fn(() => ({ title: 'Pending', body: 'body' })),
    redemptionSuccessful: vi.fn(() => ({ title: 'Success', body: 'body' })),
  },
  channels: vi.fn((...c: string[]) => c),
  publishBusinessNotification: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { checkRedemptionEligibility } from '@/lib/offer-visibility'
import {
  claimAttempt,
  ensureCapacityRow,
  linkAttemptToRedemption,
  reserveCapacity,
  AlreadyRedeemedError,
} from '@/lib/redemption-tracking'
import { POST } from '@/app/api/mobile/offers/[id]/redeem/route'

function postRequest(body: unknown, id = 'offer-1') {
  return new Request(`http://localhost/api/mobile/offers/${id}/redeem`, {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any
}
function ctx(id = 'offer-1') {
  return { params: Promise.resolve({ id }) }
}

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any

const LIVE_OFFER = {
  id: 'offer-1',
  merchantId: 'merchant-1',
  status: 'LIVE',
  offerType: 'FLAT',
  startDate: new Date(Date.now() - 86_400_000),
  endDate: new Date(Date.now() + 86_400_000),
  merchant: { id: 'merchant-1', businessName: 'Merchant', website: 'https://merchant.example' },
  pricing: { configuration: { amount: 10 } },
  redemption: {
    redemptionType: 'ONLINE_CODE',
    configuration: {},
    maxRedemptions: 100,
    currentRedemptions: 0,
  },
}

describe('POST /api/mobile/offers/[id]/redeem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(checkRedemptionEligibility as any).mockResolvedValue({ eligible: true })
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(LIVE_OFFER)
    ;(claimAttempt as any).mockResolvedValue({ ok: true, attemptId: 'attempt-1' })
    ;(ensureCapacityRow as any).mockResolvedValue(undefined)
    ;(reserveCapacity as any).mockResolvedValue({ ok: true })
    ;(linkAttemptToRedemption as any).mockResolvedValue(undefined)
    ;(prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const tx = {
        redemption: { create: vi.fn().mockResolvedValue({ id: 'redemption-1', redemptionCode: 'CODE-1234', redeemedAt: new Date() }) },
        offerRedemption: { update: vi.fn().mockResolvedValue({}) },
        offerAnalytics: { upsert: vi.fn().mockResolvedValue({}) },
      }
      return fn(tx)
    })
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await POST(postRequest({}), ctx())

    expect(res.status).toBe(401)
    expect(checkRedemptionEligibility).not.toHaveBeenCalled()
  })

  it('returns 400 when not eligible to redeem', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(checkRedemptionEligibility as any).mockResolvedValue({ eligible: false, reason: 'Already redeemed' })

    const res = await POST(postRequest({}), ctx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.message).toBe('Already redeemed')
  })

  it('returns 404 when the offer does not exist', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(null)

    const res = await POST(postRequest({}), ctx())

    expect(res.status).toBe(404)
  })

  it('creates a PENDING redemption with a generated code for an ONLINE_CODE offer', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await POST(postRequest({}), ctx())
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('PENDING')
    expect(body.data.offerCode).toBe('CODE-1234')
  })

  it('returns 400 when the AlreadyRedeemedError is thrown inside the transaction', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.$transaction as any).mockImplementation(async () => {
      throw new AlreadyRedeemedError('Already redeemed this offer')
    })

    const res = await POST(postRequest({}), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 400 for an IN_STORE_QR offer redeemed without a branchId', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue({
      ...LIVE_OFFER,
      redemption: { ...LIVE_OFFER.redemption, redemptionType: 'IN_STORE_QR' },
    })

    const res = await POST(postRequest({}), ctx())

    expect(res.status).toBe(400)
  })

  it('returns 400 for a BOOKING_LINK offer with no configured booking URL', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue({
      ...LIVE_OFFER,
      redemption: { ...LIVE_OFFER.redemption, redemptionType: 'BOOKING_LINK', configuration: {} },
    })

    const res = await POST(postRequest({}), ctx())

    expect(res.status).toBe(400)
  })
})
