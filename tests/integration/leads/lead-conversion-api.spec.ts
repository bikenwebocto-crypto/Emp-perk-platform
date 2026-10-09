import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    category: { findUnique: vi.fn() },
    account: { create: vi.fn() },
    merchant: { create: vi.fn() },
    actionQueueItem: { create: vi.fn() },
    lead: { findUnique: vi.fn(), update: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/user-validation.service', () => ({
  validateUserEmail: vi.fn(),
  createAccountForProfile: vi.fn(),
}))
vi.mock('@/services/business-notification.service', () => ({
  publishBusinessToAdmins: vi.fn().mockResolvedValue(undefined),
}))
// The route invites the Supabase user first; its id becomes the merchant id.
vi.mock('@/services/employee-invite.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/employee-invite.service')>()),
  inviteAuthUser: vi.fn(),
  rollbackAuthUser: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { validateUserEmail } from '@/services/user-validation.service'
import { publishBusinessToAdmins } from '@/services/business-notification.service'
import { inviteAuthUser } from '@/services/employee-invite.service'
import { POST } from '@/app/api/admin/merchants/create/route'

const db = prisma as any
const adminUser = { id: 'auth-admin', profileId: 'admin-1', userType: 'admin' }
const merchantUser = { id: 'auth-merchant', profileId: 'merchant-1', userType: 'merchant' }

const createdMerchant = { id: '11111111-1111-4111-8111-111111111111', businessName: 'Acme Coffee' }
const merchantLeadId = '22222222-2222-4222-8222-222222222222'

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/merchants/create', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any
}

const validBody = {
  businessName: 'Acme Coffee',
  email: 'owner@acmecoffee.test',
  contactName: 'Ada Owner',
}

function merchantLead(overrides: Record<string, unknown> = {}) {
  return { id: merchantLeadId, type: 'MERCHANT', status: 'NEW', merchantId: null, ...overrides }
}

async function post(body: Record<string, unknown>) {
  const res = await POST(request(body))
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any)
  vi.mocked(validateUserEmail).mockResolvedValue({ exists: false } as any)
  vi.mocked(inviteAuthUser).mockResolvedValue({ ok: true, authUserId: createdMerchant.id })
  db.category.findUnique.mockResolvedValue(null)
  db.account.create.mockResolvedValue({ id: createdMerchant.id })
  db.merchant.create.mockResolvedValue(createdMerchant)
  db.actionQueueItem.create.mockResolvedValue({})
  db.lead.findUnique.mockResolvedValue(merchantLead())
  db.lead.update.mockResolvedValue({})
})

describe('POST /api/admin/merchants/create without leadId', () => {
  it('keeps the previous unauthenticated behaviour and never reads the leads table', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any)

    const { status, json } = await post(validBody)

    expect(status).toBe(201)
    expect(json.success).toBe(true)
    expect(getCurrentUser).not.toHaveBeenCalled()
    expect(db.lead.findUnique).not.toHaveBeenCalled()
    expect(db.lead.update).not.toHaveBeenCalled()
    expect(db.merchant.create).toHaveBeenCalledTimes(1)
  })

  it('does not report password as a required field', async () => {
    const { status, json } = await post({ email: 'owner@acmecoffee.test' })

    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION')
    expect(json.error.message).not.toContain('password')
  })
})

describe('POST /api/admin/merchants/create with leadId', () => {
  it('converts the lead inside the same transaction that creates the merchant', async () => {
    const { status, json } = await post({ ...validBody, leadId: merchantLeadId })

    expect(status).toBe(201)
    expect(json.data.id).toBe(createdMerchant.id)
    expect(db.lead.findUnique).toHaveBeenCalledWith({ where: { id: merchantLeadId } })
    expect(db.lead.update).toHaveBeenCalledWith({
      where: { id: merchantLeadId },
      data: { merchantId: createdMerchant.id, status: 'CONVERTED' },
    })
    expect(db.account.create).toHaveBeenCalledTimes(1)
    expect(db.merchant.create).toHaveBeenCalledTimes(1)
  })

  it('validates the lead before writing and links it after the merchant exists', async () => {
    await post({ ...validBody, leadId: merchantLeadId })

    const order = {
      leadLookup: db.lead.findUnique.mock.invocationCallOrder[0],
      accountCreate: db.account.create.mock.invocationCallOrder[0],
      merchantCreate: db.merchant.create.mock.invocationCallOrder[0],
      leadUpdate: db.lead.update.mock.invocationCallOrder[0],
    }

    expect(order.leadLookup).toBeLessThan(order.accountCreate)
    expect(order.accountCreate).toBeLessThan(order.merchantCreate)
    expect(order.merchantCreate).toBeLessThan(order.leadUpdate)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('still creates the approval queue item and notification when requiresApproval is set', async () => {
    const { status } = await post({ ...validBody, leadId: merchantLeadId, requiresApproval: true })

    expect(status).toBe(201)
    expect(db.actionQueueItem.create).toHaveBeenCalledTimes(1)
    expect(publishBusinessToAdmins).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/admin/merchants/create lead validation', () => {
  it.each([
    ['lead does not exist', null],
    ['lead is an employer lead', merchantLead({ type: 'EMPLOYER' })],
    ['lead is already converted', merchantLead({ status: 'CONVERTED', merchantId: 'other-id' })],
  ])('rejects with INVALID_LEAD when %s', async (_label, lead) => {
    db.lead.findUnique.mockResolvedValue(lead)

    const { status, json } = await post({ ...validBody, leadId: merchantLeadId })

    expect(status).toBe(400)
    expect(json.error.code).toBe('INVALID_LEAD')
    expect(db.account.create).not.toHaveBeenCalled()
    expect(db.merchant.create).not.toHaveBeenCalled()
    expect(db.lead.update).not.toHaveBeenCalled()
  })

  it('rejects a non-string leadId', async () => {
    const { status, json } = await post({ ...validBody, leadId: 42 })

    expect(status).toBe(400)
    expect(json.error.code).toBe('INVALID_LEAD')
    expect(db.merchant.create).not.toHaveBeenCalled()
  })

  it('reports INVALID_LEAD before the unique-violation conflict', async () => {
    db.lead.findUnique.mockResolvedValue(null)
    db.account.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    const { status, json } = await post({ ...validBody, leadId: merchantLeadId })

    expect(status).toBe(400)
    expect(json.error.code).toBe('INVALID_LEAD')
  })

  it('still reports CONFLICT when the lead is valid but the merchant email duplicates', async () => {
    db.merchant.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    const { status, json } = await post({ ...validBody, leadId: merchantLeadId })

    expect(status).toBe(409)
    expect(json.error.code).toBe('CONFLICT')
  })
})

describe('POST /api/admin/merchants/create leadId authorization', () => {
  it('returns 401 for an unauthenticated request and performs no writes', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as any)

    const { status, json } = await post({ ...validBody, leadId: merchantLeadId })

    expect(status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
    expect(db.lead.findUnique).not.toHaveBeenCalled()
    expect(db.lead.update).not.toHaveBeenCalled()
    expect(db.account.create).not.toHaveBeenCalled()
    expect(db.merchant.create).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(publishBusinessToAdmins).not.toHaveBeenCalled()
  })

  it('returns 401 for a non-admin user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(merchantUser as any)

    const { status, json } = await post({ ...validBody, leadId: merchantLeadId })

    expect(status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})