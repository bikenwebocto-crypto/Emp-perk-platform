import { prisma } from '@/lib/prisma'
import {
  generateOfferCode,
  OFFER_CODE_MIN_LENGTH,
  OFFER_CODE_MAX_LENGTH,
  OFFER_CODE_DEFAULT_LENGTH,
  OFFER_CODE_INVALID_MESSAGE,
} from './offer-code.shared'

export {
  generateOfferCode,
  OFFER_CODE_MIN_LENGTH,
  OFFER_CODE_MAX_LENGTH,
  OFFER_CODE_DEFAULT_LENGTH,
  OFFER_CODE_INVALID_MESSAGE,
}

export function clampOfferCodeLength(length: number): number {
  if (!Number.isFinite(length)) return OFFER_CODE_MIN_LENGTH
  return Math.min(OFFER_CODE_MAX_LENGTH, Math.max(OFFER_CODE_MIN_LENGTH, Math.round(length)))
}

/**
 * Generate a unique offer code with a configurable length.
 * Format: uppercase letters and digits only, with a length between 3 and 13 chars.
 * Retries up to maxAttempts times if a collision is detected.
 */
export async function generateUniqueOfferCode(
  length: number = OFFER_CODE_DEFAULT_LENGTH,
  maxAttempts: number = 10,
): Promise<string> {
  const targetLength = clampOfferCodeLength(length)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateOfferCode(targetLength)
    const existing = await prisma.offerRedemption.findFirst({
      where: {
        configuration: { path: ['code'], equals: code },
      },
      select: { id: true },
    })
    if (!existing) return code
  }
  throw new Error('Failed to generate unique offer code after maximum attempts')
}

/**
 * Validate offer code format: between 3 and 13 alphanumeric uppercase characters.
 */
export function isValidOfferCode(code: string): boolean {
  return /^[A-Z0-9]{3,13}$/.test(code)
}

/**
 * Normalize offer code to uppercase and trim whitespace.
 */
export function normalizeOfferCode(code: string): string {
  return code.trim().toUpperCase()
}

export const PROMO_CODE_TAKEN_MESSAGE =
  'This promo code is already used by another live offer. Please choose a different code.'

/**
 * True when another LIVE (non-deleted) offer already uses this promo code.
 * Codes compare case-insensitively. Pass the offer being edited as `excludeOfferId`.
 */
export async function isPromoCodeTakenByLiveOffer(
  code: string,
  excludeOfferId?: string | null,
): Promise<boolean> {
  const normalized = normalizeOfferCode(code)
  if (!normalized) return false
  const candidates = await prisma.offerRedemption.findMany({
    where: {
      offer: {
        status: 'LIVE',
        deletedAt: null,
        ...(excludeOfferId ? { id: { not: excludeOfferId } } : {}),
      },
      configuration: { path: ['code'], not: null as any },
    },
    select: { configuration: true },
  })
  return candidates.some((r) => {
    const c = (r.configuration as { code?: unknown } | null)?.code
    return typeof c === 'string' && normalizeOfferCode(c) === normalized
  })
}
