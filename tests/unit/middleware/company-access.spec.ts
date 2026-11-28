import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth })),
}))
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'http://localhost' }))
vi.mock('@/lib/auth/mfa', () => ({
  hasVerifiedTotpFactor: vi.fn(),
  requiresMfaForRole: vi.fn(() => false),
}))

import { middleware } from '@/middleware'

function pendingRoleResponse() {
  return new Response(JSON.stringify({
    user: {
      role: 'COMPANY_ADMIN',
      adminRole: null,
      companyStatus: 'APPROVED_PENDING_PAYMENT',
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function employeeRoleResponse(companyStatus: string | null) {
  return new Response(JSON.stringify({
    user: {
      role: 'EMPLOYEE',
      adminRole: null,
      companyStatus,
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('company access middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.getUser.mockResolvedValue({ data: { user: { email: 'admin@company.test' } } })
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pendingRoleResponse()))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects pending company admins away from dashboard pages', async () => {
    const response = await middleware(new NextRequest('http://localhost/company/employees'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/company-access-pending')
  })

  it('blocks pending company admin API access with the clear status message', async () => {
    const response = await middleware(new NextRequest('http://localhost/api/company/dashboard'))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatchObject({
      code: 'COMPANY_INACTIVE',
      message: 'Your account is set up. Your dashboard opens once payment is confirmed.',
      companyStatus: 'APPROVED_PENDING_PAYMENT',
    })
  })

  it('keeps the pending-access notice route public', async () => {
    const response = await middleware(new NextRequest('http://localhost/company-access-pending'))

    expect(response.status).toBe(200)
    expect(auth.getUser).not.toHaveBeenCalled()
  })

  it.each(['PENDING', 'APPROVED_PENDING_PAYMENT', 'PAUSED', 'SUSPENDED', 'CANCELLED'])(
    'blocks employee API and page access for %s companies',
    async (companyStatus) => {
      vi.mocked(fetch).mockImplementation(async () => employeeRoleResponse(companyStatus) as any)

      const apiResponse = await middleware(new NextRequest('http://localhost/api/employee/dashboard/stats'))
      expect(apiResponse.status).toBe(403)
      expect(await apiResponse.json()).toMatchObject({
        error: { code: 'COMPANY_INACTIVE', companyStatus },
      })

      const pageResponse = await middleware(new NextRequest('http://localhost/employee'))
      expect(pageResponse.status).toBe(307)
      expect(pageResponse.headers.get('location')).toContain('/login')
    },
  )
})
