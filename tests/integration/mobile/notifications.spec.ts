import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationEvent: { findMany: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/notifications/route'

function getRequest(query = '') {
  return new Request(`http://localhost/api/mobile/notifications${query}`) as any
}

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any

describe('GET /api/mobile/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.notificationEvent.findMany as any).mockResolvedValue([])
    ;(prisma.notificationEvent.count as any).mockResolvedValue(0)
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
    expect(prisma.notificationEvent.findMany).not.toHaveBeenCalled()
  })

  it('scopes notifications to the employee, IN_APP channel, and excludes saved_offer events', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    await GET(getRequest())

    const [args] = (prisma.notificationEvent.findMany as any).mock.calls[0]
    expect(args.where.employeeId).toBe('emp-1')
    expect(args.where.channel).toBe('IN_APP')
    expect(args.where.OR).toEqual(
      expect.arrayContaining([{ referenceType: { not: 'saved_offer' } }, { referenceType: null }]),
    )
  })

  it('returns the page, unread count, and pagination meta', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.notificationEvent.findMany as any).mockResolvedValue([{ id: 'n-1' }])
    ;(prisma.notificationEvent.count as any).mockResolvedValueOnce(2).mockResolvedValueOnce(5)

    const res = await GET(getRequest('?page=2&pageSize=10'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.unread).toBe(2)
    expect(body.meta).toEqual({ page: 2, pageSize: 10, total: 5, totalPages: 1 })
  })

  it('caps pageSize at 50', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    await GET(getRequest('?pageSize=500'))

    const [args] = (prisma.notificationEvent.findMany as any).mock.calls[0]
    expect(args.take).toBeLessThanOrEqual(50)
  })
})
