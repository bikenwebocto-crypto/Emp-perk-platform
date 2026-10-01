import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    complaint: { create: vi.fn(), findMany: vi.fn() },
    merchantOffer: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/employee-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/employee-session')>('@/lib/employee-session')
  return {
    ...actual,
    getEmployeeFromSession: vi.fn(),
  }
})
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/business-notification.service', () => ({
  BUSINESS_NOTIFICATION_TEMPLATES: {},
  channels: vi.fn(() => []),
  publishBusinessToAdmins: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession } from '@/lib/employee-session'
import { POST } from '@/app/api/complaints/route'

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/complaints', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any
}

describe('POST /api/complaints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when there is no employee session', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue(null)

    const res = await POST(jsonRequest({ offerId: 'offer-1', complaintType: 'MISLEADING', description: 'bad' }))

    expect(res.status).toBe(401)
  })

  it('returns 403-equivalent company-inactive response for an inactive company sentinel', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ inactive: true, companyStatus: 'SUSPENDED' })

    const res = await POST(jsonRequest({ offerId: 'offer-1', complaintType: 'MISLEADING', description: 'bad' }))

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(prisma.complaint.create).not.toHaveBeenCalled()
  })

  it('returns 400 when required fields are missing', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })

    const res = await POST(jsonRequest({ offerId: 'offer-1' }))

    expect(res.status).toBe(400)
    expect(prisma.complaint.create).not.toHaveBeenCalled()
  })
})
