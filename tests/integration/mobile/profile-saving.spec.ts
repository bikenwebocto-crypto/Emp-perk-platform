import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    redemption: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({ getAuthenticatedMobileEmployee: vi.fn() }))
vi.mock('@/lib/redemption-savings-validation', () => ({
  validateSaving: vi.fn(() => ({ status: 'VALID', message: null })),
}))
vi.mock('@/lib/redemption-status', () => ({ deriveStatus: vi.fn(() => 'CONFIRMED') }))

import { prisma } from '@/lib/prisma'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { deriveStatus } from '@/lib/redemption-status'
import { PATCH } from '@/app/api/mobile/profile/saving/route'

function patchRequest(body: unknown) {
  return {
    json: async () => body,
  } as any
}

const AUTH_OK = {
  ok: true,
  user: { id: 'user-1' },
  account: { id: 'acc-1' },
  employee: { id: 'emp-1', companyId: 'company-1' },
  company: { id: 'company-1' },
}

const REDEMPTION = {
  id: 'redemption-1',
  employeeId: 'emp-1',
  savingLoggedAt: null,
  offer: { pricing: { pricingType: 'FLAT', configuration: {} } },
}

describe('PATCH /api/mobile/profile/saving', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.redemption.findUnique as any).mockResolvedValue(REDEMPTION)
    ;(prisma.redemption.update as any).mockResolvedValue({
      id: 'redemption-1',
      billAmount: 20,
      loggedSavingAmount: 5,
      quantityPurchased: null,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED' } }), { status: 401 }),
    })

    const res = await PATCH(patchRequest({ redemptionId: 'redemption-1', billAmount: 20, loggedSavingAmount: 5 }))

    expect(res.status).toBe(401)
  })

  it('returns 400 when the saving amount exceeds the bill amount', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await PATCH(patchRequest({ redemptionId: 'redemption-1', billAmount: 10, loggedSavingAmount: 20 }))

    expect(res.status).toBe(400)
    expect(prisma.redemption.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the redemption does not exist', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.redemption.findUnique as any).mockResolvedValue(null)

    const res = await PATCH(patchRequest({ redemptionId: 'missing', billAmount: 20, loggedSavingAmount: 5 }))

    expect(res.status).toBe(404)
  })

  it('returns 403 when the redemption belongs to a different employee', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(prisma.redemption.findUnique as any).mockResolvedValue({ ...REDEMPTION, employeeId: 'someone-else' })

    const res = await PATCH(patchRequest({ redemptionId: 'redemption-1', billAmount: 20, loggedSavingAmount: 5 }))

    expect(res.status).toBe(403)
  })

  it('rejects logging savings on a non-CONFIRMED redemption', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)
    ;(deriveStatus as any).mockReturnValueOnce('PENDING')

    const res = await PATCH(patchRequest({ redemptionId: 'redemption-1', billAmount: 20, loggedSavingAmount: 5 }))

    expect(res.status).toBe(400)
    expect(prisma.redemption.update).not.toHaveBeenCalled()
  })

  it('logs the saving and returns the updated redemption on success', async () => {
    ;(getAuthenticatedMobileEmployee as any).mockResolvedValue(AUTH_OK)

    const res = await PATCH(
      patchRequest({ redemptionId: 'redemption-1', billAmount: 20, loggedSavingAmount: 5, quantityPurchased: 2 }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.saving.redemptionId).toBe('redemption-1')
    const [args] = (prisma.redemption.update as any).mock.calls[0]
    expect(args.where.id).toBe('redemption-1')
    expect(args.data.billAmount).toBe(20)
    expect(args.data.loggedSavingAmount).toBe(5)
  })
})
