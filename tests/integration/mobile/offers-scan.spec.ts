import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/lib/offer-visibility', () => ({
  verifyOfferQRToken: vi.fn(),
  checkRedemptionEligibility: vi.fn(),
}))
vi.mock('@/lib/redemption-status', () => ({ encodeMethod: vi.fn(() => 'IN_STORE') }))
vi.mock('@/lib/redemption-tracking', () => ({
  AlreadyRedeemedError: class AlreadyRedeemedError extends Error {},
  OfferLimitReachedError: class OfferLimitReachedError extends Error {},
  claimAttempt: vi.fn(),
  ensureCapacityRow: vi.fn(),
  linkAttemptToRedemption: vi.fn(),
  releaseCapacity: vi.fn(),
  reserveCapacity: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/services/business-notification.service', () => ({
  BUSINESS_NOTIFICATION_TEMPLATES: {
    redemptionSuccessful: vi.fn(() => ({ title: 't', body: 'b' })),
  },
  channels: vi.fn((...c: string[]) => c),
  publishBusinessNotification: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { verifyOfferQRToken, checkRedemptionEligibility } from '@/lib/offer-visibility'
import { claimAttempt, ensureCapacityRow, reserveCapacity, linkAttemptToRedemption } from '@/lib/redemption-tracking'
import { POST } from '@/app/api/mobile/offers/[id]/scan/route'

function postRequest(offerId: string, query = '') {
  return {
    url: `http://localhost/api/mobile/offers/${offerId}/scan${query}`,
  } as any
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

const AUTH_OK = {
  ok: true,
  user: { id: 'user-1' },
  account: { id: 'acc-1' },
  employee: { id: 'emp-1', companyId: 'company-1' },
  company: { id: 'company-1' },
}

function baseOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    merchantId: 'merchant-1',
    status: 'LIVE',
    offerType: 'FLAT',
    startDate: new Date(Date.now() - 86_400_000),
    endDate: new Date(Date.now() + 86_400_000),
    merchant: {
      id: 'merchant-1',
      businessName: 'Coffee Shop',
      logoUrl: null,
      status: 'ACTIVE',
      deletedAt: null,
      branches: [
        {
          id: 'branch-1',
          name: 'Main',
          addressLine1: '1 Main St',
          addressLine2: null,
          city: 'City',
          state: 'ST',
          postalCode: '00000',
          phone: null,
          latitude: null,
          longitude: null,
          isActive: true,
          status: 'ACTIVE',
        },
      ],
    },
    pricing: { configuration: { amount: 10 } },
    redemption: { redemptionType: 'IN_STORE_QR', configuration: {}, maxRedemptions: null },
    ...overrides,
  }
}

describe('POST /api/mobile/offers/[id]/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(verifyOfferQRToken as any).mockResolvedValue({ valid: true })
    ;(checkRedemptionEligibility as any).mockResolvedValue({ eligible: true })
    ;(claimAttempt as any).mockResolvedValue({ ok: true, attemptId: 'attempt-1' })
    ;(ensureCapacityRow as any).mockResolvedValue(undefined)
    ;(reserveCapacity as any).mockResolvedValue({ ok: true })
    ;(linkAttemptToRedemption as any).mockResolvedValue(undefined)
    ;(prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        redemption: {
          create: vi.fn().mockResolvedValue({
            id: 'redemption-1',
            redeemedAt: new Date(),
          }),
        },
        offerRedemption: { update: vi.fn().mockResolvedValue({}) },
      }),
    )
  })

  it('returns 401 when the request is not authenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    })

    const res = await POST(postRequest('offer-1', '?token=abc'), ctx('offer-1'))

    expect(res.status).toBe(401)
  })

  it('returns 400 when the QR token is missing', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await POST(postRequest('offer-1'), ctx('offer-1'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('INVALID_QR')
  })

  it('returns 404 when the offer does not exist', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(null)

    const res = await POST(postRequest('offer-1', '?token=abc'), ctx('offer-1'))

    expect(res.status).toBe(404)
  })

  it('redeems a live single-branch offer and returns 201 with redemption details', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(baseOffer())

    const res = await POST(postRequest('offer-1', '?token=abc'), ctx('offer-1'))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.redemptionId).toBe('redemption-1')
    expect(body.data.merchant.id).toBe('merchant-1')
    expect(body.data.branch.id).toBe('branch-1')
    expect(body.data.verified).toBe(true)
  })

  it('returns 409 when the employee already redeemed this offer', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(baseOffer())
    ;(checkRedemptionEligibility as any).mockResolvedValue({
      eligible: false,
      reason: 'You have already redeemed this offer',
    })

    const res = await POST(postRequest('offer-1', '?token=abc'), ctx('offer-1'))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error.code).toBe('ALREADY_REDEEMED')
  })
})
