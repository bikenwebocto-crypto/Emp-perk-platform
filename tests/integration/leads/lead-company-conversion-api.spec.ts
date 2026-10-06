import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    company: { create: vi.fn() },
    account: { create: vi.fn() },
    companyAdmin: { create: vi.fn() },
    companyBilling: { create: vi.fn() },
    actionQueueItem: { create: vi.fn() },
    lead: { findUnique: vi.fn(), update: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/user-validation.service', () => ({
  validateUserEmail: vi.fn().mockResolvedValue({ exists: false }),
  createAccountForProfile: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn(),
  buildAuditData: vi.fn(),
  fromCurrentUser: vi.fn(),
}))
vi.mock('@/services/company-admin-invitation.service', () => ({
  sendCompanyAdminInvitation: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/business-notification.service', () => ({
  channels: (...list: unknown[]) => list,
  publishBusinessToAdmins: vi.fn().mockResolvedValue(undefined),
  publishBusinessToCompanyAdmins: vi.fn().mockResolvedValue(undefined),
  BUSINESS_NOTIFICATION_TEMPLATES: { companyApproved: (name: string) => ({ type: 'SYSTEM', title: name }) },
}))
vi.mock('@/lib/company-activation/city-readiness', () => ({
  getCityReadiness: vi.fn().mockResolvedValue({ ready: true }),
}))
vi.mock('@/lib/company-activation/launch-pack', () => ({ sendLaunchPack: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { POST } from '@/app/api/admin/companies/route'

const db = prisma as any

const superAdmin = { id: 'auth-admin', profileId: 'admin-1', userType: 'admin', role: 'SUPER_ADMIN' }
const employeeUser = { id: 'auth-emp', profileId: 'emp-1', userType: 'employee', role: null }

const employerLeadId = '55555555-5555-4555-8555-555555555555'
const createdCompany = { id: '66666666-6666-4666-8666-666666666666', name: 'Navy Labs' }

const validBody = {
  name: 'Navy Labs',
  email: 'people@navylabs.test',
  firstName: 'Grace',
  lastName: 'Hopper',
}

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/companies', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

async function post(body: Record<string, unknown>) {
  const res = await POST(request(body))
  return { status: res.status, json: await res.json() }
}

function employerLead(overrides: Record<string, unknown> = {}) {
  return { id: employerLeadId, type: 'EMPLOYER', status: 'NEW', companyId: null, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockResolvedValue(superAdmin as any)
  db.lead.findUnique.mockResolvedValue(employerLead())
  db.lead.update.mockResolvedValue({})
  db.company.create.mockResolvedValue(createdCompany)
  db.account.create.mockResolvedValue({})
  db.companyAdmin.create.mockResolvedValue({})
  db.companyBilling.create.mockResolvedValue({})
  db.actionQueueItem.create.mockResolvedValue({})
})

describe('POST /api/admin/companies with leadId', () => {
  it('links an employer lead to the new company inside the transaction', async () => {
    const { status, json } = await post({ ...validBody, leadId: employerLeadId })

    expect(status).toBe(201)
    expect(json.data.id).toBe(createdCompany.id)
    expect(db.lead.findUnique).toHaveBeenCalledWith({ where: { id: employerLeadId } })
    expect(db.lead.update).toHaveBeenCalledWith({
      where: { id: employerLeadId },
      data: { companyId: createdCompany.id, status: 'CONVERTED' },
    })
    expect(db.$transaction).toHaveBeenCalledTimes(1)

    const order = {
      lookup: db.lead.findUnique.mock.invocationCallOrder[0],
      companyCreate: db.company.create.mock.invocationCallOrder[0],
      update: db.lead.update.mock.invocationCallOrder[0],
    }
    expect(order.lookup).toBeLessThan(order.companyCreate)
    expect(order.companyCreate).toBeLessThan(order.update)
  })

  it.each([
    ['lead does not exist', null],
    ['lead is a merchant lead', employerLead({ type: 'MERCHANT' })],
    ['lead is already converted', employerLead({ status: 'CONVERTED', companyId: 'other' })],
  ])('rejects with INVALID_LEAD when %s', async (_label, lead) => {
    db.lead.findUnique.mockResolvedValue(lead)

    const { status, json } = await post({ ...validBody, leadId: employerLeadId })

    expect(status).toBe(400)
    expect(json.error.code).toBe('INVALID_LEAD')
    expect(db.company.create).not.toHaveBeenCalled()
    expect(db.account.create).not.toHaveBeenCalled()
    expect(db.lead.update).not.toHaveBeenCalled()
  })

  it('rejects a non-string leadId', async () => {
    const { status, json } = await post({ ...validBody, leadId: 7 })

    expect(status).toBe(400)
    expect(json.error.code).toBe('INVALID_LEAD')
    expect(db.company.create).not.toHaveBeenCalled()
  })

  it('reports INVALID_LEAD before the unique-violation conflict', async () => {
    db.lead.findUnique.mockResolvedValue(null)
    db.company.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    const { status, json } = await post({ ...validBody, leadId: employerLeadId })

    expect(status).toBe(400)
    expect(json.error.code).toBe('INVALID_LEAD')
  })

  it('still reports CONFLICT when the lead is valid but the email duplicates', async () => {
    db.company.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    const { status, json } = await post({ ...validBody, leadId: employerLeadId })

    expect(status).toBe(409)
    expect(json.error.code).toBe('CONFLICT')
  })
})

describe('POST /api/admin/companies leadId authorization', () => {
  it('returns 401 for a non-admin user and performs no writes', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(employeeUser as any)

    const { status, json } = await post({ ...validBody, leadId: employerLeadId })

    expect(status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
    expect(db.lead.findUnique).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('returns 401 for an unauthenticated request and performs no writes', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any)

    const { status, json } = await post({ ...validBody, leadId: employerLeadId })

    expect(status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('leaves public signup without a leadId untouched', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any)

    const { status } = await post(validBody)

    expect(status).toBe(201)
    expect(db.lead.findUnique).not.toHaveBeenCalled()
    expect(db.lead.update).not.toHaveBeenCalled()
    expect(db.company.create).toHaveBeenCalledTimes(1)
  })
})