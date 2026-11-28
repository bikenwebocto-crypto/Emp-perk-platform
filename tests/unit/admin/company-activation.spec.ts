import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => cb(db)),
    company: { findUnique: vi.fn(), update: vi.fn() },
    companyStatusHistory: { create: vi.fn() },
    actionQueueItem: { updateMany: vi.fn() },
    employee: { findMany: vi.fn() },
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/company-activation/city-readiness', () => ({
  getCityReadiness: vi.fn().mockResolvedValue({ ready: true }),
}))
vi.mock('@/lib/company-activation/launch-pack', () => ({
  sendLaunchPack: vi.fn().mockResolvedValue({}),
  sendBillingReminder: vi.fn(),
}))
vi.mock('@/lib/company-contact', () => ({
  derivePrimaryAdmin: vi.fn().mockReturnValue(null),
  ensurePrimaryAdmin: vi.fn(),
  summarizeAdmins: vi.fn().mockReturnValue([]),
}))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn(),
  fromCurrentUser: vi.fn().mockReturnValue({}),
}))
vi.mock('@/lib/api-auth', () => ({ forbidden: vi.fn() }))
vi.mock('@/lib/company-detail/service', () => ({ getCompanyDetail: vi.fn() }))
vi.mock('@/services/business-notification.service', () => ({
  collectEmailWarnings: vi.fn().mockReturnValue([]),
  notifyCompanyStatusChange: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/app/api/admin/accounts/helpers', () => ({ signOutAuthUsers: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getCityReadiness } from '@/lib/company-activation/city-readiness'
import { summarizeAdmins } from '@/lib/company-contact'
import { collectEmailWarnings, notifyCompanyStatusChange } from '@/services/business-notification.service'
import { signOutAuthUsers } from '@/app/api/admin/accounts/helpers'
import { PATCH } from '@/app/api/admin/companies/[id]/route'

const db = prisma as any
const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>
const companyId = '11111111-1111-4111-8111-111111111111'
const signOut = signOutAuthUsers as unknown as ReturnType<typeof vi.fn>

function activationRequest() {
  return new Request(`http://localhost/api/admin/companies/${companyId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ACTIVE' }),
  }) as any
}

const context = { params: Promise.resolve({ id: companyId }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCityReadiness).mockResolvedValue({ ready: true } as any)
  vi.mocked(summarizeAdmins).mockReturnValue([])
  vi.mocked(collectEmailWarnings).mockReturnValue([])
  vi.mocked(notifyCompanyStatusChange).mockResolvedValue([])
  currentUser.mockResolvedValue({
    id: 'admin-auth-id',
    profileId: 'admin-profile-id',
    userType: 'admin',
    adminRole: 'ADMIN',
  })
})

describe('PATCH /api/admin/companies/[id] activation permission', () => {
  it('rejects activation of a pending company by a non-Super Admin', async () => {
    db.company.findUnique.mockResolvedValue({
      id: companyId,
      status: 'APPROVED_PENDING_PAYMENT',
      deletedAt: null,
    })
    const response = await PATCH(activationRequest(), context)
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(db.company.update).not.toHaveBeenCalled()
  })

  it('allows a Super Admin to activate a company', async () => {
    currentUser.mockResolvedValue({
      id: 'super-admin-auth-id',
      profileId: 'super-admin-profile-id',
      userType: 'admin',
      adminRole: 'SUPER_ADMIN',
    })
    const company = {
      id: companyId,
      name: 'Acme',
      status: 'APPROVED_PENDING_PAYMENT',
      city: 'Limassol',
      deletedAt: null,
      approvedAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    db.company.findUnique
      .mockResolvedValueOnce(company)
      .mockResolvedValueOnce({
        ...company,
        status: 'ACTIVE',
        billing: null,
        statusHistory: [],
        _count: { employees: 0, redemptions: 0, csvUploads: 0 },
        companyAdmins: [],
      })

    const response = await PATCH(activationRequest(), context)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(db.company.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: companyId },
      data: expect.objectContaining({ status: 'ACTIVE' }),
    }))
  })

  it.each(['PAUSED', 'SUSPENDED'])('ends all employee sessions when the company becomes %s', async (status) => {
    const company = {
      id: companyId,
      name: 'Acme',
      status: 'ACTIVE',
      city: 'Limassol',
      deletedAt: null,
      approvedAt: new Date('2026-01-01T00:00:00.000Z'),
    }
    db.company.findUnique
      .mockResolvedValueOnce(company)
      .mockResolvedValueOnce({
        ...company,
        status,
        billing: null,
        statusHistory: [],
        _count: { employees: 2, redemptions: 0, csvUploads: 0 },
        companyAdmins: [],
      })
    db.employee.findMany.mockResolvedValue([
      { accountId: 'employee-auth-1' },
      { accountId: 'employee-auth-2' },
    ])

    const request = new Request(`http://localhost/api/admin/companies/${companyId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }) as any
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(db.employee.findMany).toHaveBeenCalledWith({
      where: { companyId, accountId: { not: null } },
      select: { accountId: true },
    })
    expect(signOut).toHaveBeenCalledWith(['employee-auth-1', 'employee-auth-2'])
  })
})
