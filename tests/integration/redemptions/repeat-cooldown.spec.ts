import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Exercises the real redeem route + checkRedemptionEligibility + claimAttempt
// against an in-memory Prisma fake that enforces the
// UNIQUE(offerId, employeeId) constraint on offer_redemption_attempts.

type Attempt = { id: string; offerId: string; employeeId: string; redemptionId: string | null; createdAt: Date }
type Row = { id: string; offerId: string; employeeId: string; redemptionCode: string; createdAt: Date; redeemedAt: Date }

const db = vi.hoisted(() => ({
  attempts: [] as any[],
  redemptions: [] as any[],
  configuration: {} as Record<string, unknown>,
  seq: 0,
}))

vi.mock('@/lib/prisma', () => {
  const offer = () => ({
    id: 'offer-1',
    merchantId: 'merchant-1',
    status: 'LIVE',
    offerType: 'FLAT',
    startDate: new Date(Date.now() - 30 * 86_400_000),
    endDate: new Date(Date.now() + 30 * 86_400_000),
    merchant: {
      id: 'merchant-1',
      businessName: 'Merchant',
      website: null,
      status: 'ACTIVE',
      deletedAt: null,
      branches: [{ isActive: true, status: 'ACTIVE', branchType: 'IN_STORE' }],
    },
    pricing: { configuration: { amount: 10 } },
    redemption: {
      redemptionType: 'ONLINE_CODE',
      configuration: db.configuration,
      maxRedemptions: null,
      currentRedemptions: 0,
    },
    capacity: { maxRedemptions: null, redeemedCount: 0 },
  })

  const client: any = {
    merchantOffer: { findFirst: vi.fn(async () => offer()) },
    merchantBranch: { findFirst: vi.fn(async () => null) },
    redemption: {
      findFirst: vi.fn(async ({ where }: any) => {
        const rows = db.redemptions
          .filter((r: Row) => r.offerId === where.offerId && r.employeeId === where.employeeId)
          .sort((a: Row, b: Row) => b.createdAt.getTime() - a.createdAt.getTime())
        return rows[0] ?? null
      }),
      create: vi.fn(async ({ data }: any) => {
        const now = new Date()
        const row = { ...data, id: `red-${++db.seq}`, createdAt: now, redeemedAt: data.redeemedAt ?? now }
        db.redemptions.push(row)
        return row
      }),
    },
    offerRedemptionAttempt: {
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = db.attempts.length
        db.attempts = db.attempts.filter(
          (a: Attempt) =>
            !(a.offerId === where.offerId && a.employeeId === where.employeeId && a.createdAt < where.createdAt.lt),
        )
        return { count: before - db.attempts.length }
      }),
      create: vi.fn(async ({ data }: any) => {
        // Yield first so concurrent callers interleave like real I/O.
        await Promise.resolve()
        if (db.attempts.some((a: Attempt) => a.offerId === data.offerId && a.employeeId === data.employeeId)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          })
        }
        const row = { ...data, id: `att-${++db.seq}`, redemptionId: null, createdAt: new Date() }
        db.attempts.push(row)
        return { id: row.id }
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const a = db.attempts.find((x: Attempt) => x.id === where.id)
        if (a) Object.assign(a, data)
        return a
      }),
    },
    offerRedemptionCapacity: {
      upsert: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => ({ maxRedemptions: null, redeemedCount: 0 })),
    },
    offerRedemption: { update: vi.fn(async () => ({})) },
    offerAnalytics: { upsert: vi.fn(async () => ({})) },
    $executeRaw: vi.fn(async () => 1),
  }
  client.$transaction = vi.fn(async (fn: any) => fn(client))
  return { prisma: client }
})
vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(async () => ({
    ok: true,
    employee: { id: 'emp-1', companyId: 'company-1' },
  })),
}))
vi.mock('@/lib/redemption-code', () => {
  let n = 0
  return { generateRedemptionCode: vi.fn(() => `CODE-${++n}`) }
})
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/business-notification.service', () => ({
  BUSINESS_NOTIFICATION_TEMPLATES: {
    redemptionPending: vi.fn(() => ({ title: 'Pending', body: 'body' })),
    redemptionSuccessful: vi.fn(() => ({ title: 'Success', body: 'body' })),
  },
  channels: vi.fn((...c: string[]) => c),
  publishBusinessNotification: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/mobile/offers/[id]/redeem/route'
import { getRepeatAfterHours, getRedeemState } from '@/lib/redemption-tracking'

const HOUR = 3_600_000
const START = new Date('2026-10-01T10:00:00.000Z')

function redeem() {
  return POST(
    new Request('http://localhost/api/mobile/offers/offer-1/redeem', {
      method: 'POST',
      body: JSON.stringify({}),
    }) as any,
    { params: Promise.resolve({ id: 'offer-1' }) },
  )
}

describe('repeat redemption cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(START)
    db.attempts = []
    db.redemptions = []
    db.configuration = {}
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getRepeatAfterHours', () => {
    it('returns null for missing, null, zero, negative or non-numeric values', () => {
      expect(getRepeatAfterHours(null)).toBeNull()
      expect(getRepeatAfterHours({})).toBeNull()
      expect(getRepeatAfterHours({ repeatAfterHours: null })).toBeNull()
      expect(getRepeatAfterHours({ repeatAfterHours: 0 })).toBeNull()
      expect(getRepeatAfterHours({ repeatAfterHours: -5 })).toBeNull()
      expect(getRepeatAfterHours({ repeatAfterHours: 'abc' })).toBeNull()
    })

    it('returns the positive number of hours', () => {
      expect(getRepeatAfterHours({ repeatAfterHours: 24 })).toBe(24)
      expect(getRepeatAfterHours({ repeatAfterHours: '12' })).toBe(12)
    })
  })

  describe('getRedeemState', () => {
    it('reports nextRedeemAt only while inside the cooldown', () => {
      expect(getRedeemState(null, 24, START)).toEqual({ isRedeemed: false, nextRedeemAt: null })
      expect(getRedeemState(START, null, START)).toEqual({ isRedeemed: true, nextRedeemAt: null })
      expect(getRedeemState(START, 24, new Date(START.getTime() + HOUR))).toEqual({
        isRedeemed: true,
        nextRedeemAt: new Date(START.getTime() + 24 * HOUR),
      })
      expect(getRedeemState(START, 24, new Date(START.getTime() + 25 * HOUR))).toEqual({
        isRedeemed: false,
        nextRedeemAt: null,
      })
    })
  })

  it('(a) no cooldown: second redeem is rejected, even long after', async () => {
    expect((await redeem()).status).toBe(201)

    vi.setSystemTime(new Date(START.getTime() + 365 * 24 * HOUR))
    const res = await redeem()
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.message).toBe('You have already redeemed this offer')
    expect(db.redemptions).toHaveLength(1)
  })

  it('(b) cooldown not yet passed: second redeem is rejected with next available time', async () => {
    db.configuration = { repeatAfterHours: 24 }
    expect((await redeem()).status).toBe(201)

    vi.setSystemTime(new Date(START.getTime() + 23 * HOUR))
    const res = await redeem()
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error.message).toContain('already redeemed')
    expect(body.error.message).toContain(new Date(START.getTime() + 24 * HOUR).toISOString())
    expect(db.redemptions).toHaveLength(1)
    expect(db.attempts).toHaveLength(1)
  })

  it('(c) cooldown passed: second redeem succeeds and creates a second Redemption row', async () => {
    db.configuration = { repeatAfterHours: 24 }
    expect((await redeem()).status).toBe(201)

    vi.setSystemTime(new Date(START.getTime() + 25 * HOUR))
    const res = await redeem()

    expect(res.status).toBe(201)
    expect(db.redemptions).toHaveLength(2)
    expect(db.redemptions[0].redemptionCode).not.toBe(db.redemptions[1].redemptionCode)
    // Old attempt replaced: still exactly one attempt row, linked to the new redemption.
    expect(db.attempts).toHaveLength(1)
    expect(db.attempts[0].redemptionId).toBe(db.redemptions[1].id)
  })

  it('(d) two simultaneous requests after the cooldown: only one succeeds', async () => {
    db.configuration = { repeatAfterHours: 24 }
    expect((await redeem()).status).toBe(201)

    vi.setSystemTime(new Date(START.getTime() + 25 * HOUR))
    const [r1, r2] = await Promise.all([redeem(), redeem()])
    const statuses = [r1.status, r2.status].sort()

    expect(statuses).toEqual([201, 400])
    expect(db.redemptions).toHaveLength(2)
    expect(db.attempts).toHaveLength(1)
  })
})
