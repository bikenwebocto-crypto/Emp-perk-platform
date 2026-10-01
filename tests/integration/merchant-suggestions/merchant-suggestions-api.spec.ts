import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    merchantSuggestion: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    merchant: { findFirst: vi.fn(), findMany: vi.fn() },
    adminUser: { findUnique: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog } from '@/services/audit-log.service'
import { POST as mobilePOST, GET as mobileGET } from '@/app/api/mobile/merchant-suggestions/route'
import { PATCH as adminPATCH } from '@/app/api/admin/merchant-suggestions/[id]/route'
import {
  canTransition,
  normalizePhone,
  normalizeWebsite,
  validateMerchantSuggestionInput,
} from '@/lib/merchant-suggestions'

const db = prisma as any
const employee = { id: 'emp-1', companyId: 'company-1' }
const adminUser = { id: 'auth-admin', profileId: 'admin-1', userType: 'admin' }

const validBody = {
  merchantName: '  Joe’s Coffee ',
  merchantWebsite: 'joescoffee.com',
  merchantPhone: '+44 (20) 7946-0958',
  merchantEmail: ' Hello@JoesCoffee.com ',
  reason: 'Great coffee near the office',
}

function mobileRequest(method: string, body?: unknown, query = '') {
  return new Request(`http://localhost/api/mobile/merchant-suggestions${query}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as any
}

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/admin/merchant-suggestions/sug-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as any
}
const params = { params: Promise.resolve({ id: 'sug-1' }) }

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug-1',
    employeeId: 'emp-1',
    companyId: 'company-1',
    merchantName: 'Joe’s Coffee',
    merchantWebsite: 'https://joescoffee.com/',
    merchantPhone: '+442079460958',
    merchantEmail: 'hello@joescoffee.com',
    reason: null,
    status: 'PENDING',
    adminNotes: null,
    rejectionReason: null,
    reviewedById: null,
    reviewedAt: null,
    merchantId: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db))
  ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: true, employee })
  ;(getCurrentUser as any).mockResolvedValue(adminUser)
})

// ─── Shared helpers ─────────────────────────────────────────────────────────

describe('merchant-suggestions helpers', () => {
  it('normalizes website, phone and email', () => {
    const result = validateMerchantSuggestionInput(validBody)
    expect(result).toEqual({
      ok: true,
      data: {
        merchantName: 'Joe’s Coffee',
        merchantWebsite: 'https://joescoffee.com/',
        merchantPhone: '+442079460958',
        merchantEmail: 'hello@joescoffee.com',
        reason: 'Great coffee near the office',
      },
    })
  })

  it('rejects non-http schemes and bare hosts', () => {
    expect(normalizeWebsite('ftp://example.com')).toBeNull()
    expect(normalizeWebsite('javascript://example.com')).toBeNull()
    expect(normalizeWebsite('localhost')).toBeNull()
    expect(normalizeWebsite('http://example.com/path')).toBe('http://example.com/path')
  })

  it('enforces 7–15 digit phone numbers', () => {
    expect(normalizePhone('123456')).toBeNull()
    expect(normalizePhone('1234567890123456')).toBeNull()
    expect(normalizePhone('12+34567')).toBeNull()
    expect(normalizePhone('555 1234')).toBe('5551234')
  })

  it('encodes the status workflow', () => {
    expect(canTransition('PENDING', 'UNDER_REVIEW')).toBe(true)
    expect(canTransition('PENDING', 'CONVERTED')).toBe(false)
    expect(canTransition('REJECTED', 'UNDER_REVIEW')).toBe(true)
    expect(canTransition('CONVERTED', 'UNDER_REVIEW')).toBe(false)
  })
})

// ─── Mobile API ─────────────────────────────────────────────────────────────

describe('POST /api/mobile/merchant-suggestions', () => {
  it('creates a valid suggestion using session identity (201)', async () => {
    db.merchantSuggestion.count.mockResolvedValue(0)
    db.merchantSuggestion.findFirst.mockResolvedValue(null)
    db.merchantSuggestion.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...suggestion(), ...data }),
    )

    const res = await mobilePOST(
      mobileRequest('POST', { ...validBody, employeeId: 'someone-else', companyId: 'other-co' }),
    )
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    const { data } = db.merchantSuggestion.create.mock.calls[0][0]
    expect(data.employeeId).toBe('emp-1')
    expect(data.companyId).toBe('company-1')
    expect(data.merchantEmail).toBe('hello@joescoffee.com')
    expect(json.data).not.toHaveProperty('adminNotes')
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MERCHANT_SUGGESTION_CREATED', actorId: 'emp-1' }),
    )
  })

  it('returns 400 with per-field errors for invalid input', async () => {
    const res = await mobilePOST(
      mobileRequest('POST', {
        merchantName: ' ',
        merchantWebsite: 'ftp://nope.com',
        merchantPhone: '12',
        merchantEmail: 'not-an-email',
        reason: 'x'.repeat(2001),
      }),
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.code).toBe('VALIDATION')
    expect(Object.keys(json.error.details).sort()).toEqual(
      ['merchantEmail', 'merchantName', 'merchantPhone', 'merchantWebsite', 'reason'].sort(),
    )
    expect(db.merchantSuggestion.create).not.toHaveBeenCalled()
  })

  it('returns 409 when the employee has an open suggestion with the same email/phone', async () => {
    db.merchantSuggestion.count.mockResolvedValue(1)
    db.merchantSuggestion.findFirst.mockResolvedValue({ id: 'existing-1' })

    const res = await mobilePOST(mobileRequest('POST', validBody))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe('DUPLICATE_SUGGESTION')
    expect(json.error.existingSuggestionId).toBe('existing-1')
    const where = db.merchantSuggestion.findFirst.mock.calls[0][0].where
    expect(where.employeeId).toBe('emp-1')
    expect(where.status.in).toEqual(['PENDING', 'UNDER_REVIEW', 'CONTACTED'])
    expect(db.merchantSuggestion.create).not.toHaveBeenCalled()
  })

  it('returns 429 after 10 suggestions in 24h', async () => {
    db.merchantSuggestion.count.mockResolvedValue(10)

    const res = await mobilePOST(mobileRequest('POST', validBody))
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.error.code).toBe('RATE_LIMITED')
    expect(db.merchantSuggestion.create).not.toHaveBeenCalled()
  })

  it('passes through the auth failure response', async () => {
    const { NextResponse } = await import('next/server')
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false }, { status: 401 }),
    })
    const res = await mobilePOST(mobileRequest('POST', validBody))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/mobile/merchant-suggestions', () => {
  it('lists only the employee’s own suggestions without admin fields', async () => {
    db.merchantSuggestion.findMany.mockResolvedValue([])
    db.merchantSuggestion.count.mockResolvedValue(0)

    const res = await mobileGET(mobileRequest('GET', undefined, '?status=PENDING&page=2&pageSize=5'))
    expect(res.status).toBe(200)

    const args = db.merchantSuggestion.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ employeeId: 'emp-1', status: 'PENDING' })
    expect(args.skip).toBe(5)
    expect(args.select.adminNotes).toBeUndefined()
  })

  it('rejects an unknown status filter', async () => {
    const res = await mobileGET(mobileRequest('GET', undefined, '?status=BOGUS'))
    expect(res.status).toBe(400)
  })
})

// ─── Admin PATCH ────────────────────────────────────────────────────────────

describe('PATCH /api/admin/merchant-suggestions/[id]', () => {
  it('rejects non-admin users', async () => {
    ;(getCurrentUser as any).mockResolvedValue({ ...adminUser, userType: 'merchant' })
    const res = await adminPATCH(patchRequest({ status: 'UNDER_REVIEW' }), params)
    expect(res.status).toBe(403)
  })

  it('returns 400 INVALID_TRANSITION for a disallowed transition', async () => {
    db.merchantSuggestion.findUnique.mockResolvedValue(suggestion({ status: 'PENDING' }))

    const res = await adminPATCH(patchRequest({ status: 'CONTACTED' }), params)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.code).toBe('INVALID_TRANSITION')
    expect(json.error.allowedNextStatuses).toEqual(['UNDER_REVIEW', 'REJECTED'])
    expect(db.merchantSuggestion.updateMany).not.toHaveBeenCalled()
  })

  it('requires a rejectionReason for REJECTED', async () => {
    const res = await adminPATCH(patchRequest({ status: 'REJECTED', rejectionReason: '  ' }), params)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.details.rejectionReason).toBeDefined()
    expect(db.merchantSuggestion.updateMany).not.toHaveBeenCalled()
  })

  it('returns 400 when converting to a merchant that does not exist', async () => {
    db.merchantSuggestion.findUnique.mockResolvedValue(suggestion({ status: 'UNDER_REVIEW' }))
    db.merchant.findFirst.mockResolvedValue(null)

    const res = await adminPATCH(
      patchRequest({ status: 'CONVERTED', merchantId: '00000000-0000-0000-0000-000000000000' }),
      params,
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error.details.merchantId).toBe('Merchant not found')
    expect(db.merchantSuggestion.updateMany).not.toHaveBeenCalled()
  })

  it('requires merchantId for CONVERTED', async () => {
    const res = await adminPATCH(patchRequest({ status: 'CONVERTED' }), params)
    expect(res.status).toBe(400)
  })

  it('applies a valid transition guarded on the current status and audits it', async () => {
    db.merchantSuggestion.findUnique
      .mockResolvedValueOnce(suggestion({ status: 'PENDING' }))
      .mockResolvedValueOnce(suggestion({ status: 'REJECTED' }))
    db.merchantSuggestion.updateMany.mockResolvedValue({ count: 1 })

    const res = await adminPATCH(
      patchRequest({ status: 'REJECTED', rejectionReason: 'Already a partner' }),
      params,
    )
    expect(res.status).toBe(200)

    const args = db.merchantSuggestion.updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'sug-1', status: 'PENDING' })
    expect(args.data).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Already a partner',
      reviewedById: 'admin-1',
    })
    expect(args.data.reviewedAt).toBeInstanceOf(Date)
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MERCHANT_SUGGESTION_STATUS_CHANGED',
        changes: { status: { from: 'PENDING', to: 'REJECTED' } },
      }),
    )
  })

  it('returns 409 when the status changed concurrently', async () => {
    db.merchantSuggestion.findUnique.mockResolvedValue(suggestion({ status: 'PENDING' }))
    db.merchantSuggestion.updateMany.mockResolvedValue({ count: 0 })

    const res = await adminPATCH(patchRequest({ status: 'UNDER_REVIEW' }), params)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe('CONFLICT')
    expect(createAuditLog).not.toHaveBeenCalled()
  })

  it('returns 409 when the merchant is already linked to another suggestion (P2002)', async () => {
    db.merchantSuggestion.findUnique.mockResolvedValue(suggestion({ status: 'CONTACTED' }))
    db.merchant.findFirst.mockResolvedValue({ id: 'merchant-1' })
    db.merchantSuggestion.updateMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const res = await adminPATCH(
      patchRequest({ status: 'CONVERTED', merchantId: 'merchant-1' }),
      params,
    )
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe('MERCHANT_ALREADY_LINKED')
  })
})
