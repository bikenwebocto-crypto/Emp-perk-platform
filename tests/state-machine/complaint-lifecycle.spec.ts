import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Complaint status transitions (Complaint.status: OPEN -> UNDER_REVIEW ->
 * [CLARIFICATION_REQ | ESCALATED] -> RESOLVED | REJECTED) are enforced
 * inline in the relevant route handlers rather than by a shared state
 * machine module, see:
 *   - src/app/api/complaints/admin/[id]/route.ts (OPEN -> UNDER_REVIEW on
 *     first admin view; resolve/reject only from UNDER_REVIEW/ESCALATED)
 *   - src/app/api/complaints/[id]/escalate/route.ts (blocks escalation of
 *     a terminal RESOLVED/REJECTED complaint)
 */

vi.mock('@/lib/prisma', () => {
  const mockTx = {
    complaintEscalation: { create: vi.fn().mockResolvedValue({ id: 'escalation-1' }) },
    complaintAction: { create: vi.fn().mockResolvedValue({ id: 'action-1' }) },
    complaint: { update: vi.fn().mockResolvedValue({}) },
  }
  return {
    prisma: {
      complaint: { findUnique: vi.fn(), update: mockTx.complaint.update },
      complaintEscalation: mockTx.complaintEscalation,
      complaintAction: mockTx.complaintAction,
      $transaction: vi.fn((arg) => (typeof arg === 'function' ? arg(mockTx) : Promise.all(arg))),
    },
  }
})
vi.mock('@/app/api/company/helpers', () => ({
  getCompanyAdmin: vi.fn(),
  handleApiError: vi.fn(() => new Response(null, { status: 500 })),
}))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getCompanyAdmin } from '@/app/api/company/helpers'
import { POST as escalate } from '@/app/api/complaints/[id]/escalate/route'

function escalateRequest(reason: string) {
  return new Request('http://localhost/api/complaints/complaint-1/escalate', {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }) as any
}

describe('complaint lifecycle: escalation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getCompanyAdmin as any).mockResolvedValue({
      company: { id: 'company-1' },
      companyAdmin: { id: 'admin-1' },
    })
  })

  const TERMINAL_STATUSES = ['RESOLVED', 'REJECTED']
  const ESCALATABLE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'CLARIFICATION_REQ']

  for (const status of TERMINAL_STATUSES) {
    it(`refuses to escalate a complaint in a terminal ${status} state`, async () => {
      ;(prisma.complaint.findUnique as any).mockResolvedValue({
        id: 'complaint-1',
        companyId: 'company-1',
        status,
      })

      const res = await escalate(escalateRequest('needs attention'), {
        params: Promise.resolve({ id: 'complaint-1' }),
      })

      expect(res.status).toBe(400)
    })
  }

  for (const status of ESCALATABLE_STATUSES) {
    it(`allows escalating a complaint in a non-terminal ${status} state`, async () => {
      ;(prisma.complaint.findUnique as any).mockResolvedValue({
        id: 'complaint-1',
        companyId: 'company-1',
        status,
      })

      const res = await escalate(escalateRequest('needs attention'), {
        params: Promise.resolve({ id: 'complaint-1' }),
      })

      expect(res.status).toBe(201)
    })
  }

  it('cannot escalate a complaint belonging to a different company (tenant isolation)', async () => {
    ;(prisma.complaint.findUnique as any).mockResolvedValue({
      id: 'complaint-1',
      companyId: 'company-other',
      status: 'OPEN',
    })

    const res = await escalate(escalateRequest('needs attention'), {
      params: Promise.resolve({ id: 'complaint-1' }),
    })

    expect(res.status).toBe(404)
  })

  it('rejects escalation with no reason', async () => {
    const res = await escalate(escalateRequest(''), {
      params: Promise.resolve({ id: 'complaint-1' }),
    })

    expect(res.status).toBe(400)
    expect(prisma.complaint.findUnique).not.toHaveBeenCalled()
  })
})
