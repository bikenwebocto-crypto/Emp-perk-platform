import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchant: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/brands/[id]/route'

function getRequest(id: string) {
  return new Request(`http://localhost/api/mobile/brands/${id}`) as any
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

const employee = { id: 'emp-1' }

describe('GET /api/mobile/brands/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the auth helper response when unauthenticated', async () => {
    const unauthorizedResponse = NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Bearer token' } },
      { status: 401 },
    )
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: unauthorizedResponse })

    const res = await GET(getRequest('merchant-1'), params('merchant-1'))

    expect(res.status).toBe(401)
    expect(prisma.merchant.findFirst).not.toHaveBeenCalled()
  })

  it('returns 404 when the merchant is missing, inactive, or soft-deleted', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })
    ;(prisma.merchant.findFirst as any).mockResolvedValue(null)

    const res = await GET(getRequest('missing-merchant'), params('missing-merchant'))

    expect(res.status).toBe(404)
    expect(prisma.merchant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'missing-merchant', status: 'ACTIVE', deletedAt: null },
      }),
    )
  })

  it('returns the merchant profile with branches and live offers on success', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })
    const merchant = {
      id: 'merchant-1',
      businessName: 'Acme Coffee',
      category: { id: 'cat-1', name: 'Food', icon: 'coffee' },
      branches: [{ id: 'branch-1', name: 'Main St', isPrimary: true }],
      offers: [{ id: 'offer-1', title: '20% off' }],
      _count: { offers: 1, branches: 1 },
    }
    ;(prisma.merchant.findFirst as any).mockResolvedValue(merchant)

    const res = await GET(getRequest('merchant-1'), params('merchant-1'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.id).toBe('merchant-1')
    expect(json.data.offers).toHaveLength(1)
  })
})
