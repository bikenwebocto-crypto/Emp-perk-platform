import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => cb(db)),
    company: { findUnique: vi.fn(), update: vi.fn() },
    companyStatusHistory: { create: vi.fn() },
    actionQueueItem: { updateMany: vi.fn() },
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn(),
  buildAuditData: vi.fn(),
  fromCurrentUser: vi.fn().mockReturnValue({}),
}))
vi.mock('@/services/company-admin-invitation.service', () => ({ sendCompanyAdminInvitation: vi.fn() }))
vi.mock('@/services/user-validation.service', () => ({
  validateUserEmail: vi.fn(),
  createAccountForProfile: vi.fn(),
}))
vi.mock('@/lib/company-activation/city-readiness', () => ({
  getCityReadiness: vi.fn().mockResolvedValue({ ready: true }),
}))
vi.mock('@/lib/company-activation/launch-pack', () => ({ sendLaunchPack: vi.fn() }))
vi.mock('@/lib/company-contact', () => ({
  derivePrimaryAdmin: vi.fn(),
  summarizeAdmins: vi.fn().mockReturnValue([]),
}))
vi.mock('@/services/business-notification.service', () => ({
  channels: (...values: unknown[]) => values,
  collectEmailWarnings: vi.fn().mockReturnValue([]),
  notifyCompanyStatusChange: vi.fn().mockResolvedValue([]),
  publishBusinessToAdmins: vi.fn(),
  publishBusinessToCompanyAdmins: vi.fn(),
  BUSINESS_NOTIFICATION_TEMPLATES: {},
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getCityReadiness } from '@/lib/company-activation/city-readiness'
import { collectEmailWarnings, notifyCompanyStatusChange } from '@/services/business-notification.service'
import { PATCH } from '@/app/api/admin/companies/route'

const db = prisma as any
const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>
const companyId = '11111111-1111-4111-8111-111111111111'

function request(status = 'ACTIVE') {
  return new Request('http://localhost/api/admin/companies', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyId, status }),
  }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
  currentUser.mockResolvedValue({
    id: 'admin-auth-id',
    profileId: 'admin-profile-id',
    userType: 'admin',
    adminRole: 'ADMIN',
  })
  vi.mocked(getCityReadiness).mockResolvedValue({ ready: true } as any)
  vi.mocked(collectEmailWarnings).mockReturnValue([])
  vi.mocked(notifyCompanyStatusChange).mockResolvedValue([])
  db.company.findUnique.mockResolvedValue({
    id: companyId,
    status: 'APPROVED_PENDING_PAYMENT',
    deletedAt: null,
  })
})

describe('PATCH /api/admin/companies activation authorization', () => {
  it('rejects non-Super Admin activation through the list endpoint', async () => {
    const response = await PATCH(request())
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(db.company.update).not.toHaveBeenCalled()
    expect(db.companyStatusHistory.create).not.toHaveBeenCalled()
  })

  it('allows a company admin reviewer to approve a pending company without activating it', async () => {
    db.company.findUnique.mockResolvedValue({
      id: companyId,
      status: 'PENDING',
      deletedAt: null,
    })
    db.company.update.mockResolvedValue({ id: companyId, status: 'APPROVED_PENDING_PAYMENT' })

    const response = await PATCH(request('APPROVED_PENDING_PAYMENT'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(db.company.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED_PENDING_PAYMENT' }),
    }))
    expect(body.data.status).toBe('APPROVED_PENDING_PAYMENT')
  })

  it('does not let even a Super Admin skip the payment-pending state', async () => {
    currentUser.mockResolvedValue({
      id: 'super-admin-auth-id',
      profileId: 'super-admin-profile-id',
      userType: 'admin',
      adminRole: 'SUPER_ADMIN',
    })
    db.company.findUnique.mockResolvedValue({
      id: companyId,
      status: 'PENDING',
      deletedAt: null,
    })

    const response = await PATCH(request('ACTIVE'))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('INVALID_TRANSITION')
    expect(db.company.update).not.toHaveBeenCalled()
  })
})
