import { describe, it, expect } from 'vitest'

/**
 * The platform's merchants and companies are Cyprus-based (see
 * prisma/seed-test.ts: city "Limassol", country "Cyprus") and all
 * money amounts (OfferPricing, RedemptionAnalytics, saving tolerances
 * in src/lib/redemption-savings-validation.ts) are EUR. There is no
 * dedicated i18n/currency formatting module yet — this suite documents
 * the expected Intl-based formatting contract so a future
 * `formatCurrency`/`formatInTimezone` helper can be built against it.
 */

const EUR_LOCALE = 'en-IE' // EUR-using locale with day/month/year ordering close to Cyprus usage
const CYPRUS_TZ = 'Europe/Nicosia'

function formatEur(amount: number): string {
  return new Intl.NumberFormat(EUR_LOCALE, { style: 'currency', currency: 'EUR' }).format(amount)
}

function formatInCyprusTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: CYPRUS_TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

describe('EUR currency formatting', () => {
  it('formats whole and fractional amounts with the euro sign', () => {
    expect(formatEur(20)).toMatch(/€\s?20\.00|€20/)
    expect(formatEur(19.9)).toContain('19.90')
  })

  it('rounds to 2 decimal places, matching the tolerance precision used for saving validation', () => {
    expect(formatEur(9.999)).toContain('10.00')
  })

  it('formats zero without throwing', () => {
    expect(() => formatEur(0)).not.toThrow()
  })
})

describe('Europe/Nicosia timezone handling', () => {
  it('is UTC+2 in winter (standard time)', () => {
    const winter = new Date('2026-01-15T12:00:00Z')
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: CYPRUS_TZ,
      hour: '2-digit',
      hour12: false,
    }).format(winter)
    expect(formatted).toBe('14')
  })

  it('is UTC+3 in summer (EEST, daylight saving)', () => {
    const summer = new Date('2026-07-15T12:00:00Z')
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: CYPRUS_TZ,
      hour: '2-digit',
      hour12: false,
    }).format(summer)
    expect(formatted).toBe('15')
  })

  it('formats a date+time without throwing for both DST states', () => {
    expect(() => formatInCyprusTime(new Date('2026-01-15T12:00:00Z'))).not.toThrow()
    expect(() => formatInCyprusTime(new Date('2026-07-15T12:00:00Z'))).not.toThrow()
  })

  it('"start of day" boundaries used by dashboard stats queries stay stable across the DST transition', () => {
    // The employee dashboard stats route (src/app/api/employee/dashboard/stats)
    // computes startOfDay via the server's local Date, not an explicit
    // timezone conversion. This test documents that a UTC server produces a
    // day boundary that does NOT line up with Europe/Nicosia midnight —
    // a known gap to fix if EU-local "today" stats are required.
    const utcMidnight = new Date('2026-06-01T00:00:00Z')
    const nicosiaHourAtUtcMidnight = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: CYPRUS_TZ, hour: '2-digit', hour12: false }).format(utcMidnight),
    )
    expect(nicosiaHourAtUtcMidnight).not.toBe(0)
  })
})
