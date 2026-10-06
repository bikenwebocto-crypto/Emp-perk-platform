import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lead: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn(),
  fromCurrentUser: vi.fn((_u: unknown, action: string, entityType: string, entityId: string, opts?: unknown) => ({ action, entityType, entityId, ...(opts as object) })),
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog } from '@/services/audit-log.service'
import { GET as listLeads } from '@/app/api/admin/leads/route'
import { GET as getLead, PATCH as patchLead } from '@/app/api/admin/leads/[id]/route'

const db = prisma as any
const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>
const adminUser = { id: 'auth-admin', profileId: 'admin-1', userType: 'admin' }
const merchantUser = { id: 'auth-merchant', profileId: 'merchant-1', userType: 'merchant' }
const leadId = '22222222-2222-4222-8222-222222222222'
const ctx = { params: Promise.resolve({ id: leadId }) }

function req(url: string, init?: RequestInit) {
  return new Request(`http://localhost${url}`, init) as any
}
function patchReq(body: unknown) {
  return req(`/api/admin/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('admin leads routes: auth', () => {
  const calls = [
    ['GET /api/admin/leads', () => listLeads(req('/api/admin/leads'))],
    ['GET /api/admin/leads/[id]', () => getLead(req(`/api/admin/leads/${leadId}`), ctx)],
    ['PATCH /api/admin/leads/[id]', () => patchLead(patchReq({ status: 'CONTACTED' }), ctx)],
  ] as const

  it.each(calls)('%s returns 403 for a non-admin', async (_name, call) => {
    currentUser.mockResolvedValue(merchantUser)
    const res = await call()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } })
    expect(db.lead.findMany).not.toHaveBeenCalled()
    expect(db.lead.findUnique).not.toHaveBeenCalled()
    expect(db.lead.updateMany).not.toHaveBeenCalled()
  })

  it.each(calls)('%s returns 401 when signed out', async (_name, call) => {
    currentUser.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('UNAUTHORIZED')
  })
})

describe('GET /api/admin/leads', () => {
  it('filters, pages, sorts newest first and includes converted records', async () => {
    currentUser.mockResolvedValue(adminUser)
    db.lead.findMany.mockResolvedValue([])
    db.lead.count.mockResolvedValue(0)

    const res = await listLeads(req('/api/admin/leads?type=MERCHANT&status=NEW&q=acme&page=2&pageSize=5'))
    expect(res.status).toBe(200)
    const args = db.lead.findMany.mock.calls[0][0]
    expect(args.where).toMatchObject({ type: 'MERCHANT', status: 'NEW' })
    expect(args.where.OR).toEqual(expect.arrayContaining([
      { companyName: { contains: 'acme', mode: 'insensitive' } },
      { email: { contains: 'acme', mode: 'insensitive' } },
    ]))
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(args.skip).toBe(5)
    expect(args.take).toBe(5)
    expect(args.include).toEqual({
      merchant: { select: { id: true, businessName: true } },
      company: { select: { id: true, name: true } },
    })
  })
})

describe('PATCH /api/admin/leads/[id]', () => {
  beforeEach(() => currentUser.mockResolvedValue(adminUser))

  it('rejects status CONVERTED', async () => {
    const res = await patchLead(patchReq({ status: 'CONVERTED' }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION')
    expect(db.lead.updateMany).not.toHaveBeenCalled()
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('moves a NEW lead to REJECTED and audits the note', async () => {
    db.lead.updateMany.mockResolvedValue({ count: 1 })
    db.lead.findUnique.mockResolvedValue({ id: leadId, status: 'REJECTED' })

    const res = await patchLead(patchReq({ status: 'REJECTED', note: 'Out of area' }), ctx)
    expect(res.status).toBe(200)
    expect(db.lead.updateMany).toHaveBeenCalledWith({ where: { id: leadId, status: 'NEW' }, data: { status: 'REJECTED' } })
    expect(createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'LEAD_REJECTED',
      entityType: 'lead',
      entityId: leadId,
      metadata: { note: 'Out of area' },
    }))
  })

  it('returns 409 when the lead is no longer NEW', async () => {
    db.lead.updateMany.mockResolvedValue({ count: 0 })
    db.lead.findUnique.mockResolvedValue({ status: 'CONVERTED' })

    const res = await patchLead(patchReq({ status: 'CONTACTED' }), ctx)
    expect(res.status).toBe(409)
    expect(createAuditLog).not.toHaveBeenCalled()
  })
})
