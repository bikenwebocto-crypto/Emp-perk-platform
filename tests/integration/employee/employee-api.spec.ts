import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    redemption: { count: vi.fn(), aggregate: vi.fn() },
    notificationEvent: { count: vi.fn() },
    merchantOffer: { count: vi.fn() },
  },
}))
vi.mock('@/lib/employee-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/employee-session')>('@/lib/employee-session')
  return { ...actual, getEmployeeFromSession: vi.fn() }
})

import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession } from '@/lib/employee-session'
import { GET } from '@/app/api/employee/dashboard/stats/route'

describe('GET /api/employee/dashboard/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.redemption.count as any).mockResolvedValue(0)
    ;(prisma.redemption.aggregate as any).mockResolvedValue({ _sum: { savingsAmount: null } })
    ;(prisma.notificationEvent.count as any).mockResolvedValue(0)
    ;(prisma.merchantOffer.count as any).mockResolvedValue(0)
  })

  it('returns 401 without a session', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue(null)

    const res = await GET(new Request('http://localhost/api/employee/dashboard/stats') as any)

    expect(res.status).toBe(401)
  })

  it('returns a company-inactive response for a suspended company', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ inactive: true, companyStatus: 'SUSPENDED' })

    const res = await GET(new Request('http://localhost/api/employee/dashboard/stats') as any)

    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('scopes every redemption/offer query to the authenticated employee', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })

    await GET(new Request('http://localhost/api/employee/dashboard/stats') as any)

    for (const call of (prisma.redemption.count as any).mock.calls) {
      expect(call[0].where.employeeId).toBe('emp-1')
    }
    expect((prisma.redemption.aggregate as any).mock.calls[0][0].where.employeeId).toBe('emp-1')
  })

  it('only counts merchant offers that are LIVE and from active merchants', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })

    await GET(new Request('http://localhost/api/employee/dashboard/stats') as any)

    const [args] = (prisma.merchantOffer.count as any).mock.calls[0]
    expect(args.where.status).toBe('LIVE')
    expect(args.where.merchant.status).toBe('ACTIVE')
  })
})
