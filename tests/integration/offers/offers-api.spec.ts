import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findMany: vi.fn(), count: vi.fn() },
    bannerBooking: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock('@/lib/employee-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/employee-session')>('@/lib/employee-session')
  return { ...actual, getEmployeeFromSession: vi.fn() }
})
vi.mock('@/services/offer-mapper.service', () => ({ mapOfferRow: vi.fn((row) => row) }))

import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession } from '@/lib/employee-session'
import { GET } from '@/app/api/employee/offers/route'

function getRequest(query = '') {
  return new Request(`http://localhost/api/employee/offers${query}`) as any
}

describe('GET /api/employee/offers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.merchantOffer.findMany as any).mockResolvedValue([])
    ;(prisma.merchantOffer.count as any).mockResolvedValue(0)
  })

  it('returns 401 without an employee session', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue(null)

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
  })

  it('returns a company-inactive response for a suspended company', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ inactive: true, companyStatus: 'SUSPENDED' })

    const res = await GET(getRequest())

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(prisma.merchantOffer.findMany).not.toHaveBeenCalled()
  })

  it('only returns LIVE offers from ACTIVE merchants with an active branch', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })

    await GET(getRequest())

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.where.status).toBe('LIVE')
    expect(args.where.merchant.status).toBe('ACTIVE')
    expect(args.where.merchant.branches.some.isActive).toBe(true)
  })

  it('applies a case-insensitive search across title, description, and merchant name', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })

    await GET(getRequest('?q=coffee'))

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: { contains: 'coffee', mode: 'insensitive' } }),
      ]),
    )
  })

  it('caps pageSize at 50', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })

    await GET(getRequest('?pageSize=500'))

    const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
    expect(args.take).toBeLessThanOrEqual(50)
  })
})
