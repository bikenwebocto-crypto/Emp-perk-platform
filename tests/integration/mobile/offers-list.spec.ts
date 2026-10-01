import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findMany: vi.fn(), count: vi.fn() },
    notificationEvent: { findMany: vi.fn() },
    redemption: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/offers/route'

function getRequest(query = '') {
  return new Request(`http://localhost/api/mobile/offers${query}`) as any
}

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any

describe('GET /api/mobile/offers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.merchantOffer.findMany as any).mockResolvedValue([])
    ;(prisma.merchantOffer.count as any).mockResolvedValue(0)
    ;(prisma.notificationEvent.findMany as any).mockResolvedValue([])
    ;(prisma.redemption.findMany as any).mockResolvedValue([])
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
    expect(prisma.merchantOffer.findMany).not.toHaveBeenCalled()
  })

  it('only returns LIVE offers from ACTIVE merchants with an active branch', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    await GET(getRequest())

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.where.status).toBe('LIVE')
    expect(args.where.merchant.status).toBe('ACTIVE')
    expect(args.where.merchant.branches.some.isActive).toBe(true)
  })

  it('caps pageSize at 50', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    await GET(getRequest('?pageSize=500'))

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.take).toBeLessThanOrEqual(50)
  })

  it('maps isSaved and isRedeemed flags per offer based on the employee history', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findMany as any).mockResolvedValue([
      {
        id: 'offer-1',
        title: 'Offer 1',
        offerType: 'PERCENTAGE',
        startDate: new Date(),
        endDate: new Date(),
        isFeatured: false,
        isExclusive: false,
        createdAt: new Date(),
        content: { description: 'd', shortDescription: 's', imageUrls: [] },
        pricing: { configuration: { percent: 10 } },
        redemption: { redemptionType: 'IN_STORE_QR', configuration: {} },
        merchant: { id: 'm-1', businessName: 'Merchant', logoUrl: null, averageRating: 4, city: 'C', state: 'S', category: null },
        _count: { redemptions: 2 },
      },
      {
        id: 'offer-2',
        title: 'Offer 2',
        offerType: 'FLAT',
        startDate: new Date(),
        endDate: new Date(),
        isFeatured: false,
        isExclusive: false,
        createdAt: new Date(),
        content: { description: 'd', shortDescription: 's', imageUrls: [] },
        pricing: { configuration: { amount: 5 } },
        redemption: { redemptionType: 'ONLINE_CODE', configuration: {} },
        merchant: { id: 'm-2', businessName: 'Merchant 2', logoUrl: null, averageRating: 3, city: 'C', state: 'S', category: null },
        _count: { redemptions: 0 },
      },
    ])
    ;(prisma.merchantOffer.count as any).mockResolvedValue(2)
    ;(prisma.notificationEvent.findMany as any).mockResolvedValue([{ referenceId: 'offer-1' }])
    ;(prisma.redemption.findMany as any).mockResolvedValue([{ offerId: 'offer-2' }])

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    const byId = Object.fromEntries(body.data.map((o: any) => [o.id, o]))
    expect(byId['offer-1'].isSaved).toBe(true)
    expect(byId['offer-1'].isRedeemed).toBe(false)
    expect(byId['offer-2'].isSaved).toBe(false)
    expect(byId['offer-2'].isRedeemed).toBe(true)
    expect(body.meta).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 })
  })
})
