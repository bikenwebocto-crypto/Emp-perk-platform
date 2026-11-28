import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    offerRedemption: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => null),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  isPromoCodeTakenByLiveOffer,
  isValidOfferCode,
  normalizeOfferCode,
} from './offer-code'
import {
  generateOfferCode,
  OFFER_CODE_INVALID_MESSAGE,
  OFFER_CODE_MAX_LENGTH,
  OFFER_CODE_MIN_LENGTH,
  PROMO_CODE_TAKEN_MESSAGE,
} from './offer-code.shared'

describe('promo code format', () => {
  it('accepts 3 to 13 uppercase letters and digits', () => {
    expect(isValidOfferCode('ABC')).toBe(true)
    expect(isValidOfferCode('A1B2C3D4E5F6G')).toBe(true) // 13 chars
    expect(generateOfferCode()).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('rejects short, long, lowercase, spaced and punctuated codes', () => {
    expect(isValidOfferCode('AB')).toBe(false)
    expect(isValidOfferCode('A1B2C3D4E5F6G7')).toBe(false)
    expect(isValidOfferCode('abc')).toBe(false)
    expect(isValidOfferCode('AB C')).toBe(false)
    expect(isValidOfferCode('AB-C')).toBe(false)
  })

  it('uses the documented hint and taken messages', () => {
    expect(OFFER_CODE_MIN_LENGTH).toBe(3)
    expect(OFFER_CODE_MAX_LENGTH).toBe(13)
    expect(OFFER_CODE_INVALID_MESSAGE).toBe('3 to 13 letters and numbers')
    expect(PROMO_CODE_TAKEN_MESSAGE).toBe(
      'This promo code is already used by another live offer. Please choose a different code.',
    )
  })

  it('normalizes lowercase and surrounding whitespace', () => {
    expect(normalizeOfferCode('  save10 ')).toBe('SAVE10')
  })
})

describe('promo code uniqueness across live offers', () => {
  beforeEach(() => {
    vi.mocked(prisma.offerRedemption.findMany).mockResolvedValue([])
  })

  it('detects a code used by another live offer, case-insensitively', async () => {
    vi.mocked(prisma.offerRedemption.findMany).mockResolvedValue([
      { configuration: { code: 'save10' } },
    ] as any)

    expect(await isPromoCodeTakenByLiveOffer('SAVE10')).toBe(true)
    expect(prisma.offerRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          offer: expect.objectContaining({ status: 'LIVE', deletedAt: null }),
        }),
      }),
    )
  })

  it('excludes the offer being edited from the lookup', async () => {
    vi.mocked(prisma.offerRedemption.findMany).mockResolvedValue([])

    expect(await isPromoCodeTakenByLiveOffer('SAVE10', 'offer-1')).toBe(false)
    expect(prisma.offerRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          offer: expect.objectContaining({ id: { not: 'offer-1' } }),
        }),
      }),
    )
  })

  it('ignores redemption rows without a string code', async () => {
    vi.mocked(prisma.offerRedemption.findMany).mockResolvedValue([
      { configuration: null },
      { configuration: {} },
      { configuration: { code: null } },
    ] as any)

    expect(await isPromoCodeTakenByLiveOffer('SAVE10')).toBe(false)
  })
})
