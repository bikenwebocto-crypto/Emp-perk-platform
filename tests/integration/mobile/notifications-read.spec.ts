import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationEvent: { updateMany: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { PATCH } from '@/app/api/mobile/notifications/read/route'

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/mobile/notifications/read', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as any
}

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any

describe('PATCH /api/mobile/notifications/read', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.notificationEvent.updateMany as any).mockResolvedValue({ count: 0 })
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await PATCH(patchRequest({}))

    expect(res.status).toBe(401)
    expect(prisma.notificationEvent.updateMany).not.toHaveBeenCalled()
  })

  it('returns 400 when notificationIds is not an array', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await PATCH(patchRequest({ notificationIds: 'not-an-array' }))

    expect(res.status).toBe(400)
  })

  it('marks all unread notifications as read when notificationIds is empty/omitted', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.notificationEvent.updateMany as any).mockResolvedValue({ count: 3 })

    const res = await PATCH(patchRequest({}))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.marked).toBe(3)
    const [args] = (prisma.notificationEvent.updateMany as any).mock.calls[0]
    expect(args.where).toEqual({ employeeId: 'emp-1', channel: 'IN_APP', isRead: false })
  })

  it('scopes the update to the given notificationIds when provided', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.notificationEvent.updateMany as any).mockResolvedValue({ count: 2 })

    await PATCH(patchRequest({ notificationIds: ['n-1', 'n-2'] }))

    const [args] = (prisma.notificationEvent.updateMany as any).mock.calls[0]
    expect(args.where.id).toEqual({ in: ['n-1', 'n-2'] })
    expect(args.where.employeeId).toBe('emp-1')
  })
})
