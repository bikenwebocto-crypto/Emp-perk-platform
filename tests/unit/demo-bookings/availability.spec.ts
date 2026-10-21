import { describe, it, expect } from 'vitest'
import {
  availableSlots,
  businessDaySlotStarts,
  businessWallClockToUtc,
  findCollisions,
  formatBusinessLocal,
  formatInTimeZone,
  intervalsOverlap,
  isValidDateKey,
  isValidTimeZone,
  meetingEnd,
  toBusinessWallClock,
  validateBookingPolicy,
  type BookingInterval,
} from '@/lib/demo-bookings/availability'

/** 2026-01-15 is a Thursday; 2026-07-15 is a Wednesday. */
const WINTER = '2026-01-15'
const SUMMER = '2026-07-15'
const THURSDAY = 4

/** A UTC instant from a business-zone wall clock. */
function utc(dateKey: string, hour: number, minute = 0): Date {
  return businessWallClockToUtc(dateKey, hour * 60 + minute)
}

function booking(id: string, startsAt: Date, durationMinutes = 30, status = 'PENDING'): BookingInterval {
  return { id, startsAt, durationMinutes, status }
}

describe('meeting intervals', () => {
  it('ends at startsAt + duration', () => {
    expect(meetingEnd(new Date('2026-01-15T10:00:00Z'), 30).toISOString()).toBe('2026-01-15T10:30:00.000Z')
  })

  it('treats [start, end) as half-open: back-to-back slots do not overlap', () => {
    const a = { startsAt: new Date('2026-01-15T10:00:00Z'), durationMinutes: 30 }
    const b = { startsAt: new Date('2026-01-15T10:30:00Z'), durationMinutes: 30 }
    expect(intervalsOverlap(a, b)).toBe(false)
    expect(intervalsOverlap(b, a)).toBe(false)
  })

  it('detects the spec example 10:00–10:30 vs 10:15–10:45', () => {
    const a = { startsAt: new Date('2026-01-15T10:00:00Z'), durationMinutes: 30 }
    const b = { startsAt: new Date('2026-01-15T10:15:00Z'), durationMinutes: 30 }
    expect(intervalsOverlap(a, b)).toBe(true)
  })

  it('detects containment in both directions', () => {
    const inside = { startsAt: new Date('2026-01-15T10:05:00Z'), durationMinutes: 5 }
    const outside = { startsAt: new Date('2026-01-15T10:00:00Z'), durationMinutes: 30 }
    expect(intervalsOverlap(outside, inside)).toBe(true)
    expect(intervalsOverlap(inside, outside)).toBe(true)
  })

  it('ignores CANCELLED bookings, and excludes the row being rescheduled', () => {
    const candidate = { startsAt: utc(WINTER, 10), durationMinutes: 30 }
    const rows = [
      booking('cancelled', utc(WINTER, 10), 30, 'CANCELLED'),
      booking('self', utc(WINTER, 10), 30, 'PENDING'),
      booking('real', utc(WINTER, 10, 15), 30, 'PENDING'),
    ]
    // CANCELLED is skipped; the pending rows collide.
    expect(findCollisions(candidate, rows).map((r) => r.id)).toEqual(['self', 'real'])
    // Rescheduling 'self' must not collide with itself.
    expect(findCollisions(candidate, rows, 'self').map((r) => r.id)).toEqual(['real'])
    expect(findCollisions(candidate, rows, 'real').map((r) => r.id)).toEqual(['self'])
  })
})

describe('timezone handling', () => {
  it('maps business wall clock to UTC across DST (winter UTC+2, summer UTC+3)', () => {
    expect(utc(WINTER, 9).toISOString()).toBe('2026-01-15T07:00:00.000Z')
    expect(utc(SUMMER, 9).toISOString()).toBe('2026-07-15T06:00:00.000Z')
  })

  it('reads the business wall clock back from a UTC instant', () => {
    const winter = toBusinessWallClock(new Date('2026-01-15T07:00:00Z'))
    expect(winter).toMatchObject({ dateKey: WINTER, hour: 9, minute: 0, weekday: THURSDAY })
    expect(toBusinessWallClock(new Date('2026-07-15T06:00:00Z')).hour).toBe(9)
  })

  it('formats a business-local timestamp', () => {
    expect(formatBusinessLocal(new Date('2026-01-15T07:00:00Z'))).toBe('2026-01-15 09:00')
  })

  it('renders an instant in an arbitrary requester timezone', () => {
    // 2026-07-15T06:00Z is 09:00 in Nicosia (EEST, UTC+3) and 07:00 in London (BST, UTC+1).
    expect(formatInTimeZone(new Date('2026-07-15T06:00:00Z'), 'Europe/Nicosia')).toContain('15 July 2026')
    expect(formatInTimeZone(new Date('2026-07-15T06:00:00Z'), 'Europe/Nicosia')).toContain('09:00')
    expect(formatInTimeZone(new Date('2026-07-15T06:00:00Z'), 'Europe/London')).toContain('07:00')
    // An unknown zone falls back to the business zone rather than throwing.
    expect(formatInTimeZone(new Date('2026-07-15T06:00:00Z'), 'Mars/Olympus')).toContain('09:00')
  })

  it('validates time zones and date keys', () => {
    expect(isValidTimeZone('Europe/Nicosia')).toBe(true)
    expect(isValidTimeZone('Not/AZone')).toBe(false)
    expect(isValidDateKey('2026-01-15')).toBe(true)
    expect(isValidDateKey('2026-02-31')).toBe(false)
    expect(isValidDateKey('15-01-2026')).toBe(false)
  })
})

describe('validateBookingPolicy', () => {
  // 25 hours before the Thursday 10:00 slot — inside the notice window.
  const now = utc('2026-01-14', 9)
  const candidate = { startsAt: utc(WINTER, 10), durationMinutes: 30, timezone: 'Europe/Nicosia' }

  it('accepts a slot inside working hours and outside the notice window', () => {
    expect(validateBookingPolicy(candidate, now)).toBeNull()
  })

  it('accepts the first (09:00) and last (16:30) grid starts', () => {
    expect(validateBookingPolicy({ ...candidate, startsAt: utc(WINTER, 9) }, now)).toBeNull()
    expect(validateBookingPolicy({ ...candidate, startsAt: utc(WINTER, 16, 30) }, now)).toBeNull()
  })

  it('rejects an unsupported duration', () => {
    expect(validateBookingPolicy({ ...candidate, durationMinutes: 45 }, now)).toMatchObject({
      reason: 'INVALID_DURATION',
      field: 'durationMinutes',
    })
  })

  it('rejects an unknown time zone', () => {
    expect(validateBookingPolicy({ ...candidate, timezone: 'Mars/Olympus' }, now)).toMatchObject({
      reason: 'INVALID_TIMEZONE',
      field: 'timezone',
    })
  })

  it('rejects a past time and a time inside the notice window', () => {
    expect(validateBookingPolicy({ ...candidate, startsAt: utc(WINTER, 8) }, utc(WINTER, 9))).toMatchObject({ reason: 'IN_THE_PAST' })
    expect(validateBookingPolicy({ ...candidate, startsAt: utc(WINTER, 10) }, utc(WINTER, 9))).toMatchObject({ reason: 'TOO_SOON' })
  })

  it('rejects a time beyond the booking horizon', () => {
    expect(validateBookingPolicy({ ...candidate, startsAt: utc('2026-04-15', 10) }, now)).toMatchObject({ reason: 'TOO_FAR' })
  })

  it('rejects weekends, before-hours and meetings that would run past closing', () => {
    // 2026-01-17 is a Saturday. Notice/horizon pass, working hours do not.
    expect(validateBookingPolicy({ ...candidate, startsAt: utc('2026-01-17', 10) }, now)).toMatchObject({ reason: 'OUTSIDE_WORKING_HOURS' })
    // 2026-01-19 is a Monday, 08:00 — a weekday but before opening (and far enough out).
    expect(validateBookingPolicy({ ...candidate, startsAt: utc('2026-01-19', 8) }, now)).toMatchObject({ reason: 'OUTSIDE_WORKING_HOURS' })
    // 16:45 + 30 minutes runs past the 17:00 close.
    expect(validateBookingPolicy({ ...candidate, startsAt: utc(WINTER, 16, 45) }, now)).toMatchObject({ reason: 'OUTSIDE_WORKING_HOURS' })
  })
})

describe('availability grid', () => {
  it('offers 09:00–16:30 in 30-minute steps (16 slots a day)', () => {
    const slots = businessDaySlotStarts(WINTER)
    expect(slots).toHaveLength(16)
    expect(slots[0].toISOString()).toBe('2026-01-15T07:00:00.000Z')
    expect(slots[slots.length - 1].toISOString()).toBe('2026-01-15T14:30:00.000Z')
  })

  it('removes slots that collide with a booking, using the real interval', () => {
    const now = utc('2026-01-14', 9)
    // 10:15–10:45 overlaps both the 10:00 and the 10:30 grid slots.
    const rows = [booking('b1', utc(WINTER, 10, 15), 30)]
    const slots = availableSlots({ dateKey: WINTER, durationMinutes: 30, bookings: rows, now })
    const starts = slots.map((s) => s.startsAt.toISOString())
    expect(slots).toHaveLength(14)
    expect(starts).not.toContain(utc(WINTER, 10).toISOString())
    expect(starts).not.toContain(utc(WINTER, 10, 30).toISOString())
    expect(starts).toContain(utc(WINTER, 9, 30).toISOString())
    expect(starts).toContain(utc(WINTER, 11).toISOString())
  })

  it('does not offer slots inside the notice window', () => {
    const slots = availableSlots({ dateKey: WINTER, durationMinutes: 30, bookings: [], now: utc(WINTER, 9) })
    expect(slots).toHaveLength(0)
  })
})
