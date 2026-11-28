import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { auditLog: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() } },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/notification.service', () => ({ NotificationService: {} }))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import {
  buildAuditWhere,
  buildChangeView,
  parseDateRange,
  parsePagination,
  safeMetadata,
} from '@/lib/audit/audit-query'
import { GET as getAuditLogs } from '@/app/api/admin/audit-logs/route'
import { GET as getAuditLog } from '@/app/api/admin/audit-logs/[id]/route'
import { GET as getBillingAudit } from '@/app/api/admin/billing/audit/route'

const db = prisma as any
const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>
const admin = (adminRole: string) => ({ id: 'a', profileId: 'admin-1', userType: 'admin', adminRole })
const req = (url: string) => new NextRequest(`http://localhost${url}`)
const sp = (q: string) => new URLSearchParams(q)
const ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  db.auditLog.findMany.mockResolvedValue([])
  db.auditLog.count.mockResolvedValue(0)
})

describe('parsePagination', () => {
  it('defaults when absent', () => {
    expect(parsePagination(sp(''))).toEqual({ ok: true, value: { page: 1, pageSize: 25, skip: 0 } })
  })
  it('computes skip', () => {
    expect(parsePagination(sp('page=3&pageSize=10'))).toEqual({ ok: true, value: { page: 3, pageSize: 10, skip: 20 } })
  })
  it.each(['abc', '0', '-1', '1.5', '1e3'])('rejects page=%s', (p) => {
    expect(parsePagination(sp(`page=${p}`)).ok).toBe(false)
  })
  it.each(['0', '101', 'x'])('rejects pageSize=%s', (p) => {
    expect(parsePagination(sp(`pageSize=${p}`)).ok).toBe(false)
  })
})

describe('parseDateRange', () => {
  it('rejects malformed and reversed ranges', () => {
    expect(parseDateRange(sp('from=2026-13-40')).ok).toBe(false)
    expect(parseDateRange(sp('from=yesterday')).ok).toBe(false)
    expect(parseDateRange(sp('from=2026-02-02&to=2026-02-01')).ok).toBe(false)
  })
  it('builds an inclusive UTC range', () => {
    const r = parseDateRange(sp('from=2026-02-01&to=2026-02-01'))
    expect(r).toEqual({
      ok: true,
      value: { gte: new Date('2026-02-01T00:00:00.000Z'), lte: new Date('2026-02-01T23:59:59.999Z') },
    })
  })
})

describe('buildAuditWhere', () => {
  it('matches entity types exactly as stored', () => {
    const r = buildAuditWhere(sp('entityType=MERCHANT_OFFER'))
    expect(r).toEqual({ ok: true, value: { AND: [{ entityType: 'MERCHANT_OFFER' }] } })
  })
  it('ignores ALL and empty values', () => {
    expect(buildAuditWhere(sp('entityType=ALL&action=&outcome=ALL'))).toEqual({ ok: true, value: {} })
  })
  it('filters actor id across every actor column', () => {
    const r = buildAuditWhere(sp(`actorId=${ID}`))
    expect(r.ok && r.value.AND).toEqual([
      { OR: [{ adminId: ID }, { merchantId: ID }, { companyAdminId: ID }, { employeeId: ID }] },
    ])
  })
  it.each([
    'actorType=root',
    'actorId=nope',
    'entityId=nope',
    'companyId=nope',
  ])('rejects %s', (q) => {
    expect(buildAuditWhere(sp(q)).ok).toBe(false)
  })
})

describe('buildChangeView', () => {
  it('none when nothing was recorded', () => {
    expect(buildChangeView(null)).toEqual({ kind: 'none' })
    expect(buildChangeView({ reason: 'x' })).toEqual({ kind: 'none' })
  })
  it('diffs before/after objects without inventing missing sides', () => {
    const v = buildChangeView({ before: { name: 'A' }, after: { name: 'B', city: 'X' } })
    expect(v).toEqual({
      kind: 'diff',
      fields: [
        { field: 'city', before: undefined, after: 'X', hasBefore: false, hasAfter: true },
        { field: 'name', before: 'A', after: 'B', hasBefore: true, hasAfter: true },
      ],
    })
  })
  it('handles a from/to transition', () => {
    const v = buildChangeView({ from: 'ACTIVE', to: 'ON_HOLD', reason: 'late' })
    expect(v).toEqual({
      kind: 'diff',
      fields: [{ field: 'value', before: 'ACTIVE', after: 'ON_HOLD', hasBefore: true, hasAfter: true }],
    })
  })
  it('handles per-field pairs', () => {
    const v = buildChangeView({ status: { old: 'A', new: 'B' } })
    expect(v.kind).toBe('diff')
  })
  it('treats flat objects as an after-only snapshot', () => {
    expect(buildChangeView({ name: 'B' })).toEqual({ kind: 'snapshot', values: { name: 'B' } })
  })
  it('re-redacts historical secrets on read', () => {
    const v = buildChangeView({ before: { password: 'old' }, after: { password: 'new' } })
    expect(JSON.stringify(v)).not.toMatch(/old|new"/)
  })
})

describe('safeMetadata', () => {
  it('redacts secrets and hides keys shown elsewhere', () => {
    expect(safeMetadata({ token: 'abc', requestId: 'r', actor: {}, note: 'ok' })).toEqual({
      token: '[REDACTED]',
      note: 'ok',
    })
    expect(safeMetadata({ requestId: 'r' })).toBeNull()
  })
})

describe('GET /api/admin/audit-logs', () => {
  it('400 on invalid page instead of silently coercing', async () => {
    currentUser.mockResolvedValue(admin('ADMIN'))
    expect((await getAuditLogs(req('/api/admin/audit-logs?page=abc'))).status).toBe(400)
    expect(db.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('paginates and filters in the database and never returns changes/metadata', async () => {
    currentUser.mockResolvedValue(admin('ADMIN'))
    db.auditLog.findMany.mockResolvedValue([
      {
        id: ID, action: 'VOUCHER_VERIFICATION_ATTEMPT', entityType: 'voucher_verification', entityId: ID,
        actorType: 'merchant', adminId: null, merchantId: ID, companyAdminId: null, employeeId: null,
        companyId: null, ipAddress: null, createdAt: new Date('2026-01-01T00:00:00Z'),
        changes: null, metadata: { result: 'FAILED', token: 't' },
        admin: null, merchant: { businessName: 'Cafe' }, companyAdmin: null, employee: null, company: null,
      },
    ])
    db.auditLog.count.mockResolvedValue(51)
    const res = await getAuditLogs(req('/api/admin/audit-logs?page=2&pageSize=25&entityType=voucher_verification'))
    const body = await res.json()
    const args = db.auditLog.findMany.mock.calls[0][0]
    expect(args.skip).toBe(25)
    expect(args.take).toBe(25)
    expect(args.where).toEqual({ AND: [{ entityType: 'voucher_verification' }] })
    expect(body.meta).toEqual({ page: 2, pageSize: 25, total: 51, totalPages: 3 })
    expect(body.data[0]).toMatchObject({ actorName: 'Cafe', outcome: 'FAILED', hasChanges: false })
    expect(body.data[0]).not.toHaveProperty('metadata')
    expect(body.data[0]).not.toHaveProperty('changes')
  })
})

describe('GET /api/admin/audit-logs/[id]', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

  it.each(['SUPPORT_ADMIN', 'FINANCE_ADMIN'])('403 for %s', async (role) => {
    currentUser.mockResolvedValue(admin(role))
    expect((await getAuditLog(req('/x'), ctx(ID))).status).toBe(403)
    expect(db.auditLog.findUnique).not.toHaveBeenCalled()
  })

  it('400 for a malformed id, 404 when missing', async () => {
    currentUser.mockResolvedValue(admin('ADMIN'))
    expect((await getAuditLog(req('/x'), ctx('nope'))).status).toBe(400)
    db.auditLog.findUnique.mockResolvedValue(null)
    expect((await getAuditLog(req('/x'), ctx(ID))).status).toBe(404)
  })

  it('reports missing historical data as null', async () => {
    currentUser.mockResolvedValue(admin('SUPER_ADMIN'))
    db.auditLog.findUnique.mockResolvedValue({
      id: ID, action: 'deactivate', entityType: 'employee', entityId: ID, actorType: 'admin',
      adminId: ID, merchantId: null, companyAdminId: null, employeeId: null, companyId: null,
      changes: null, metadata: null, ipAddress: null, userAgent: null,
      createdAt: new Date('2025-01-01T00:00:00Z'),
      admin: null, merchant: null, companyAdmin: null, employee: null, company: null,
    })
    const { data } = await (await getAuditLog(req('/x'), ctx(ID))).json()
    expect(data.actorName).toBe('Unknown')
    expect(data.outcome).toBeNull()
    expect(data.reason).toBeNull()
    expect(data.changes).toEqual({ kind: 'none' })
    expect(data.metadata).toBeNull()
    expect(data.request).toEqual({ ipAddress: null, userAgent: null, requestId: null })
  })
})

describe('GET /api/admin/billing/audit pagination', () => {
  it.each(['page=abc', 'page=0', 'page=-2', 'pageSize=500', 'from=bad'])('400 for %s', async (q) => {
    currentUser.mockResolvedValue(admin('FINANCE_ADMIN'))
    expect((await getBillingAudit(req(`/api/admin/billing/audit?${q}`))).status).toBe(400)
    expect(db.auditLog.findMany).not.toHaveBeenCalled()
  })

  it('uses a stable order, correct skip, and totalPages >= 1', async () => {
    currentUser.mockResolvedValue(admin('FINANCE_ADMIN'))
    const res = await getBillingAudit(req('/api/admin/billing/audit?page=3&pageSize=10'))
    const args = db.auditLog.findMany.mock.calls[0][0]
    expect(args.skip).toBe(20)
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    expect((await res.json()).meta).toEqual({ page: 3, pageSize: 10, total: 0, totalPages: 1 })
  })
})
