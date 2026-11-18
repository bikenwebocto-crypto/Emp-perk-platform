import { describe, it, expect, vi, beforeEach } from 'vitest'

// Backend enforcement of the flat-offer rule: 0 < discount < minimum spend.
// Every case here must be rejected with 400 BEFORE anything is written.

vi.mock('@/lib/prisma', () => {
  const model = () => ({
    findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(),
    create: vi.fn(), update: vi.fn(), upsert: vi.fn(), updateMany: vi.fn(),
  })
  return {
    prisma: {
      merchantOffer: model(),
      category: model(),
      $transaction: vi.fn(),
    },
  }
})
vi.mock('@/lib/merchant-session', () => ({ getMerchantFromSession: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/services/business-notification.service', () => ({
  BUSINESS_NOTIFICATION_TEMPLATES: {},
  channels: vi.fn(),
  publishBusinessNotification: vi.fn(),
  publishBusinessToAdmins: vi.fn(),
}))
vi.mock('@/lib/offer-expiry-trigger', () => ({ triggerOfferExpiry: vi.fn() }))
vi.mock('@/lib/offer-qr', () => ({ ensureOfferQRCode: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { getCurrentUser } from '@/lib/supabase/server'
import { POST as createOffer } from '@/app/api/merchant/offers/route'
import { PATCH as updateOffer } from '@/app/api/merchant/offers/[id]/route'
import { POST as submitOffer } from '@/app/api/merchant/offers/[id]/submit/route'
import { FLAT_DISCOUNT_MESSAGES as M, PERCENT_DISCOUNT_MESSAGES as P } from '@/lib/offers/flat-discount'

const db = prisma as any
const merchant = { id: 'merchant-1', categoryId: 'cat-1', businessName: 'Biz' }
const offerId = '33333333-3333-4333-8333-333333333333'
const ctx = { params: Promise.resolve({ id: offerId }) }

function req(method: string, url: string, body: unknown) {
  return new Request(`http://localhost${url}`, { method, body: JSON.stringify(body) }) as any
}

const baseCreate = {
  title: 'Ten off dinner',
  offerType: 'flat_rate',
  startDate: '2026-12-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
  redemptionType: 'VIRTUAL_CARD_AUTO_VERIFY',
  termsAndConditions: 'One per table',
  categoryId: 'cat-1',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
}

function existingOffer(config: Record<string, unknown>, status = 'DRAFT') {
  return {
    id: offerId,
    title: 'Ten off dinner',
    status,
    offerType: 'flat_rate',
    isForever: false,
    startDate: new Date('2026-12-01'),
    endDate: new Date('2026-12-31'),
    pricing: { configuration: config },
    content: null,
    redemption: null,
    review: null,
    merchant,
  }
}

function expectNoWrites() {
  expect(db.merchantOffer.create).not.toHaveBeenCalled()
  expect(db.merchantOffer.update).not.toHaveBeenCalled()
  expect(db.$transaction).not.toHaveBeenCalled()
}

async function expect400(res: Response, message: string) {
  expect(res.status).toBe(400)
  const json = await res.json()
  expect(json.success).toBe(false)
  expect(json.error.message).toBe(message)
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(getMerchantFromSession as any).mockResolvedValue(merchant)
  ;(getCurrentUser as any).mockResolvedValue({ userType: 'merchant' })
})

describe('POST /api/merchant/offers (create) — flat discount', () => {
  it.each([
    [{ minimumSpend: 50 }, M.discountRequired],
    [{ discountValue: 10 }, M.minSpendRequired],
    [{ discountValue: 0, minimumSpend: 50 }, M.discountNotPositive],
    [{ discountValue: -10, minimumSpend: 50 }, M.discountNotPositive],
    [{ discountValue: 10, minimumSpend: 0 }, M.minSpendNotPositive],
    [{ discountValue: 20, minimumSpend: 20 }, M.minSpendNotGreater],
    [{ discountValue: 100, minimumSpend: 100 }, M.minSpendNotGreater],
    [{ discountValue: 50, minimumSpend: 30 }, M.minSpendNotGreater],
    [{ discountValue: '10abc', minimumSpend: 50 }, M.discountInvalid],
  ])('rejects %o', async (amounts, message) => {
    const res = await createOffer(req('POST', '/api/merchant/offers', { ...baseCreate, ...amounts }))
    await expect400(res, message)
    expectNoWrites()
  })

  it('rejects an invalid combination even when saved as a draft', async () => {
    const res = await createOffer(
      req('POST', '/api/merchant/offers', { ...baseCreate, discountValue: 100, minimumSpend: 100, saveAsDraft: true }),
    )
    await expect400(res, M.minSpendNotGreater)
    expectNoWrites()
  })

  it.each([
    [{ discountPercent: 95, minimumSpend: 50, discountMax: 10 }, P.percentRange],
    [{ discountPercent: 20, minimumSpend: 50, discountMax: 50 }, P.maxNotBelowMinSpend],
    [{ discountPercent: 20, minimumSpend: 50, discountMax: 5 }, P.maxBelowPercentOfMinSpend],
    [{ discountPercent: 20, discountMax: 10 }, P.minSpendRequired],
  ])('rejects percentage offer %o', async (amounts, message) => {
    const res = await createOffer(
      req('POST', '/api/merchant/offers', { ...baseCreate, offerType: 'percentage', ...amounts }),
    )
    await expect400(res, message)
    expectNoWrites()
  })

  it('rejects a percentage edit that pushes the cap to the min spend', async () => {
    db.merchantOffer.findFirst.mockResolvedValue({
      ...existingOffer({ percent: 20, minimumSpend: 50, maximumDiscount: 10 }),
      offerType: 'percentage',
    })
    const res = await updateOffer(req('PATCH', `/api/merchant/offers/${offerId}`, { discountMax: 50 }), ctx)
    await expect400(res, P.maxNotBelowMinSpend)
    expectNoWrites()
  })

  it.each([
    [10, 50],
    [10, 100],
    [99.99, 100],
  ])('lets a valid combination (%s / %s) past the flat gate', async (d, m) => {
    const res = await createOffer(
      req('POST', '/api/merchant/offers', { ...baseCreate, discountValue: d, minimumSpend: m }),
    )
    const json = await res.json().catch(() => ({}))
    expect(Object.values(M)).not.toContain(json?.error?.message)
  })
})

describe('PATCH /api/merchant/offers/[id] (edit) — flat discount', () => {
  it('rejects raising the discount to equal the stored minimum spend', async () => {
    db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ amount: 10, minimumSpend: 50 }))
    const res = await updateOffer(req('PATCH', `/api/merchant/offers/${offerId}`, { discountValue: 50 }), ctx)
    await expect400(res, M.minSpendNotGreater)
    expectNoWrites()
  })

  it('rejects lowering the minimum spend below the stored discount', async () => {
    db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ amount: 10, minimumSpend: 50 }))
    const res = await updateOffer(req('PATCH', `/api/merchant/offers/${offerId}`, { minimumSpend: 5 }), ctx)
    await expect400(res, M.minSpendNotGreater)
    expectNoWrites()
  })

  it('rejects negative values', async () => {
    db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ amount: 10, minimumSpend: 50 }))
    const res = await updateOffer(req('PATCH', `/api/merchant/offers/${offerId}`, { discountValue: -1 }), ctx)
    await expect400(res, M.discountNotPositive)
    expectNoWrites()
  })

  it('requires both fields once the offer is awaiting approval', async () => {
    db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ amount: 10 }, 'AWAITING_APPROVAL'))
    const res = await updateOffer(req('PATCH', `/api/merchant/offers/${offerId}`, { title: 'Ten off dinner!' }), ctx)
    await expect400(res, M.minSpendRequired)
    expectNoWrites()
  })

  it('lets a valid edit past the flat gate', async () => {
    db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ amount: 10, minimumSpend: 50 }))
    const res = await updateOffer(
      req('PATCH', `/api/merchant/offers/${offerId}`, { discountValue: 20, minimumSpend: 80 }),
      ctx,
    )
    const json = await res.json().catch(() => ({}))
    expect(Object.values(M)).not.toContain(json?.error?.message)
  })
})

describe('POST /api/merchant/offers/[id]/submit — flat discount', () => {
  it('rejects submitting a stored 100% discount', async () => {
    db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ amount: 20, minimumSpend: 20 }))
    const res = await submitOffer(req('POST', `/api/merchant/offers/${offerId}/submit`, {}), ctx)
    await expect400(res, M.minSpendNotGreater)
    expectNoWrites()
  })

  it('rejects submitting without a minimum spend', async () => {
    db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ amount: 20 }))
    const res = await submitOffer(req('POST', `/api/merchant/offers/${offerId}/submit`, {}), ctx)
    await expect400(res, M.minSpendRequired)
    expectNoWrites()
  })

  it('rejects an invalid combination sent in the submit body', async () => {
    db.merchantOffer.findFirst.mockResolvedValue(existingOffer({ amount: 10, minimumSpend: 50 }))
    const res = await submitOffer(
      req('POST', `/api/merchant/offers/${offerId}/submit`, { discountValue: 60 }),
      ctx,
    )
    await expect400(res, M.minSpendNotGreater)
    expectNoWrites()
  })
})
