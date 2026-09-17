import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findUnique: vi.fn() },
    notificationEvent: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    offerAnalytics: { update: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { POST, DELETE } from '@/app/api/mobile/offers/[id]/save/route'

function req(method: string, id = 'offer-1') {
  return new Request(`http://localhost/api/mobile/offers/${id}/save`, { method }) as any
}
function ctx(id = 'offer-1') {
  return { params: Promise.resolve({ id }) }
}

const AUTH_OK = { ok: true, employee: { id: 'emp-1', companyId: 'company-1' } } as any

describe('POST /api/mobile/offers/[id]/save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.offerAnalytics.update as any).mockResolvedValue({})
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await POST(req('POST'), ctx())

    expect(res.status).toBe(401)
  })

  it('returns 404 when the offer does not exist', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findUnique as any).mockResolvedValue(null)

    const res = await POST(req('POST', 'missing'), ctx('missing'))

    expect(res.status).toBe(404)
  })

  it('creates a saved_offer notification and increments saveCount on first save', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findUnique as any).mockResolvedValue({ id: 'offer-1', title: 'Offer 1' })
    ;(prisma.notificationEvent.findFirst as any).mockResolvedValue(null)
    ;(prisma.notificationEvent.create as any).mockResolvedValue({ id: 'notif-1' })

    const res = await POST(req('POST'), ctx())
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('notif-1')
    const [createArgs] = (prisma.notificationEvent.create as any).mock.calls[0]
    expect(createArgs.data.referenceType).toBe('saved_offer')
    expect(createArgs.data.employeeId).toBe('emp-1')
    expect(prisma.offerAnalytics.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { offerId: 'offer-1' }, data: { saveCount: { increment: 1 } } }),
    )
  })

  it('returns "Already saved" without creating a duplicate when already saved', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.merchantOffer.findUnique as any).mockResolvedValue({ id: 'offer-1', title: 'Offer 1' })
    ;(prisma.notificationEvent.findFirst as any).mockResolvedValue({ id: 'existing-notif' })

    const res = await POST(req('POST'), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.message).toBe('Already saved')
    expect(body.data.id).toBe('existing-notif')
    expect(prisma.notificationEvent.create).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/mobile/offers/[id]/save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.offerAnalytics.update as any).mockResolvedValue({})
  })

  it('returns the auth failure response when unauthenticated', async () => {
    const authResponse = new Response(JSON.stringify({ success: false }), { status: 401 })
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({ ok: false, response: authResponse })

    const res = await DELETE(req('DELETE'), ctx())

    expect(res.status).toBe(401)
  })

  it('returns 404 when no saved offer exists', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.notificationEvent.findFirst as any).mockResolvedValue(null)

    const res = await DELETE(req('DELETE'), ctx())

    expect(res.status).toBe(404)
  })

  it('deletes the saved_offer notification and decrements saveCount', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.notificationEvent.findFirst as any).mockResolvedValue({ id: 'notif-1' })
    ;(prisma.notificationEvent.delete as any).mockResolvedValue({ id: 'notif-1' })

    const res = await DELETE(req('DELETE'), ctx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(prisma.notificationEvent.delete).toHaveBeenCalledWith({ where: { id: 'notif-1' } })
    expect(prisma.offerAnalytics.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { saveCount: { decrement: 1 } } }),
    )
  })
})
