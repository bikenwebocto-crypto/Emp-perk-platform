import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchant: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/brands/route'

function getRequest(query = '') {
  return new Request(`http://localhost/api/mobile/brands${query}`) as any
}

const employee = { id: 'emp-1' }

describe('GET /api/mobile/brands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.merchant.findMany as any).mockResolvedValue([])
    ;(prisma.merchant.count as any).mockResolvedValue(0)
  })

  it('returns the auth helper response when unauthenticated', async () => {
    const unauthorizedResponse = NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Bearer token' } },
      { status: 401 },
    )
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: unauthorizedResponse })

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
    expect(prisma.merchant.findMany).not.toHaveBeenCalled()
  })

  it('only lists ACTIVE, non-deleted merchants with an active branch, and applies category filter', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })

    await GET(getRequest('?categoryId=cat-1'))

    const [args] = (prisma.merchant.findMany as any).mock.calls[0]
    expect(args.where.status).toBe('ACTIVE')
    expect(args.where.deletedAt).toBeNull()
    expect(args.where.branches.some.isActive).toBe(true)
    expect(args.where.categoryId).toBe('cat-1')
  })

  it('applies a case-insensitive business-name search', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })

    await GET(getRequest('?q=coffee'))

    const [args] = (prisma.merchant.findMany as any).mock.calls[0]
    expect(args.where.businessName).toEqual({ contains: 'coffee', mode: 'insensitive' })
  })

  it('caps pageSize at 50 and returns pagination meta', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })
    ;(prisma.merchant.count as any).mockResolvedValue(120)

    const res = await GET(getRequest('?pageSize=500&page=2'))
    const json = await res.json()

    const [args] = (prisma.merchant.findMany as any).mock.calls[0]
    expect(args.take).toBeLessThanOrEqual(50)
    expect(json.success).toBe(true)
    expect(json.meta).toEqual({ page: 2, pageSize: 50, total: 120, totalPages: 3 })
  })

  it('sorts results by distance when lat/lng are supplied', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })
    ;(prisma.merchant.findMany as any).mockResolvedValue([
      {
        id: 'm-far',
        businessName: 'Far Shop',
        branches: [{ latitude: 10, longitude: 10, isPrimary: true }],
      },
      {
        id: 'm-near',
        businessName: 'Near Shop',
        branches: [{ latitude: 0.01, longitude: 0.01, isPrimary: true }],
      },
    ])

    const res = await GET(getRequest('?lat=0&lng=0'))
    const json = await res.json()

    expect(json.data[0].merchant.id).toBe('m-near')
    expect(json.data[0].distance).toBeLessThan(json.data[1].distance)
  })
})
