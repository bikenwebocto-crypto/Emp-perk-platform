import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findFirst: vi.fn() },
    merchantBranch: { findFirst: vi.fn() },
  },
}))
vi.mock('@/lib/employee-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/employee-session')>('@/lib/employee-session')
  return { ...actual, getEmployeeFromSession: vi.fn() }
})
vi.mock('@/lib/redemption-code', () => ({ generateRedemptionCode: vi.fn(() => 'CODE-1234') }))
vi.mock('@/lib/redemption-status', () => ({
  deriveStatus: vi.fn(() => 'VERIFIED'),
  encodeMethod: vi.fn(() => 'IN_STORE_QR'),
  RedemptionMethod: {},
}))

import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession } from '@/lib/employee-session'
import { POST } from '@/app/api/employee/redeem/route'

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/employee/redeem', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any
}

describe('POST /api/employee/redeem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without an employee session', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue(null)

    const res = await POST(jsonRequest({ offerId: 'offer-1' }))

    expect(res.status).toBe(401)
  })

  it('returns 400 when offerId is missing', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })

    const res = await POST(jsonRequest({}))

    expect(res.status).toBe(400)
  })

  it('returns 404 when the offer does not exist or is soft-deleted', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue(null)

    const res = await POST(jsonRequest({ offerId: 'missing-offer' }))

    expect(res.status).toBe(404)
    expect(prisma.merchantOffer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'missing-offer', deletedAt: null } }),
    )
  })

  it('rejects redemption of an offer that is not LIVE', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue({
      id: 'offer-1',
      status: 'EXPIRED',
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 86_400_000),
      merchant: { id: 'merchant-1' },
      pricing: null,
      redemption: { redemptionType: 'IN_STORE_QR', configuration: {} },
    })

    const res = await POST(jsonRequest({ offerId: 'offer-1' }))

    expect(res.status).toBe(400)
  })

  it('rejects a BOOKING_LINK offer with no configured booking URL', async () => {
    ;(getEmployeeFromSession as any).mockResolvedValue({ id: 'emp-1', companyId: 'company-1' })
    ;(prisma.merchantOffer.findFirst as any).mockResolvedValue({
      id: 'offer-1',
      status: 'LIVE',
      startDate: new Date(Date.now() - 86_400_000),
      endDate: new Date(Date.now() + 86_400_000),
      merchant: { id: 'merchant-1' },
      pricing: null,
      redemption: { redemptionType: 'BOOKING_LINK', configuration: {} },
    })

    const res = await POST(jsonRequest({ offerId: 'offer-1' }))

    expect(res.status).toBe(400)
  })
})
