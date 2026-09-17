import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationEvent: { findMany: vi.fn(), count: vi.fn() },
    merchantOffer: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/profile/saved-offers/route'

function getRequest(query = '') {
  return new Request(`http://localhost/api/mobile/profile/saved-offers${query}`) as any
}

const AUTH_OK = {
  ok: true,
  user: { id: 'user-1' },
  account: { id: 'acc-1' },
  employee: { id: 'emp-1', companyId: 'company-1' },
  company: { id: 'company-1' },
}

describe('GET /api/mobile/profile/saved-offers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    })

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
  })

  it('returns saved offers scoped to the employee, joined with live offer data', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.notificationEvent.findMany as any).mockResolvedValue([
      { id: 'evt-1', referenceId: 'offer-1', createdAt: new Date('2026-01-01') },
    ])
    ;(prisma.notificationEvent.count as any).mockResolvedValue(1)
    ;(prisma.merchantOffer.findMany as any).mockResolvedValue([
      {
        id: 'offer-1',
        title: 'Lunch Deal',
        status: 'LIVE',
        endDate: new Date('2026-12-31'),
        content: { imageUrls: ['lunch.png'] },
        merchant: { id: 'merchant-1', businessName: 'Diner', logoUrl: null },
      },
    ])

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    const [notifArgs] = (prisma.notificationEvent.findMany as any).mock.calls[0]
    expect(notifArgs.where.employeeId).toBe('emp-1')
    expect(notifArgs.where.referenceType).toBe('saved_offer')
    expect(body.data).toHaveLength(1)
    expect(body.data[0].offer.id).toBe('offer-1')
    expect(body.data[0].offer.image).toBe('lunch.png')
  })

  it('drops saved entries whose offer no longer exists or was deleted', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.notificationEvent.findMany as any).mockResolvedValue([
      { id: 'evt-1', referenceId: 'offer-deleted', createdAt: new Date() },
    ])
    ;(prisma.notificationEvent.count as any).mockResolvedValue(1)
    ;(prisma.merchantOffer.findMany as any).mockResolvedValue([])

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(0)
  })
})
