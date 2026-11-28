import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findUnique: vi.fn(), update: vi.fn() },
    companyAdmin: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth })),
}))
vi.mock('@/features/admin/settings/login-branding/services/login-branding.service', () => ({
  getPublicBranding: vi.fn().mockResolvedValue({}),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ set: vi.fn() })),
}))
vi.mock('@/lib/auth/mfa', () => ({
  hasVerifiedTotpFactor: vi.fn(),
  requiresMfaForRole: vi.fn(() => false),
}))

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/auth/sync-admin/route'

const db = prisma as any

function request() {
  return new Request('http://localhost/api/auth/sync-admin', {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
  }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.getUser.mockResolvedValue({
    data: { user: { id: 'auth-company-admin', email: 'admin@company.test' } },
    error: null,
  })
  db.account.findUnique.mockResolvedValue({
    authUserId: 'auth-company-admin',
    role: 'COMPANY_ADMIN',
    profileType: 'COMPANY',
    status: 'ACTIVE',
  })
  db.account.update.mockResolvedValue({})
})

describe('POST /api/auth/sync-admin company access routing', () => {
  it('routes pending-payment company admins to the access notice', async () => {
    db.companyAdmin.findFirst.mockResolvedValue({
      company: { status: 'APPROVED_PENDING_PAYMENT' },
    })

    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      role: 'COMPANY_ADMIN',
      redirectTo: '/company-access-pending',
    })
  })

  it('routes active company admins to the dashboard', async () => {
    db.companyAdmin.findFirst.mockResolvedValue({
      company: { status: 'ACTIVE' },
    })

    const response = await POST(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.redirectTo).toBe('/company')
  })
})
