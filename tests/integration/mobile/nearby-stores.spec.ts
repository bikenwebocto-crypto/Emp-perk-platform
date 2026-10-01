import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantBranch: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/nearby-stores/route'

function getRequest(query = '') {
  return new Request(`http://localhost/api/mobile/nearby-stores${query}`) as any
}

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any

describe('GET /api/mobile/nearby-stores', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.merchantBranch.findMany as any).mockResolvedValue([])
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await GET(getRequest('?latitude=1&longitude=1'))

    expect(res.status).toBe(401)
    expect(prisma.merchantBranch.findMany).not.toHaveBeenCalled()
  })

  it('returns 400 when latitude/longitude are missing', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await GET(getRequest())

    expect(res.status).toBe(400)
  })

  it('returns nearby branches sorted by distance within the radius', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantBranch.findMany as any).mockResolvedValue([
      {
        id: 'branch-far',
        name: 'Far Branch',
        merchantId: 'm-1',
        merchant: { businessName: 'Far Co', logoUrl: null, category: null },
        addressLine1: 'A', addressLine2: null, city: 'City', state: null, postalCode: '000', country: 'US',
        latitude: 10, longitude: 10,
      },
      {
        id: 'branch-near',
        name: 'Near Branch',
        merchantId: 'm-2',
        merchant: { businessName: 'Near Co', logoUrl: null, category: { name: 'Food' } },
        addressLine1: 'B', addressLine2: null, city: 'City', state: null, postalCode: '111', country: 'US',
        latitude: 0.01, longitude: 0.01,
      },
    ])

    const res = await GET(getRequest('?latitude=0&longitude=0&radius=5'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].branchId).toBe('branch-near')
    expect(body.data[0].category).toBe('Food')
  })

  it('returns 400 for an out-of-range latitude', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await GET(getRequest('?latitude=200&longitude=0'))

    expect(res.status).toBe(400)
  })
})
