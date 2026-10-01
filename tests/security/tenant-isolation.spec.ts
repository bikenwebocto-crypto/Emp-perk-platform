import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ForbiddenError, requireCompany } from '@/lib/auth/guards'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    redemption: { count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: { savingsAmount: null } }) },
    notificationEvent: { count: vi.fn().mockResolvedValue(0) },
    merchantOffer: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
  },
}))
vi.mock('@/lib/employee-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/employee-session')>('@/lib/employee-session')
  return { ...actual, getEmployeeFromSession: vi.fn() }
})
vi.mock('@/lib/merchant-session', () => ({ getMerchantFromSession: vi.fn() }))

describe('tenant isolation', () => {
  describe('requireCompany guard', () => {
    it('allows access when the context companyId matches the resource companyId', () => {
      expect(() => requireCompany({ companyId: 'company-a' } as any, 'company-a')).not.toThrow()
    })

    it('blocks access to a different company’s resource', () => {
      expect(() => requireCompany({ companyId: 'company-a' } as any, 'company-b')).toThrow(ForbiddenError)
    })

    it('blocks access when the context has no companyId at all (e.g. a merchant token)', () => {
      expect(() => requireCompany({ companyId: null } as any, 'company-a')).toThrow(ForbiddenError)
    })
  })

  describe('employee-scoped queries never cross company/employee boundaries', () => {
    beforeEach(() => vi.clearAllMocks())

    it('scopes /api/employee/dashboard/stats redemption counts to the requesting employee only', async () => {
      const { prisma } = await import('@/lib/prisma')
      const { getEmployeeFromSession } = await import('@/lib/employee-session')
      const { GET } = await import('@/app/api/employee/dashboard/stats/route')
      ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-victim', companyId: 'company-a' })

      await GET(new Request('http://localhost/api/employee/dashboard/stats') as any)

      for (const call of (prisma.redemption.count as any).mock.calls) {
        expect(call[0].where.employeeId).toBe('emp-victim')
        expect(call[0].where.employeeId).not.toBe('emp-attacker')
      }
    })
  })

  describe('merchant-scoped queries never leak another merchant’s offers', () => {
    beforeEach(() => vi.clearAllMocks())

    it('scopes /api/merchant/offers to the authenticated merchant only, regardless of query params', async () => {
      const { prisma } = await import('@/lib/prisma')
      const { getMerchantFromSession } = await import('@/lib/merchant-session')
      const { GET } = await import('@/app/api/merchant/offers/route')
      ;(getMerchantFromSession as any).mockResolvedValue({ id: 'merchant-victim' })

      await GET(new Request('http://localhost/api/merchant/offers?merchantId=merchant-attacker') as any)

      const [args] = (prisma.merchantOffer.findMany as any).mock.calls[0]
      expect(args.where.merchantId).toBe('merchant-victim')
    })
  })
})