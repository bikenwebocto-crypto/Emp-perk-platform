import { prisma } from '@/lib/prisma'
import {
  generateOfferCode,
  OFFER_CODE_MIN_LENGTH,
  OFFER_CODE_MAX_LENGTH,
} from './offer-code.shared'

export {
  generateOfferCode,
  OFFER_CODE_MIN_LENGTH,
  OFFER_CODE_MAX_LENGTH,
}

export function clampOfferCodeLength(length: number): number {
  if (!Number.isFinite(length)) return OFFER_CODE_MIN_LENGTH
  return Math.min(OFFER_CODE_MAX_LENGTH, Math.max(OFFER_CODE_MIN_LENGTH, Math.round(length)))
}

/**
 * Generate a unique offer code with a configurable length.
 * Format: uppercase letters and digits only, with a length between 6 and 30 chars.
 * Retries up to maxAttempts times if a collision is detected.
 */
export async function generateUniqueOfferCode(
  length: number = OFFER_CODE_MIN_LENGTH,
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
 * Validate offer code format: between 6 and 30 alphanumeric uppercase characters.
 */
export function isValidOfferCode(code: string): boolean {
  return /^[A-Z0-9]{6,30}$/.test(code)
}

/**
 * Normalize offer code to uppercase and trim whitespace.
 */
export function normalizeOfferCode(code: string): string {
  return code.trim().toUpperCase()
}
