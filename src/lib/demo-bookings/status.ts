import type { DemoBookingStatus } from '@prisma/client'

// ─────────────────────────────────────────────────────────────
// Demo-booking status workflow — the single source of truth for what an admin
// may move a booking into. Pure data + functions (no server imports) so both
// the admin API and the admin UI can import the same rules.
//
// PENDING  – the slot is held, the visitor has not been confirmed yet.
// CONFIRMED – the meeting is on; the slot stays held.
// CANCELLED – the meeting is off; the slot is freed for others.
// COMPLETED – the meeting happened; terminal.
// ─────────────────────────────────────────────────────────────

export const DEMO_BOOKING_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
] as const satisfies readonly DemoBookingStatus[]

/** Statuses that still hold (reserve) their slot. */
export const SLOT_HOLDING_STATUSES: readonly DemoBookingStatus[] = ['PENDING', 'CONFIRMED']

export function isDemoBookingStatus(value: unknown): value is DemoBookingStatus {
  return typeof value === 'string' && (DEMO_BOOKING_STATUSES as readonly string[]).includes(value)
}

const STATUS_TRANSITIONS: Record<DemoBookingStatus, DemoBookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  CANCELLED: [],
  COMPLETED: [],
}

export function getAllowedNextStatuses(status: DemoBookingStatus): DemoBookingStatus[] {
  return STATUS_TRANSITIONS[status] ?? []
}

export function canTransition(from: DemoBookingStatus, to: DemoBookingStatus): boolean {
  return getAllowedNextStatuses(from).includes(to)
}

export const DEMO_BOOKING_STATUS_LABELS: Record<DemoBookingStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}
