import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findUnique: vi.fn() },
    complaint: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/services/business-notification.service', () => ({
  BUSINESS_NOTIFICATION_TEMPLATES: {
    complaintCreated: vi.fn(() => ({ title: 't', body: 'b' })),
  },
  channels: vi.fn((...c: string[]) => c),
  publishBusinessToAdmins: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET, POST, PATCH } from '@/app/api/mobile/tickets/route'

function jsonRequest(body: unknown) {
  return { json: async () => body } as any
}

function getRequest(query = '') {
  return new Request(`http://localhost/api/mobile/tickets${query}`) as any
}

const AUTH_OK = {
  ok: true,
  user: { id: 'user-1' },
  account: { id: 'acc-1' },
  employee: { id: 'emp-1', companyId: 'company-1' },
  company: { id: 'company-1' },
}

const UNAUTH = {
  ok: false,
  response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
}

describe('POST /api/mobile/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        complaint: { create: vi.fn().mockResolvedValue({ id: 'ticket-1' }) },
        complaintAction: { create: vi.fn().mockResolvedValue({}) },
      }),
    )
    ;(prisma.complaint.findUnique as any).mockResolvedValue({
      id: 'ticket-1',
      complaintType: 'NON_FUNCTIONAL',
      offerId: 'offer-1',
      offer: { id: 'offer-1', title: 'Coffee Deal', status: 'LIVE' },
      category: null,
      description: 'Broken offer',
      status: 'OPEN',
      priority: 'MEDIUM',
      evidenceUrls: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(UNAUTH)

    const res = await POST(jsonRequest({ type: 'OFFER', offerId: 'offer-1', description: 'Broken' }))

    expect(res.status).toBe(401)
  })

  it('creates an OFFER ticket and returns 201 with the serialized ticket', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findUnique as any).mockResolvedValue({ id: 'offer-1', merchantId: 'merchant-1' })

    const res = await POST(jsonRequest({ type: 'OFFER', offerId: 'offer-1', description: 'Broken offer' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('ticket-1')
    expect(body.data.type).toBe('OFFER')
    expect(body.data.subject).toContain('Coffee Deal')
  })

  it('returns 400 when description is missing', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await POST(jsonRequest({ type: 'OFFER', offerId: 'offer-1' }))

    expect(res.status).toBe(400)
  })

  it('returns 404 when the referenced offer does not exist', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findUnique as any).mockResolvedValue(null)

    const res = await POST(jsonRequest({ type: 'OFFER', offerId: 'missing-offer', description: 'Broken' }))

    expect(res.status).toBe(404)
  })
})

describe('GET /api/mobile/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(UNAUTH)

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
  })

  it('lists only the authenticated employee\'s tickets, paginated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.complaint.findMany as any).mockResolvedValue([
      {
        id: 'ticket-1',
        complaintType: 'NON_FUNCTIONAL',
        offerId: 'offer-1',
        offer: { id: 'offer-1', title: 'Coffee Deal', status: 'LIVE' },
        category: null,
        description: 'Broken offer',
        status: 'OPEN',
        priority: 'MEDIUM',
        evidenceUrls: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    ;(prisma.complaint.count as any).mockResolvedValue(1)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    const [args] = (prisma.complaint.findMany as any).mock.calls[0]
    expect(args.where.employeeId).toBe('emp-1')
    expect(body.data).toHaveLength(1)
    expect(body.meta.total).toBe(1)
  })

  it('returns 404 when fetching a single ticket by id that does not belong to the employee', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.complaint.findFirst as any).mockResolvedValue(null)

    const res = await GET(getRequest('?id=other-employee-ticket'))

    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/mobile/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.$transaction as any).mockImplementation(async (cb: any) =>
      cb({
        complaint: { update: vi.fn().mockResolvedValue({}) },
        complaintAction: { create: vi.fn().mockResolvedValue({}) },
      }),
    )
  })

  it('returns 400 when the id query parameter is missing', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await PATCH({ ...jsonRequest({}), url: 'http://localhost/api/mobile/tickets' } as any)

    expect(res.status).toBe(400)
  })

  it('rejects a status transition that is not allowed for the current status', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.complaint.findFirst as any).mockResolvedValue({ id: 'ticket-1', employeeId: 'emp-1', status: 'OPEN' })

    const res = await PATCH({
      ...jsonRequest({ status: 'RESOLVED' }),
      url: 'http://localhost/api/mobile/tickets?id=ticket-1',
    } as any)

    expect(res.status).toBe(400)
  })
})
