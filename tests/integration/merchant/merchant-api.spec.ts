import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/merchant-session', () => ({ getMerchantFromSession: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { GET } from '@/app/api/merchant/offers/route'

function getRequest(query = '') {
  return new Request(`http://localhost/api/merchant/offers${query}`) as any
}

describe('GET /api/merchant/offers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.merchantOffer.findMany as any).mockResolvedValue([])
    ;(prisma.merchantOffer.count as any).mockResolvedValue(0)
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(null)
  })

  it('returns 401 without a merchant session', async () => {
    ;(getMerchantFromSession as any).mockResolvedValue(null)

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
  })

  it('scopes the offer list to the authenticated merchant and excludes soft-deleted offers', async () => {
    ;(getMerchantFromSession as any).mockResolvedValue({ id: 'merchant-1' })

    await GET(getRequest())

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.where.merchantId).toBe('merchant-1')
    expect(args.where.deletedAt).toBeNull()
  })

  it('filters by status when provided', async () => {
    ;(getMerchantFromSession as any).mockResolvedValue({ id: 'merchant-1' })

    await GET(getRequest('?status=LIVE'))

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.where.status).toBe('LIVE')
  })

  it('maps the "history" scope to REPLACED/EXPIRED/ARCHIVED statuses', async () => {
    ;(getMerchantFromSession as any).mockResolvedValue({ id: 'merchant-1' })

    await GET(getRequest('?scope=history'))

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.where.status).toEqual({ in: ['REPLACED', 'EXPIRED', 'ARCHIVED'] })
  })

  it('caps the offer-selector search results at 10', async () => {
    ;(getMerchantFromSession as any).mockResolvedValue({ id: 'merchant-1' })

    await GET(getRequest('?search=coffee&pageSize=100'))

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.take).toBeLessThanOrEqual(10)
  })
})
