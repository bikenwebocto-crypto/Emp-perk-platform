import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { auditLog: { findMany: vi.fn(), count: vi.fn() } } }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/notification.service', () => ({ NotificationService: {} }))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { canAdminAccessPath, canAdminCallApi } from '@/lib/access/account-access'
import { GET as getAuditLogs } from '@/app/api/admin/audit-logs/route'
import { GET as getBillingAudit } from '@/app/api/admin/billing/audit/route'

const db = prisma as any
const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>
const admin = (adminRole: string, profileId: string | null = 'admin-1') => ({
  id: 'auth-uuid',
  profileId,
  userType: 'admin',
  adminRole,
})
const req = (url: string) => new NextRequest(`http://localhost${url}`)

beforeEach(() => {
  vi.clearAllMocks()
  db.auditLog.findMany.mockResolvedValue([])
  db.auditLog.count.mockResolvedValue(0)
})

describe('access matrix', () => {
  it.each([
    ['SUPER_ADMIN', true, true],
    ['ADMIN', true, true],
    ['FINANCE_ADMIN', false, true],
    ['SUPPORT_ADMIN', false, false],
    ['CONTENT_ADMIN', false, false],
    ['BOGUS', false, false],
  ])('%s: audit-logs=%s billing-audit=%s', (role, audit, billing) => {
    expect(canAdminAccessPath(role, '/admin/audit-logs')).toBe(audit)
    expect(canAdminCallApi(role, '/api/admin/audit-logs')).toBe(audit)
    expect(canAdminCallApi(role, '/api/admin/billing/audit')).toBe(billing)
  })
})

describe('GET /api/admin/audit-logs', () => {
  it('401 when signed out', async () => {
    currentUser.mockResolvedValue(null)
    expect((await getAuditLogs(req('/api/admin/audit-logs'))).status).toBe(401)
  })

  it.each(['SUPPORT_ADMIN', 'FINANCE_ADMIN', 'CONTENT_ADMIN'])('403 for %s', async (role) => {
    currentUser.mockResolvedValue(admin(role))
    expect((await getAuditLogs(req('/api/admin/audit-logs'))).status).toBe(403)
    expect(db.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('403 for a non-admin user type', async () => {
    currentUser.mockResolvedValue({ id: 'u', profileId: 'm1', userType: 'merchant' })
    expect((await getAuditLogs(req('/api/admin/audit-logs'))).status).toBe(403)
  })

  it('403 for an admin without a profile id', async () => {
    currentUser.mockResolvedValue(admin('SUPER_ADMIN', null))
    expect((await getAuditLogs(req('/api/admin/audit-logs'))).status).toBe(403)
  })

  it('200 for ADMIN', async () => {
    currentUser.mockResolvedValue(admin('ADMIN'))
    expect((await getAuditLogs(req('/api/admin/audit-logs'))).status).toBe(200)
  })
})

describe('GET /api/admin/billing/audit', () => {
  const row = {
    id: 'r1',
    action: 'BILLING_STATUS_CHANGED',
    entityType: 'company',
    entityId: 'c1',
    companyId: 'c1',
    actorType: 'admin',
    adminId: 'admin-1',
    changes: { from: 'DUE', to: 'PAID', reason: null, password: 'leak' },
    metadata: { secret: 'x' },
    ipAddress: '1.2.3.4',
    userAgent: 'UA',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    admin: { id: 'admin-1', firstName: 'Ada', lastName: 'L' },
    company: { id: 'c1', name: 'Acme' },
  }

  it('401 when signed out', async () => {
    currentUser.mockResolvedValue(null)
    expect((await getBillingAudit(req('/api/admin/billing/audit'))).status).toBe(401)
  })

  it.each(['SUPPORT_ADMIN', 'CONTENT_ADMIN'])('403 for %s', async (role) => {
    currentUser.mockResolvedValue(admin(role))
    expect((await getBillingAudit(req('/api/admin/billing/audit'))).status).toBe(403)
    expect(db.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('400 for a non-billing action filter', async () => {
    currentUser.mockResolvedValue(admin('FINANCE_ADMIN'))
    const res = await getBillingAudit(req('/api/admin/billing/audit?action=ADMIN_ACCOUNT_CREATED'))
    expect(res.status).toBe(400)
    expect(db.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('400 for a malformed companyId', async () => {
    currentUser.mockResolvedValue(admin('FINANCE_ADMIN'))
    expect((await getBillingAudit(req('/api/admin/billing/audit?companyId=x'))).status).toBe(400)
  })

  it('returns only safe fields to FINANCE_ADMIN', async () => {
    currentUser.mockResolvedValue(admin('FINANCE_ADMIN'))
    db.auditLog.findMany.mockResolvedValue([row])
    db.auditLog.count.mockResolvedValue(1)
    const res = await getBillingAudit(req('/api/admin/billing/audit'))
    expect(res.status).toBe(200)
    const [item] = (await res.json()).data
    expect(item).not.toHaveProperty('metadata')
    expect(item).not.toHaveProperty('ipAddress')
    expect(item).not.toHaveProperty('userAgent')
    expect(item.changes).toEqual({ from: 'DUE', to: 'PAID', reason: null })
    expect(item.actorName).toBe('Ada L')
    // The query itself never selects the sensitive columns.
    const select = db.auditLog.findMany.mock.calls[0][0].select
    expect(select.metadata).toBeUndefined()
    expect(select.ipAddress).toBeUndefined()
  })
})
