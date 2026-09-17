import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findUnique: vi.fn() },
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
})
