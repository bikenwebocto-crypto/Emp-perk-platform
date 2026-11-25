import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Mobile redemption by offer channel (In-store / Online / Both).
 *
 * How a channel is stored (src/lib/offers/channel.ts):
 *   IN_STORE → redemptionType VIRTUAL_CARD_AUTO_VERIFY
 *   ONLINE   → redemptionType ONLINE_CODE
 *   BOTH     → redemptionType ONLINE_CODE + configuration.channel = "BOTH"
 *
 * A "Both" offer must be redeemable either way from the app:
 *   - online:   POST /api/mobile/offers/:id/redeem  (no branchId)
 *   - in-store: POST /api/mobile/offers/:id/redeem  { branchId }
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findFirst: vi.fn() },
    merchantBranch: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/lib/offer-visibility', () => ({
  checkRedemptionEligibility: vi.fn(),
  verifyOfferQRToken: vi.fn(),
}))
vi.mock('@/lib/redemption-status', () => ({
  encodeMethod: vi.fn((m: string) => `METHOD:${m}`),
}))
vi.mock('@/lib/redemption-code', () => ({ generateRedemptionCode: vi.fn(() => 'CODE-1234') }))
vi.mock('@/lib/virtual-card', () => ({
  VIRTUAL_CARD_AUTO_VERIFY: 'VIRTUAL_CARD_AUTO_VERIFY',
  buildVirtualCard: vi.fn(async () => ({ code: 'CODE-1234', qr: 'data:image/png;base64,xx' })),
}))
vi.mock('@/lib/redemption-tracking', () => ({
  AlreadyRedeemedError: class AlreadyRedeemedError extends Error {
    constructor(m = 'You have already redeemed this offer') { super(m) }
  },
  OfferLimitReachedError: class OfferLimitReachedError extends Error {},
  claimAttempt: vi.fn(),
  ensureCapacityRow: vi.fn(),
  getRepeatAfterHours: vi.fn(() => null),
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
import { checkRedemptionEligibility, verifyOfferQRToken } from '@/lib/offer-visibility'
import { buildVirtualCard } from '@/lib/virtual-card'
import { claimAttempt, reserveCapacity } from '@/lib/redemption-tracking'
import { POST as REDEEM } from '@/app/api/mobile/offers/[id]/redeem/route'
import { POST as SCAN } from '@/app/api/mobile/offers/[id]/scan/route'

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any
const BRANCH = {
  id: 'branch-1',
  name: 'Main Street',
  addressLine1: '1 Main St',
  addressLine2: null,
  city: 'Dubai',
  state: null,
  postalCode: null,
  phone: null,
  latitude: 25.2,
  longitude: 55.3,
  openingHours: null,
  isActive: true,
  status: 'ACTIVE',
}

function offerFor(channel: 'IN_STORE' | 'ONLINE' | 'BOTH') {
  const redemptionType = channel === 'IN_STORE' ? 'VIRTUAL_CARD_AUTO_VERIFY' : 'ONLINE_CODE'
  return {
    id: 'offer-1',
    merchantId: 'merchant-1',
    title: 'Flat 10 off',
    status: 'LIVE',
    offerType: 'FLAT',
    startDate: new Date(Date.now() - 86_400_000),
    endDate: new Date(Date.now() + 86_400_000),
    merchant: {
      id: 'merchant-1',
      businessName: 'Merchant',
      website: 'https://merchant.example',
      logoUrl: null,
      status: 'ACTIVE',
      deletedAt: null,
      branches: [BRANCH],
    },
    pricing: { configuration: { amount: 10 } },
    redemption: {
      redemptionType,
      configuration: {
        channel,
        allBranches: channel !== 'ONLINE',
        branchIds: [],
        ...(channel !== 'IN_STORE' ? { bookingUrl: 'https://merchant.example/shop' } : {}),
        instructions: 'Show this at the counter or use the code online',
      },
      maxRedemptions: 100,
      currentRedemptions: 0,
    },
  }
}

let createdRows: any[] = []

function redeem(body: unknown) {
  const req = new Request('http://localhost/api/mobile/offers/offer-1/redeem', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any
  return REDEEM(req, { params: Promise.resolve({ id: 'offer-1' }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  createdRows = []
  ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
  ;(checkRedemptionEligibility as any).mockResolvedValue({ eligible: true })
  ;(claimAttempt as any).mockResolvedValue({ ok: true, attemptId: 'attempt-1' })
  ;(reserveCapacity as any).mockResolvedValue({ ok: true })
  ;(prisma.merchantBranch.findFirst as any).mockImplementation(async ({ where }: any) =>
    where.id === BRANCH.id && (where.merchantId ?? 'merchant-1') === 'merchant-1' ? BRANCH : null,
  )
  ;(prisma.$transaction as any).mockImplementation(async (fn: any) =>
    fn({
      redemption: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `redemption-${createdRows.length + 1}`, ...data }
          createdRows.push(row)
          return row
        }),
      },
      offerRedemption: { update: vi.fn().mockResolvedValue({}) },
      offerAnalytics: { upsert: vi.fn().mockResolvedValue({}) },
    }),
  )
})

describe('Mobile redeem — In-store offer', () => {
  it('redeems with a branch and returns a verified virtual card', async () => {
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(offerFor('IN_STORE'))

    const res = await redeem({ branchId: 'branch-1' })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.data.type).toBe('VIRTUAL_CARD_AUTO_VERIFY')
    expect(body.data.status).toBe('CONFIRMED')
    expect(body.data.virtualCard).toBeTruthy()
    expect(buildVirtualCard).toHaveBeenCalled()
    expect(createdRows[0]).toMatchObject({
      branchId: 'branch-1',
      isVerified: true,
      merchantNotes: 'METHOD:IN_STORE',
    })
  })
})

describe('Mobile redeem — Online offer', () => {
  it('redeems without a branch and returns a unique code + website', async () => {
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(offerFor('ONLINE'))

    const res = await redeem({})
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.data.type).toBe('ONLINE_CODE')
    expect(body.data.status).toBe('PENDING')
    expect(body.data.offerCode).toBe('CODE-1234')
    expect(body.data.merchantWebsite).toBe('https://merchant.example/shop')
    expect(createdRows[0]).toMatchObject({
      branchId: null,
      isVerified: false,
      merchantNotes: 'METHOD:ONLINE',
    })
  })
})

describe('Mobile redeem — Both (In-store + Online) offer', () => {
  beforeEach(() => {
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(offerFor('BOTH'))
  })

  it('way 1 — online: no branch → code + website, PENDING', async () => {
    const res = await redeem({})
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.offerCode).toBe('CODE-1234')
    expect(body.data.merchantWebsite).toBe('https://merchant.example/shop')
    expect(body.data.status).toBe('PENDING')
    expect(createdRows[0].branchId).toBeNull()
  })

  it('way 2 — in-store: with branchId → redemption is recorded against that branch', async () => {
    const res = await redeem({ branchId: 'branch-1' })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(createdRows[0].branchId).toBe('branch-1')
    expect(body.data.offerCode).toBe('CODE-1234')
  })

  it('way 2 — in-store: rejects a branch from another merchant', async () => {
    const res = await redeem({ branchId: 'someone-elses-branch' })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.message).toBe('Invalid branchId for this offer')
    expect(createdRows).toHaveLength(0)
  })

  it('online then in-store by the same employee: the second attempt is blocked (one redemption per cooldown)', async () => {
    const first = await redeem({})
    expect(first.status).toBe(201)

    ;(claimAttempt as any).mockResolvedValueOnce({ ok: false })
    const second = await redeem({ branchId: 'branch-1' })

    expect(second.status).toBe(400)
    expect(createdRows).toHaveLength(1)
  })

  it('in-store QR scan endpoint does NOT accept a Both offer (only IN_STORE_QR)', async () => {
    ;(verifyOfferQRToken as any).mockResolvedValue({ valid: true })
    const req = new Request(
      'http://localhost/api/mobile/offers/offer-1/scan?token=t&branch=branch-1',
      { method: 'POST' },
    ) as any

    const res = await SCAN(req, { params: Promise.resolve({ id: 'offer-1' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('WRONG_REDEMPTION_TYPE')
  })
})
