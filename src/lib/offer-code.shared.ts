export const OFFER_CODE_MIN_LENGTH = 6
export const OFFER_CODE_MAX_LENGTH = 30

const OFFER_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function clampOfferCodeLength(length: number): number {
  if (!Number.isFinite(length)) return OFFER_CODE_MIN_LENGTH
  return Math.min(OFFER_CODE_MAX_LENGTH, Math.max(OFFER_CODE_MIN_LENGTH, Math.round(length)))
}

export function generateOfferCode(length: number = OFFER_CODE_MIN_LENGTH): string {
  const targetLength = clampOfferCodeLength(length)
  let code = ''
  for (let i = 0; i < targetLength; i++) {
    code += OFFER_CODE_CHARS.charAt(Math.floor(Math.random() * OFFER_CODE_CHARS.length))
  }
  return code
}
