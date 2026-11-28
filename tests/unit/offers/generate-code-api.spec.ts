import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/merchant-session', () => ({
  getMerchantFromSession: vi.fn(async () => ({ id: 'merchant-1' })),
}))
vi.mock('@/lib/offer-code', () => ({
  generateUniqueOfferCode: vi.fn(async () => 'SAVE1234'),
}))

import { POST } from '@/app/api/merchant/offers/generate-code/route'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { generateUniqueOfferCode } from '@/lib/offer-code'

const url = 'http://localhost/api/merchant/offers/generate-code'
const request = (body?: unknown) =>
  new Request(url, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as any

describe('POST /api/merchant/offers/generate-code', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getMerchantFromSession).mockResolvedValue({ id: 'merchant-1' } as any)
    vi.mocked(generateUniqueOfferCode).mockResolvedValue('SAVE1234')
  })

  it('rejects callers without a merchant session', async () => {
    vi.mocked(getMerchantFromSession).mockResolvedValueOnce(null as any)
    const res = await POST(request({ length: 6 }))
    expect(res.status).toBe(401)
    expect(generateUniqueOfferCode).not.toHaveBeenCalled()
  })

  it('returns a unique code generated with the requested length', async () => {
    const res = await POST(request({ length: 6 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { code: 'SAVE1234' } })
    expect(generateUniqueOfferCode).toHaveBeenCalledWith(6)
  })
})
