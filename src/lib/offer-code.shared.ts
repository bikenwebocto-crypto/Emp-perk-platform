export const OFFER_CODE_MIN_LENGTH = 3
export const OFFER_CODE_MAX_LENGTH = 13
/** Length used when a code is generated without an explicit length. */
export const OFFER_CODE_DEFAULT_LENGTH = 8
export const OFFER_CODE_INVALID_MESSAGE = '3 to 13 letters and numbers'

const OFFER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function clampOfferCodeLength(length: number): number {
  if (!Number.isFinite(length)) return OFFER_CODE_MIN_LENGTH
  return Math.min(OFFER_CODE_MAX_LENGTH, Math.max(OFFER_CODE_MIN_LENGTH, Math.round(length)))
}

export function generateOfferCode(length: number = OFFER_CODE_DEFAULT_LENGTH): string {
  const targetLength = clampOfferCodeLength(length)
  let code = ''
  for (let i = 0; i < targetLength; i++) {
    code += OFFER_CODE_CHARS.charAt(Math.floor(Math.random() * OFFER_CODE_CHARS.length))
  }
  return code
}
