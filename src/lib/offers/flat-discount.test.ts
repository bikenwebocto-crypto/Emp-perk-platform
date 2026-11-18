import { describe, it, expect } from 'vitest'
import {
  FLAT_DISCOUNT_MESSAGES as M,
  flatDiscountPercent,
  isValidDiscountAmount,
  parseMoneyToCents,
  PERCENT_DISCOUNT_MESSAGES,
  suggestedPercentMax,
  validateFlatDiscount,
  validatePercentDiscount,
} from './flat-discount'

const submit = (discountValue: unknown, minimumSpend: unknown) =>
  validateFlatDiscount({ discountValue, minimumSpend }, { requireAll: true })
const draft = (discountValue: unknown, minimumSpend: unknown) =>
  validateFlatDiscount({ discountValue, minimumSpend }, { requireAll: false })

describe('validateFlatDiscount — spec examples', () => {
  it.each([
    [10, 50, true],
    [20, 20, false],
    [50, 30, false],
    [100, 100, false],
    [100, 0, false],
    [0, 50, false],
    [10, 100, true],
    [99.99, 100, true],
  ])('discount %s / min spend %s → valid=%s', (d, m, valid) => {
    expect(Object.keys(submit(d, m)).length === 0).toBe(valid)
  })
})

describe('validateFlatDiscount — individual rules', () => {
  it('requires discount amount on submit', () => {
    expect(submit('', 50).discountValue).toBe(M.discountRequired)
    expect(submit(null, 50).discountValue).toBe(M.discountRequired)
    expect(submit(undefined, 50).discountValue).toBe(M.discountRequired)
  })

  it('requires minimum spend on submit', () => {
    expect(submit(10, '').minimumSpend).toBe(M.minSpendRequired)
    expect(submit(10, null).minimumSpend).toBe(M.minSpendRequired)
  })

  it('rejects zero and negative values', () => {
    expect(submit(0, 50).discountValue).toBe(M.discountNotPositive)
    expect(submit(-5, 50).discountValue).toBe(M.discountNotPositive)
    expect(submit('-5', 50).discountValue).toBe(M.discountNotPositive)
    expect(submit(10, 0).minimumSpend).toBe(M.minSpendNotPositive)
    expect(submit(10, -1).minimumSpend).toBe(M.minSpendNotPositive)
  })

  it('rejects minimum spend equal to discount (exactly 100%)', () => {
    const e = submit('20', '20')
    expect(e.minimumSpend).toBe(M.minSpendNotGreater)
    expect(e.discountValue).toBe(M.fullDiscount)
  })

  it('rejects minimum spend below discount (>100%)', () => {
    const e = submit(50, 30)
    expect(e.minimumSpend).toBe(M.minSpendNotGreater)
    expect(e.discountValue).toBe(M.fullDiscount)
  })

  it('accepts valid decimal amounts as numbers or strings', () => {
    expect(submit('99.99', '100')).toEqual({})
    expect(submit(0.01, 0.02)).toEqual({})
    expect(submit('12.5', '12.51')).toEqual({})
  })

  it('compares exactly in cents (no float drift)', () => {
    // "0.30" and 0.3 are the same amount → exactly 100% → invalid
    expect(submit('0.30', 0.3).minimumSpend).toBe(M.minSpendNotGreater)
    expect(submit('0.29', '0.30')).toEqual({})
  })

  it('rejects invalid characters and too many decimals', () => {
    expect(submit('10abc', 50).discountValue).toBe(M.discountInvalid)
    expect(submit('1e3', 5000).discountValue).toBe(M.discountInvalid)
    expect(submit(10, '50.001').minimumSpend).toBe(M.minSpendInvalid)
    expect(submit(Number.NaN, 50).discountValue).toBe(M.discountInvalid)
    expect(submit(Infinity, 50).discountValue).toBe(M.discountInvalid)
    expect(submit({}, 50).discountValue).toBe(M.discountInvalid)
  })
})

describe('validateFlatDiscount — drafts', () => {
  it('allows empty fields', () => {
    expect(draft('', '')).toEqual({})
    expect(draft(10, '')).toEqual({})
  })
  it('still rejects invalid combinations and values', () => {
    expect(draft(100, 100).minimumSpend).toBe(M.minSpendNotGreater)
    expect(draft(-1, '').discountValue).toBe(M.discountNotPositive)
  })
})

describe('validatePercentDiscount', () => {
  const P = PERCENT_DISCOUNT_MESSAGES
  const pct = (discountPercent: unknown, minimumSpend: unknown, discountMax: unknown, requireAll = true) =>
    validatePercentDiscount({ discountPercent, minimumSpend, discountMax }, { requireAll })

  it.each([
    [20, 50, 10, true],      // exactly % × min spend
    [20, 50, 30, true],      // higher cap, still below min spend
    [90, 100, 90, true],
    [12.5, 80, 10, true],
    [0, 50, 10, false],
    [91, 50, 10, false],
    [-5, 50, 10, false],
    [20, 0, 10, false],
    [20, 50, 0, false],
    [20, 50, 50, false],     // cap = min spend → 100%
    [20, 50, 60, false],     // cap > min spend
    [20, 50, 9.99, false],   // cap below % × min spend
  ])('%s%% / min %s / max %s → valid=%s', (p, m, x, valid) => {
    expect(Object.keys(pct(p, m, x)).length === 0).toBe(valid)
  })

  it('requires all three on submit', () => {
    expect(pct('', 50, 10).discountPercent).toBe(P.percentRequired)
    expect(pct(20, '', 10).minimumSpend).toBe(P.minSpendRequired)
    expect(pct(20, 50, '').discountMax).toBe(P.maxRequired)
  })

  it('gives specific messages', () => {
    expect(pct(95, 50, 10).discountPercent).toBe(P.percentRange)
    expect(pct(20, 50, 50).discountMax).toBe(P.maxNotBelowMinSpend)
    expect(pct(20, 50, 5).discountMax).toBe(P.maxBelowPercentOfMinSpend)
  })

  it('allows partial drafts but not invalid values', () => {
    expect(pct(20, '', '', false)).toEqual({})
    expect(pct(20, 50, 50, false).discountMax).toBe(P.maxNotBelowMinSpend)
  })

  it('suggestedPercentMax = min spend × %', () => {
    expect(suggestedPercentMax(20, 50)).toBe('10.00')
    expect(suggestedPercentMax(12.5, 80)).toBe('10.00')
    expect(suggestedPercentMax('', 50)).toBe('')
  })
})

describe('helpers', () => {
  it('parseMoneyToCents', () => {
    expect(parseMoneyToCents('99.99')).toEqual({ kind: 'ok', cents: 9999 })
    expect(parseMoneyToCents(12.5)).toEqual({ kind: 'ok', cents: 1250 })
    expect(parseMoneyToCents('  ')).toEqual({ kind: 'missing' })
  })
  it('isValidDiscountAmount gates the Minimum Spend field', () => {
    expect(isValidDiscountAmount('10')).toBe(true)
    expect(isValidDiscountAmount('')).toBe(false)
    expect(isValidDiscountAmount('0')).toBe(false)
    expect(isValidDiscountAmount('-3')).toBe(false)
  })
  it('flatDiscountPercent = discount / min spend × 100', () => {
    expect(flatDiscountPercent(10, 50)).toBe(20)
    expect(flatDiscountPercent(99.99, 100)).toBeCloseTo(99.99)
    expect(flatDiscountPercent(10, 0)).toBeNull()
  })
})
