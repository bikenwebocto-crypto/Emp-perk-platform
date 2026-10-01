import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    redemption: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/lib/redemption-status', () => ({ deriveStatus: vi.fn(() => 'CONFIRMED') }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { GET } from '@/app/api/mobile/profile/redemptions/route'

function getRequest(query = '') {
  return new Request(`http://localhost/api/mobile/profile/redemptions${query}`) as any
}

const AUTH_OK = {
  ok: true,
  user: { id: 'user-1' },
  account: { id: 'acc-1' },
  employee: { id: 'emp-1', companyId: 'company-1' },
  company: { id: 'company-1' },
}

describe('GET /api/mobile/profile/redemptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.redemption.findMany as any).mockResolvedValue([
      {
        id: 'redemption-1',
        redemptionCode: 'CODE-1',
        discountAmount: 5,
        savingsAmount: 5,
        billAmount: 20,
        loggedSavingAmount: 5,
        quantityPurchased: null,
        savingLoggedAt: null,
        savingEditedAt: null,
        savingValidationStatus: null,
        savingValidationMessage: null,
        isVerified: true,
        verifiedAt: new Date(),
        redeemedAt: new Date(),
        merchantNotes: null,
        employeeNotes: null,
        offer: { id: 'offer-1', title: 'Coffee', offerType: 'FLAT', content: { imageUrls: ['img1.png'] } },
        merchant: { id: 'merchant-1', businessName: 'Coffee Shop', logoUrl: null },
      },
    ])
    ;(prisma.redemption.count as any).mockResolvedValue(1)
    ;(prisma.redemption.groupBy as any).mockResolvedValue([{ merchantId: 'merchant-1' }])
    ;(prisma.redemption.aggregate as any).mockResolvedValue({
      _sum: { savingsAmount: 5, discountAmount: 5 },
    })
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    })

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
  })

  it('scopes the redemption list to the authenticated employee and returns paginated data', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await GET(getRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    const [args] = (prisma.redemption.findMany as any).mock.calls[0]
    expect(args.where.employeeId).toBe('emp-1')
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('redemption-1')
    expect(body.data[0].offer.imageUrl).toBe('img1.png')
    expect(body.meta.merchantsRedeemedCount).toBe(1)
    expect(body.meta.totalSavingsAmount).toBe(5)
  })

  it('caps pageSize at 100', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    await GET(getRequest('?pageSize=500'))

    const [args] = (prisma.redemption.findMany as any).mock.calls[0]
    expect(args.take).toBeLessThanOrEqual(100)
  })
})
