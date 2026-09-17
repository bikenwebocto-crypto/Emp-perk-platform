import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findUnique: vi.fn() },
    notificationEvent: { findFirst: vi.fn() },
    redemption: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/lib/offer-visibility', () => ({ isOfferVisibleToEmployees: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { isOfferVisibleToEmployees } from '@/lib/offer-visibility'
import { GET } from '@/app/api/mobile/offers/[id]/route'

function getRequest(id = 'offer-1') {
  return new Request(`http://localhost/api/mobile/offers/${id}`) as any
}
function ctx(id = 'offer-1') {
  return { params: Promise.resolve({ id }) }
}

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any

describe('GET /api/mobile/offers/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(isOfferVisibleToEmployees as any).mockResolvedValue({ visible: true, reason: null })
    ;(prisma.notificationEvent.findFirst as any).mockResolvedValue(null)
    ;(prisma.redemption.findFirst as any).mockResolvedValue(null)
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await GET(getRequest(), ctx())

    expect(res.status).toBe(401)
    expect(prisma.merchantOffer.findUnique).not.toHaveBeenCalled()
  })

  it('returns 404 when the offer does not exist', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findUnique as any).mockResolvedValue(null)

    const res = await GET(getRequest('missing'), ctx('missing'))

    expect(res.status).toBe(404)
  })

  it('returns offer detail with isSaved/isRedeemed and visibility flags', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findUnique as any).mockResolvedValue({
      id: 'offer-1',
      title: 'Offer 1',
      offerType: 'PERCENTAGE',
      status: 'LIVE',
      startDate: new Date(),
      endDate: new Date(),
      isFeatured: false,
      isExclusive: false,
      content: { description: 'd', shortDescription: 's', termsAndConditions: 't', imageUrls: [] },
      pricing: { configuration: { percent: 10 } },
      redemption: { redemptionType: 'IN_STORE_QR', configuration: {}, daysOfWeek: null },
      capacity: { maxRedemptions: 100, redeemedCount: 5 },
      analytics: { viewCount: 1, clickCount: 2, saveCount: 3 },
      merchant: { id: 'm-1', businessName: 'M', logoUrl: null, coverImageUrl: null, website: null, description: null, averageRating: 4, totalRedemptions: 10, category: null, branches: [] },
      _count: { redemptions: 5 },
    })
    ;(isOfferVisibleToEmployees as any).mockResolvedValue({ visible: true, reason: 'OK' })
    ;(prisma.notificationEvent.findFirst as any).mockResolvedValue({ id: 'notif-1' })
    ;(prisma.redemption.findFirst as any).mockResolvedValue(null)

    const res = await GET(getRequest(), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('offer-1')
    expect(body.data.isSaved).toBe(true)
    expect(body.data.isRedeemed).toBe(false)
    expect(body.data.isVisible).toBe(true)
    expect(body.data.redemptionCount).toBe(5)
  })
})
