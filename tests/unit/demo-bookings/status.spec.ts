import { describe, it, expect } from 'vitest'
import {
  DEMO_BOOKING_STATUSES,
  canTransition,
  getAllowedNextStatuses,
  isDemoBookingStatus,
} from '@/lib/demo-bookings/status'

describe('demo booking status workflow', () => {
  it('lists every status', () => {
    expect(DEMO_BOOKING_STATUSES).toEqual(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'])
  })

  it('validates status values', () => {
    expect(isDemoBookingStatus('PENDING')).toBe(true)
    expect(isDemoBookingStatus('nope')).toBe(false)
    expect(isDemoBookingStatus(null)).toBe(false)
    expect(isDemoBookingStatus(42)).toBe(false)
  })

  it('allows confirming or cancelling a pending booking', () => {
    expect(getAllowedNextStatuses('PENDING')).toEqual(['CONFIRMED', 'CANCELLED'])
  })

  it('allows completing or cancelling a confirmed booking', () => {
    expect(getAllowedNextStatuses('CONFIRMED')).toEqual(['COMPLETED', 'CANCELLED'])
  })

  it('treats cancelled and completed as terminal', () => {
    expect(getAllowedNextStatuses('CANCELLED')).toEqual([])
    expect(getAllowedNextStatuses('COMPLETED')).toEqual([])
  })

  it('never jumps a pending booking straight to completed', () => {
    expect(canTransition('PENDING', 'COMPLETED')).toBe(false)
    expect(canTransition('PENDING', 'CONFIRMED')).toBe(true)
    expect(canTransition('CONFIRMED', 'COMPLETED')).toBe(true)
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false)
  })
})
