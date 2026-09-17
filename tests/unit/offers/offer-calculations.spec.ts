import { describe, it, expect } from 'vitest'
import { validateSaving } from '@/lib/redemption-savings-validation'

describe('offer saving calculations (validateSaving)', () => {
  describe('percentage offers', () => {
    it('accepts a saving within tolerance for a 20% discount', () => {
      const result = validateSaving('percentage', { percent: 20 }, 80, 20)
      expect(result.status).toBe('VALID')
    })

    it('rejects a saving far outside tolerance', () => {
      const result = validateSaving('percentage', { percent: 20 }, 80, 5)
      expect(result.status).toBe('INVALID')
    })

    it('is not verifiable for an out-of-range percent configuration', () => {
      const result = validateSaving('percentage', { percent: 150 }, 80, 20)
      expect(result.status).toBe('NOT_VERIFIABLE')
    })
  })

  describe('missing offer type', () => {
    it('returns NOT_VERIFIABLE when pricingType is undefined', () => {
      const result = validateSaving(undefined, {}, 80, 20)
      expect(result.status).toBe('NOT_VERIFIABLE')
      expect(result.message).toMatch(/offer type is missing/i)
    })
  })

  describe('buy_x_get_y (BOGO) offers', () => {
    it('is not verifiable without enough configuration to compute an expected saving', () => {
      const result = validateSaving('buy_x_get_y', {}, 50, 10)
      expect(result.status).toBe('NOT_VERIFIABLE')
    })
  })

  describe('unknown pricing types', () => {
    it('returns NOT_VERIFIABLE for a pricing type with no known calculation', () => {
      const result = validateSaving('unknown_type', { foo: 'bar' }, 50, 10)
      expect(result.status).toBe('NOT_VERIFIABLE')
    })
  })
})
