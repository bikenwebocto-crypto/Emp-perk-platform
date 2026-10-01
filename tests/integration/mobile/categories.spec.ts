import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    category: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/categories/route'

function getRequest() {
  return new Request('http://localhost/api/mobile/categories') as any
}

const employee = { id: 'emp-1' }

describe('GET /api/mobile/categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the auth helper response when unauthenticated', async () => {
    const unauthorizedResponse = NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Bearer token' } },
      { status: 401 },
    )
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: unauthorizedResponse })

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
    expect(prisma.category.findMany).not.toHaveBeenCalled()
  })

  it('returns only active categories ordered by displayOrder then name', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })
    const categories = [
      { id: 'cat-1', name: 'Food', slug: 'food', description: null, icon: 'utensils' },
    ]
    ;(prisma.category.findMany as any).mockResolvedValue(categories)

    const res = await GET(getRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true, data: categories })
    const [args] = (prisma.category.findMany as any).mock.calls[0]
    expect(args.where).toEqual({ isActive: true })
    expect(args.orderBy).toEqual([{ displayOrder: 'asc' }, { name: 'asc' }])
  })

  it('falls back to an empty list when the query fails (safeQuery fallback)', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })
    ;(prisma.category.findMany as any).mockRejectedValue(new Error('db down'))

    const res = await GET(getRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true, data: [] })
  })
})
