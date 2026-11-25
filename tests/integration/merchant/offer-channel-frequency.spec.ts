import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Every prisma.<model>.<method> is an auto-created vi.fn resolving to null,
// so tests only configure what they care about.
vi.mock('@/lib/prisma', () => {
  const models = new Map<string, Record<string, any>>()
  const model = (name: string) => {
    if (!models.has(name)) {
      const fns: Record<string, any> = {}
      models.set(
        name,
        new Proxy(fns, {
          get: (t, p: string) => (t[p] ??= vi.fn(async () => (p === 'findMany' ? [] : null))),
        }),
      )
    }
    return models.get(name)!
  }
  const prisma: any = new Proxy(
    {
      $transaction: vi.fn(async (fn: any) => fn(prisma)),
      __reset: () => models.clear(),
    },
    { get: (t: any, p: string) => (p in t ? t[p] : model(p)) },
  )
  return { prisma }
})
// next/server `after()` throws outside a real request scope; run it inline.
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: vi.fn((fn: () => unknown) => { void Promise.resolve().then(fn).catch(() => {}) }),
}))
vi.mock('@/lib/merchant-session', () => ({
  getMerchantFromSession: vi.fn(async () => ({
    id: 'merchant-1',
    categoryId: 'cat-1',
    businessName: 'Merchant',
    accountId: 'acct-1',
  })),
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn(async () => null) }))
vi.mock('@/lib/offer-code', () => ({ generateUniqueOfferCode: vi.fn(async () => 'GEN-CODE') }))
vi.mock('@/lib/offer-qr', () => ({ ensureOfferQRCode: vi.fn(async () => null) }))
vi.mock('@/lib/offer-replacement', () => ({
  ReplacementValidationError: class extends Error {},
  validateReplacement: vi.fn(),
}))
vi.mock('@/lib/offer-replacement-notifications', () => ({
  logReplacementAudit: vi.fn(),
  notifyReplacement: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/business-notification.service', () => ({
  BUSINESS_NOTIFICATION_TEMPLATES: new Proxy({}, { get: () => () => ({ title: 't', body: 'b' }) }),
  channels: vi.fn((...c: string[]) => c),
  publishBusinessNotification: vi.fn().mockResolvedValue(undefined),
  publishBusinessToAdmins: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { POST as createOffer } from '@/app/api/merchant/offers/route'
import { GET as getOffer, PATCH as editOffer } from '@/app/api/merchant/offers/[id]/route'
import { POST as submitOffer } from '@/app/api/merchant/offers/[id]/submit/route'

import {
  frequencyToRepeatHours,
  repeatHoursToFrequency,
  type OfferFrequency,
} from '@/lib/offers/frequency'
import {
  BRANCHES_REQUIRED_MESSAGE,
  INVALID_BRANCHES_MESSAGE,
} from '@/lib/offers/channel'
import { getLiveOffersLinkedToBranch } from '@/lib/offers/channel.server'

const db = prisma as any

function req(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/merchant/offers', {
    method,
    body: JSON.stringify(body),
  }) as any
}
const ctx = { params: Promise.resolve({ id: 'offer-1' }) }

const DRAFT = {
  title: 'Great coffee deal',
  offerType: 'flat_rate',
  discountValue: 5,
  startDate: '2026-11-01T00:00:00.000Z',
  endDate: '2026-12-01T00:00:00.000Z',
  redemptionInstructions: 'Show at till',
  saveAsDraft: true,
}

const created = () => db.offerRedemption.create.mock.calls[0][0].data

function existingOffer(status: string, configuration: Record<string, unknown> | null = null) {
  return {
    id: 'offer-1',
    merchantId: 'merchant-1',
    status,
    offerType: 'flat_rate',
    redemption: { redemptionType: 'VIRTUAL_CARD_AUTO_VERIFY', configuration, maxRedemptions: null, daysOfWeek: [] },
    pricing: null,
    content: null,
    review: null,
    capacity: null,
    analytics: null,
  }
}

describe('offer frequency + channel/branches', () => {
  beforeEach(() => {
    db.__reset()
    db.merchantOffer.create.mockResolvedValue({ id: 'offer-1', status: 'DRAFT' })
    db.merchantBranch.findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }])
  })

  describe('frequency → repeatAfterHours', () => {
    it.each<[OfferFrequency, number]>([
      ['DAY', 24],
      ['WEEK', 168],
      ['UNLIMITED', 1 / 60],
    ])('%s is stored as %s hours and reads back', async (freq, hours) => {
      expect(frequencyToRepeatHours(freq)).toBeCloseTo(hours)
      const res = await createOffer(req({ ...DRAFT, channel: 'ONLINE', repeatAfterHours: frequencyToRepeatHours(freq) }))
      expect(res.status).toBe(201)
      expect(created().configuration.repeatAfterHours).toBeCloseTo(hours)
      expect(repeatHoursToFrequency(created().configuration.repeatAfterHours)).toBe(freq)
    })

    it('MONTH round-trips', () => {
      expect(repeatHoursToFrequency(frequencyToRepeatHours('MONTH'))).toBe('MONTH')
    })
  })

  describe('channel → redemptionType', () => {
    it.each([
      ['IN_STORE', 'VIRTUAL_CARD_AUTO_VERIFY'],
      ['ONLINE', 'ONLINE_CODE'],
      ['BOTH', 'ONLINE_CODE'],
    ])('%s creates %s and stores the selection', async (channel, type) => {
      const res = await createOffer(req({ ...DRAFT, channel, allBranches: false, branchIds: ['b1'] }))
      expect(res.status).toBe(201)
      expect(created().redemptionType).toBe(type)
      expect(created().configuration.channel).toBe(channel)
      expect(created().configuration.branchIds).toEqual(channel === 'ONLINE' ? [] : ['b1'])
    })

    it('rejects an unknown channel', async () => {
      const res = await createOffer(req({ ...DRAFT, channel: 'PHONE' }))
      expect(res.status).toBe(400)
    })

    it("rejects a branch that isn't the merchant's", async () => {
      const res = await createOffer(req({ ...DRAFT, channel: 'IN_STORE', allBranches: false, branchIds: ['other'] }))
      expect(res.status).toBe(400)
      expect(JSON.stringify(await res.json())).toContain(INVALID_BRANCHES_MESSAGE)
    })
  })

  // Regression: the channel tests above all save drafts, which skip this rule.
  describe('online branch required for Online/Both (non-draft)', () => {
    const LIVE = {
      ...DRAFT,
      saveAsDraft: false,
      bookingUrl: 'https://shop.example.com',
      redemptionCode: 'SAVE5',
      minimumSpend: 10,
      allBranches: false,
      branchIds: ['b1'],
    }
    const onlineBranch = (present: boolean) =>
      db.merchantBranch.findFirst.mockResolvedValue(present ? { id: 'web' } : null)
    const errorCode = async (res: Response) => (await res.clone().json())?.error?.code

    describe('create (POST /offers)', () => {
      it.each(['ONLINE', 'BOTH'])('%s is rejected without an active online branch', async (channel) => {
        onlineBranch(false)
        const res = await createOffer(req({ ...LIVE, channel }))
        expect(res.status).toBe(400)
        expect(await errorCode(res)).toBe('ONLINE_BRANCH_REQUIRED')
        expect(db.merchantOffer.create).not.toHaveBeenCalled()
      })

      it.each(['ONLINE', 'BOTH'])('%s passes the check with an active online branch', async (channel) => {
        onlineBranch(true)
        const res = await createOffer(req({ ...LIVE, channel }))
        expect(await errorCode(res)).not.toBe('ONLINE_BRANCH_REQUIRED')
      })

      it('IN_STORE does not need an online branch', async () => {
        onlineBranch(false)
        const res = await createOffer(req({ ...LIVE, channel: 'IN_STORE' }))
        expect(await errorCode(res)).not.toBe('ONLINE_BRANCH_REQUIRED')
      })

      it('looks only for an ACTIVE, non-deleted ONLINE branch of this merchant', async () => {
        onlineBranch(false)
        await createOffer(req({ ...LIVE, channel: 'ONLINE' }))
        expect(db.merchantBranch.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              merchantId: 'merchant-1',
              branchType: 'ONLINE',
              status: 'ACTIVE',
              isActive: true,
              deletedAt: null,
            }),
          }),
        )
      })

      it('drafts may still be saved without an online branch', async () => {
        onlineBranch(false)
        const res = await createOffer(req({ ...DRAFT, channel: 'ONLINE' }))
        expect(res.status).toBe(201)
      })
    })

    describe('submit (POST /offers/:id/submit)', () => {
      const draftWith = (redemptionType: string) => ({
        ...existingOffer('DRAFT'),
        title: 'Great coffee deal',
        merchant: { id: 'merchant-1', businessName: 'Merchant', categoryId: 'cat-1' },
        redemption: { redemptionType, configuration: {}, maxRedemptions: null, daysOfWeek: [] },
      })

      it.each(['ONLINE', 'BOTH'])('%s is rejected without an active online branch', async (channel) => {
        db.merchantOffer.findFirst.mockResolvedValue(draftWith('VIRTUAL_CARD_AUTO_VERIFY'))
        onlineBranch(false)
        const res = await submitOffer(req({ channel, allBranches: false, branchIds: ['b1'] }), ctx)
        expect(res.status).toBe(400)
        expect(await errorCode(res)).toBe('ONLINE_BRANCH_REQUIRED')
      })

      it('existing ONLINE_CODE draft submitted without a channel is rejected', async () => {
        db.merchantOffer.findFirst.mockResolvedValue(draftWith('ONLINE_CODE'))
        onlineBranch(false)
        const res = await submitOffer(req({}), ctx)
        expect(await errorCode(res)).toBe('ONLINE_BRANCH_REQUIRED')
      })

      it('ONLINE passes the check with an active online branch', async () => {
        db.merchantOffer.findFirst.mockResolvedValue(draftWith('VIRTUAL_CARD_AUTO_VERIFY'))
        onlineBranch(true)
        const res = await submitOffer(req({ channel: 'ONLINE' }), ctx)
        expect(await errorCode(res)).not.toBe('ONLINE_BRANCH_REQUIRED')
      })

      it('IN_STORE does not need an online branch', async () => {
        db.merchantOffer.findFirst.mockResolvedValue(draftWith('VIRTUAL_CARD_AUTO_VERIFY'))
        onlineBranch(false)
        const res = await submitOffer(req({ channel: 'IN_STORE', allBranches: false, branchIds: ['b1'] }), ctx)
        expect(await errorCode(res)).not.toBe('ONLINE_BRANCH_REQUIRED')
      })
    })
  })

  describe('PATCH on an offer in review', () => {
    it('requires all branches or at least one', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer('AWAITING_APPROVAL'))
      const res = await editOffer(req({ channel: 'IN_STORE', allBranches: false, branchIds: [] }, 'PATCH'), ctx)
      expect(res.status).toBe(400)
      expect(JSON.stringify(await res.json())).toContain(BRANCHES_REQUIRED_MESSAGE)
    })

    it('allows an incomplete selection on a draft', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer('DRAFT'))
      const res = await editOffer(req({ channel: 'IN_STORE', allBranches: false, branchIds: [] }, 'PATCH'), ctx)
      expect(res.status).not.toBe(400)
    })
  })

  describe('branch links to live offers', () => {
    const live = (channel: string, extra: Record<string, unknown> = {}) => ({
      id: `o-${channel}`,
      title: `${channel} offer`,
      redemption: { redemptionType: 'ONLINE_CODE', configuration: { channel, ...extra } },
    })

    it('in-store branch picked by an offer is linked', async () => {
      db.merchantOffer.findMany.mockResolvedValue([live('IN_STORE', { allBranches: false, branchIds: ['b1'] })])
      const linked = await getLiveOffersLinkedToBranch('merchant-1', { id: 'b1', branchType: 'IN_STORE' })
      expect(linked).toHaveLength(1)
    })

    it('all-branches offer only locks the last active in-store branch', async () => {
      db.merchantOffer.findMany.mockResolvedValue([live('BOTH', { allBranches: true })])
      db.merchantBranch.count.mockResolvedValue(2)
      expect(await getLiveOffersLinkedToBranch('merchant-1', { id: 'b1', branchType: 'IN_STORE' })).toHaveLength(0)
      db.merchantBranch.count.mockResolvedValue(0)
      expect(await getLiveOffersLinkedToBranch('merchant-1', { id: 'b2', branchType: 'IN_STORE' })).toHaveLength(1)
    })

    it('online branch is linked to Online/Both offers only', async () => {
      db.merchantOffer.findMany.mockResolvedValue([live('ONLINE'), live('BOTH'), live('IN_STORE')])
      const linked = await getLiveOffersLinkedToBranch('merchant-1', { id: 'web', branchType: 'ONLINE' })
      expect(linked.map((o) => o.id)).toEqual(['o-ONLINE', 'o-BOTH'])
    })
  })
})
