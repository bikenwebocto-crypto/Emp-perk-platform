import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    complaint: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/tickets/[id]/route'

function getRequest() {
  return new Request('http://localhost/api/mobile/tickets/ticket-1') as any
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

const AUTH_OK = {
  ok: true,
  user: { id: 'user-1' },
  account: { id: 'acc-1' },
  employee: { id: 'emp-1', companyId: 'company-1' },
  company: { id: 'company-1' },
}

const TICKET = {
  id: 'ticket-1',
  offerId: 'offer-1',
  employeeId: 'emp-1',
  merchantId: 'merchant-1',
  companyId: 'company-1',
  complaintType: 'NON_FUNCTIONAL',
  category: null,
  description: 'Broken offer',
  evidenceUrls: ['https://example.com/a.png'],
  status: 'OPEN',
  priority: 'MEDIUM',
  escalationNote: null,
  resolutionNotes: null,
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  offer: { id: 'offer-1', title: 'Coffee Deal', status: 'LIVE' },
  merchant: { id: 'merchant-1', businessName: 'Coffee Shop', logoUrl: null },
  employee: { id: 'emp-1', firstName: 'Jane', lastName: 'Doe' },
  company: { id: 'company-1', name: 'Acme', email: 'acme@example.com' },
  actions: [
    {
      id: 'action-1',
      complaintId: 'ticket-1',
      actorType: 'EMPLOYEE',
      adminId: null,
      companyAdminId: null,
      employeeId: 'emp-1',
      merchantId: null,
      actionType: 'REVIEWED',
      notes: 'Complaint filed via mobile',
      createdAt: new Date(),
    },
  ],
}

describe('GET /api/mobile/tickets/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    })

    const res = await GET(getRequest(), ctx('ticket-1'))

    expect(res.status).toBe(401)
  })

  it('returns the full ticket with relations for the owning employee', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.complaint.findFirst as any).mockResolvedValue(TICKET)

    const res = await GET(getRequest(), ctx('ticket-1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('ticket-1')
    expect(body.data.offer.title).toBe('Coffee Deal')
    expect(body.data.merchant.businessName).toBe('Coffee Shop')
    expect(body.data.actions).toHaveLength(1)
    const [args] = (prisma.complaint.findFirst as any).mock.calls[0]
    expect(args.where).toEqual({ id: 'ticket-1', employeeId: 'emp-1' })
  })

  it('returns 404 when the ticket does not exist or belongs to another employee', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.complaint.findFirst as any).mockResolvedValue(null)

    const res = await GET(getRequest(), ctx('other-employee-ticket'))

    expect(res.status).toBe(404)
  })
})
