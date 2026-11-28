import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findUnique: vi.fn() },
    companyAdmin: { findFirst: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/auth/session/route'

function requestWith(headers: Record<string, string>) {
  return new Request('http://localhost/api/auth/session', { headers }) as any
}

describe('GET /api/auth/session (middleware-authenticated path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when the middleware-provided email has no matching account', async () => {
    ;(prisma.account.findUnique as any).mockResolvedValue(null)

    const res = await GET(requestWith({ 'x-middleware-email': 'ghost@acmetest.test' }))

    expect(res.status).toBe(401)
  })

  it('resolves the account id when the middleware email matches an account', async () => {
    ;(prisma.account.findUnique as any).mockResolvedValue({ authUserId: 'user-123' })

    const res = await GET(requestWith({ 'x-middleware-email': 'employee@acmetest.test' }))

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { email: 'employee@acmetest.test' },
      select: { authUserId: true },
    })
    expect(res.status).not.toBe(401)
  })

  it('includes the company lifecycle status for company admins', async () => {
    ;(prisma.account.findUnique as any)
      .mockResolvedValueOnce({ authUserId: 'company-admin-123' })
      .mockResolvedValueOnce({
        authUserId: 'company-admin-123',
        role: 'COMPANY_ADMIN',
        profileType: 'COMPANY',
      })
    ;(prisma.companyAdmin.findFirst as any).mockResolvedValue({
      company: { status: 'APPROVED_PENDING_PAYMENT' },
    })

    const res = await GET(requestWith({ 'x-middleware-email': 'admin@acmetest.test' }))
    const body = await res.json()

    expect(body.user.companyStatus).toBe('APPROVED_PENDING_PAYMENT')
    expect(prisma.companyAdmin.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'company-admin-123' },
      select: { company: { select: { status: true } } },
    })
  })
})
