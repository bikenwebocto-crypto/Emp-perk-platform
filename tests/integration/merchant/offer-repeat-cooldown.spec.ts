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
          get: (t, p: string) => (t[p] ??= vi.fn(async () => null)),
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

const db = prisma as any

function req(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/merchant/offers', {
    method,
    body: JSON.stringify(body),
  }) as any
}
const ctx = { params: Promise.resolve({ id: 'offer-1' }) }

const CREATE_BODY = {
  title: 'Great coffee deal',
  offerType: 'flat_rate',
  discountValue: 5,
  startDate: '2026-11-01T00:00:00.000Z',
  endDate: '2026-12-01T00:00:00.000Z',
  redemptionType: 'IN_STORE_QR',
  redemptionInstructions: 'Show at till',
  saveAsDraft: true,
}

function existingOffer(configuration: Record<string, unknown> | null) {
  return {
    id: 'offer-1',
    merchantId: 'merchant-1',
    status: 'DRAFT',
    offerType: 'flat_rate',
    redemption: { redemptionType: 'IN_STORE_QR', configuration, maxRedemptions: null, daysOfWeek: [] },
    pricing: null,
    content: null,
    review: null,
    capacity: null,
    analytics: null,
  }
}

function createdRedemptionConfig() {
  return db.offerRedemption.create.mock.calls[0][0].data.configuration
}
function upsertedRedemption() {
  return db.offerRedemption.upsert.mock.calls[0]?.[0]
}

describe('offer repeatAfterHours (create / edit)', () => {
  beforeEach(() => {
    db.__reset()
    db.merchantOffer.create.mockResolvedValue({ id: 'offer-1', status: 'DRAFT' })
  })

  describe('POST /api/merchant/offers', () => {
    it('stores repeatAfterHours alongside the existing redemption config keys', async () => {
      const res = await createOffer(req({ ...CREATE_BODY, repeatAfterHours: 24 }))

      expect(res.status).toBe(201)
      expect(createdRedemptionConfig()).toEqual({ instructions: 'Show at till', repeatAfterHours: 24 })
    })

    it('omits repeatAfterHours when not sent (or sent empty)', async () => {
      expect((await createOffer(req(CREATE_BODY))).status).toBe(201)
      expect(createdRedemptionConfig()).toEqual({ instructions: 'Show at till' })

      db.__reset()
      db.merchantOffer.create.mockResolvedValue({ id: 'offer-1', status: 'DRAFT' })
      expect((await createOffer(req({ ...CREATE_BODY, repeatAfterHours: null }))).status).toBe(201)
      expect(createdRedemptionConfig()).toEqual({ instructions: 'Show at till' })
    })

    it.each([0, -3, 'abc', '24', true, {}])('rejects repeatAfterHours=%j with 400', async (value) => {
      const res = await createOffer(req({ ...CREATE_BODY, repeatAfterHours: value }))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error.message).toMatch(/repeatAfterHours/)
      expect(db.merchantOffer.create).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /api/merchant/offers/[id]', () => {
    it('changes the value and keeps the other config keys', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ code: 'ABC', repeatAfterHours: 24 }))

      const res = await editOffer(req({ repeatAfterHours: 48 }, 'PATCH'), ctx)

      expect(res.status).toBe(200)
      expect(upsertedRedemption().update.configuration).toEqual({ code: 'ABC', repeatAfterHours: 48 })
    })

    it('removes the key when sent as null or empty', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ code: 'ABC', repeatAfterHours: 24 }))
      await editOffer(req({ repeatAfterHours: null }, 'PATCH'), ctx)
      expect(upsertedRedemption().update.configuration).toEqual({ code: 'ABC' })

      db.__reset()
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ code: 'ABC', repeatAfterHours: 24 }))
      await editOffer(req({ repeatAfterHours: '' }, 'PATCH'), ctx)
      expect(upsertedRedemption().update.configuration).toEqual({ code: 'ABC' })
    })

    it('writes a null configuration when the cleared key was the only one', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ repeatAfterHours: 24 }))

      await editOffer(req({ repeatAfterHours: null }, 'PATCH'), ctx)

      expect(upsertedRedemption().update.configuration).toBe(Prisma.DbNull)
    })

    it('leaves the configuration alone when the field is not sent', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ code: 'ABC', repeatAfterHours: 24 }))

      const res = await editOffer(req({ title: 'New title here' }, 'PATCH'), ctx)

      expect(res.status).toBe(200)
      expect(db.offerRedemption.upsert).not.toHaveBeenCalled()
    })

    it('rejects an invalid value with 400', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ code: 'ABC' }))

      const res = await editOffer(req({ repeatAfterHours: -1 }, 'PATCH'), ctx)

      expect(res.status).toBe(400)
      expect((await res.json()).error.message).toMatch(/repeatAfterHours/)
      expect(db.offerRedemption.upsert).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/merchant/offers/[id]/submit', () => {
    it('rejects an invalid value with 400', async () => {
      db.merchantOffer.findFirst.mockResolvedValue({
        ...existingOffer({ code: 'ABC' }),
        merchant: { id: 'merchant-1', businessName: 'Merchant', categoryId: 'cat-1' },
      })

      const res = await submitOffer(req({ repeatAfterHours: 'soon' }), ctx)

      expect(res.status).toBe(400)
      expect((await res.json()).error.message).toMatch(/repeatAfterHours/)
      expect(db.offerRedemption.upsert).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/merchant/offers/[id]', () => {
    it('returns repeatAfterHours for the edit form', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ code: 'ABC', repeatAfterHours: 12 }))

      const body = await (await getOffer(req(undefined, 'GET'), ctx)).json()

      expect(body.data.repeatAfterHours).toBe(12)
    })

    it('returns null when no cooldown is set', async () => {
      db.merchantOffer.findFirst.mockResolvedValue(existingOffer(null))

      const body = await (await getOffer(req(undefined, 'GET'), ctx)).json()

      expect(body.data.repeatAfterHours).toBeNull()
    })
  })
})
