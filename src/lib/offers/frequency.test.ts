import { describe, it, expect } from 'vitest'
import {
  frequencyToRepeatHours,
  repeatHoursToFrequency,
  UNLIMITED_REPEAT_HOURS,
} from './frequency'
import { getRepeatAfterHours, parseRepeatAfterHoursInput } from '../redemption-tracking'
import { generateOfferCode, OFFER_CODE_MAX_LENGTH, OFFER_CODE_MIN_LENGTH } from '../offer-code.shared'

describe('offer frequency', () => {
  it('maps options to cooldown hours', () => {
    expect(frequencyToRepeatHours('DAY')).toBe(24)
    expect(frequencyToRepeatHours('WEEK')).toBe(168)
    expect(frequencyToRepeatHours('MONTH')).toBe(720)
    expect(frequencyToRepeatHours('UNLIMITED')).toBe(UNLIMITED_REPEAT_HOURS)
  })

  it('round-trips hours back to options (string or number)', () => {
    expect(repeatHoursToFrequency('24')).toBe('DAY')
    expect(repeatHoursToFrequency(168)).toBe('WEEK')
    expect(repeatHoursToFrequency('720')).toBe('MONTH')
    expect(repeatHoursToFrequency(String(UNLIMITED_REPEAT_HOURS))).toBe('UNLIMITED')
  })

  it('returns null for empty or legacy custom values', () => {
    expect(repeatHoursToFrequency('')).toBeNull()
    expect(repeatHoursToFrequency(null)).toBeNull()
    expect(repeatHoursToFrequency('48')).toBeNull()
    expect(repeatHoursToFrequency('0')).toBeNull()
  })

  it('every option is accepted by the existing API and redeem logic', () => {
    for (const f of ['DAY', 'WEEK', 'MONTH', 'UNLIMITED'] as const) {
      const hours = frequencyToRepeatHours(f)
      expect(parseRepeatAfterHoursInput(hours)).toEqual({ ok: true, value: hours })
      expect(getRepeatAfterHours({ repeatAfterHours: hours })).toBe(hours)
    }
  })
})

describe('offer code length', () => {
  it('is 3 to 13 characters', () => {
    expect(OFFER_CODE_MIN_LENGTH).toBe(3)
    expect(OFFER_CODE_MAX_LENGTH).toBe(13)
    expect(generateOfferCode(1)).toHaveLength(3)
    expect(generateOfferCode(50)).toHaveLength(13)
    expect(generateOfferCode()).toMatch(/^[A-Z0-9]{8}$/)
  })
})
