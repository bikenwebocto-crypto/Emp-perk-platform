import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    offerAnalytics: { updateMany: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { createAuditLog } from '@/services/audit-log.service'
import { POST } from '@/app/api/mobile/offers/[id]/click/route'

function postRequest(id = 'offer-1') {
  return new Request(`http://localhost/api/mobile/offers/${id}/click`, { method: 'POST' }) as any
}
function ctx(id = 'offer-1') {
  return { params: Promise.resolve({ id }) }
}

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any

describe('POST /api/mobile/offers/[id]/click', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await POST(postRequest(), ctx())

    expect(res.status).toBe(401)
    expect(prisma.offerAnalytics.updateMany).not.toHaveBeenCalled()
  })

  it('increments the view count and returns success for a visible offer', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.offerAnalytics.updateMany as any).mockResolvedValue({ count: 1 })

    const res = await POST(postRequest(), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    const [args] = (prisma.offerAnalytics.updateMany as any).mock.calls[0]
    expect(args.where.offerId).toBe('offer-1')
    expect(args.where.offer.status).toBe('LIVE')
    expect(args.data.viewCount).toEqual({ increment: 1 })
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OFFER_VIEWED', entityId: 'offer-1' }),
    )
  })

  it('returns 404 when the offer is missing, expired, or not visible', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.offerAnalytics.updateMany as any).mockResolvedValue({ count: 0 })

    const res = await POST(postRequest('missing'), ctx('missing'))

    expect(res.status).toBe(404)
  })
})
