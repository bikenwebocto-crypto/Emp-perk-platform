import type { DemoBookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateDemoBookingReference } from './reference';
import type { DemoLeadType } from './schema';
import { canTransition, getAllowedNextStatuses } from './status';
import {
  availableSlots,
  businessDayBookingWindow,
  candidateOverlapWhere,
  DEFAULT_DURATION_MINUTES,
  DEMO_BOOKING_FORM_KEY,
  findCollisions,
  toBusinessWallClock,
  validateBookingPolicy,
  type AvailableSlot,
  type BookingInterval,
  type PolicyViolation,
} from './availability';

// ─────────────────────────────────────────────────────────────
// Server-side demo scheduling.
//
// Single entry point for creating (and, later, rescheduling) a demo booking, so
// a reschedule cannot skip the checks a create performs. The lead already exists
// conceptually as a Lead row; this creates/reuses it and writes the booking in
// one transaction under an advisory lock, re-checking availability after taking
// the lock. Availability shown in the browser is never trusted.
// ─────────────────────────────────────────────────────────────

export const CONFLICT_MESSAGE = 'That time was just taken. Please pick another available slot.';

export interface DemoLeadContact {
  firstName: string;
  lastName: string;
  phone: string | null;
  companyName: string;
  hearAbout: string | null;
  consents: Prisma.InputJsonObject;
  consentAt: Date;
  consentVersion: string | null;
}

export interface ScheduleDemoBookingInput {
  lead: DemoLeadContact;
  /** Whether the visitor books as an employer or a merchant. */
  type: DemoLeadType;
  email: string;
  /** UTC instant. */
  startsAt: Date;
  timezone: string;
  /** Falls back to the fixed default when the client omits it. */
  durationMinutes?: number;
  notes: string | null;
}

export interface ScheduledBooking {
  id: string;
  reference: string;
  status: string;
  leadId: string;
  startsAt: Date;
  durationMinutes: number;
  timezone: string;
}

export type ScheduleResult =
  | {
      ok: true;
      booking: ScheduledBooking;
      /** Other open bookings this request overlaps; the admin resolves them. */
      overlapCount: number;
    }
  | { ok: false; kind: 'POLICY'; violation: PolicyViolation };

export async function scheduleDemoBooking(
  input: ScheduleDemoBookingInput,
  now: Date = new Date(),
): Promise<ScheduleResult> {
  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const candidate = { startsAt: input.startsAt, durationMinutes };

  // Re-validate against policy before touching the database.
  const violation = validateBookingPolicy({ ...candidate, timezone: input.timezone }, now);
  if (violation) return { ok: false, kind: 'POLICY', violation };

  const dayKey = toBusinessWallClock(input.startsAt).dateKey;

  const outcome = await prisma.$transaction(async (tx) => {
    // A request for a time that is already held is still accepted as PENDING:
    // the admin resolves the clash by rescheduling one of them. Overlaps are
    // only counted so the admin notification can flag them. Locks are taken in
    // a fixed order (day, then lead) so concurrent requests cannot deadlock.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`demo_booking_slot:${dayKey}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`demo_booking_lead:${input.email}:${input.type}`}))`;

    const nearby = await tx.demoBooking.findMany({
      where: candidateOverlapWhere(candidate),
      select: { id: true, startsAt: true, durationMinutes: true, status: true },
    });
    const overlapCount = findCollisions(candidate, nearby as BookingInterval[]).length;

    const existing = await tx.lead.findFirst({
      where: { email: input.email, type: input.type, status: { in: ['NEW', 'CONTACTED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const leadId = existing
      ? (await tx.lead.update({ where: { id: existing.id }, data: input.lead, select: { id: true } })).id
      : (
          await tx.lead.create({
            data: {
              ...input.lead,
              type: input.type,
              email: input.email,
              source: 'PUBLIC_FORM',
              status: 'NEW',
              formKey: DEMO_BOOKING_FORM_KEY,
            },
            select: { id: true },
          })
        ).id;

    const booking = await tx.demoBooking.create({
      data: {
        reference: generateDemoBookingReference(),
        leadId,
        startsAt: input.startsAt,
        durationMinutes,
        timezone: input.timezone,
        notes: input.notes,
        status: 'PENDING',
      },
      select: {
        id: true,
        reference: true,
        status: true,
        startsAt: true,
        durationMinutes: true,
        timezone: true,
      },
    });

    return { leadId, booking, overlapCount };
  });

  return {
    ok: true,
    booking: { ...outcome.booking, leadId: outcome.leadId },
    overlapCount: outcome.overlapCount,
  };
}

// ── Reschedule ───────────────────────────────────────────────

export interface RescheduleDemoBookingInput {
  bookingId: string;
  /** New UTC instant. */
  startsAt: Date;
  /** null/undefined keeps the booking's current display zone. */
  timezone?: string | null;
  /** null/undefined keeps the booking's current duration. */
  durationMinutes?: number | null;
}

export interface RescheduledBooking {
  id: string;
  reference: string;
  status: string;
  leadId: string;
  startsAt: Date;
  durationMinutes: number;
  timezone: string;
}

export interface RescheduleRequester {
  email: string;
  firstName: string;
  companyName: string;
}

export type RescheduleResult =
  | {
      ok: true;
      previous: { startsAt: Date; durationMinutes: number; timezone: string };
      booking: RescheduledBooking;
      requester: RescheduleRequester;
    }
  | { ok: false; kind: 'NOT_FOUND' }
  | { ok: false; kind: 'INVALID_STATE'; status: string }
  | { ok: false; kind: 'POLICY'; violation: PolicyViolation }
  | { ok: false; kind: 'CONFLICT'; message: string; availableSlots: Date[] };

/** A cancelled or already-completed meeting cannot be moved. */
const RESCHEDULE_BLOCKED_STATUSES: readonly string[] = ['CANCELLED', 'COMPLETED'];

/**
 * Move an existing booking to a new time, using exactly the same policy checks
 * and locking as a create. The booking being moved is excluded from its own
 * collision check, and the whole read-check-write runs under the same
 * per-day advisory lock so a simultaneous request cannot take the slot.
 */
export async function rescheduleDemoBooking(
  input: RescheduleDemoBookingInput,
  now: Date = new Date(),
): Promise<RescheduleResult> {
  const booking = await prisma.demoBooking.findUnique({
    where: { id: input.bookingId },
    include: { lead: { select: { email: true, firstName: true, companyName: true } } },
  });
  if (!booking) return { ok: false, kind: 'NOT_FOUND' };
  if (RESCHEDULE_BLOCKED_STATUSES.includes(booking.status)) {
    return { ok: false, kind: 'INVALID_STATE', status: booking.status };
  }

  const durationMinutes = input.durationMinutes ?? booking.durationMinutes;
  const timezone = input.timezone ?? booking.timezone;
  const candidate = { startsAt: input.startsAt, durationMinutes };

  const violation = validateBookingPolicy({ ...candidate, timezone }, now);
  if (violation) return { ok: false, kind: 'POLICY', violation };

  const targetDay = toBusinessWallClock(input.startsAt).dateKey;

  const outcome = await prisma.$transaction(async (tx) => {
    // Same lock and key as create, taken on the day being moved *into*.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`demo_booking_slot:${targetDay}`}))`;

    const nearby = await tx.demoBooking.findMany({
      where: candidateOverlapWhere(candidate),
      select: { id: true, startsAt: true, durationMinutes: true, status: true },
    });
    // Exclude this booking so it never collides with itself.
    if (findCollisions(candidate, nearby as BookingInterval[], input.bookingId).length > 0) {
      return { kind: 'conflict' as const };
    }

    const updated = await tx.demoBooking.update({
      where: { id: input.bookingId },
      data: { startsAt: input.startsAt, durationMinutes, timezone },
      select: {
        id: true,
        reference: true,
        status: true,
        leadId: true,
        startsAt: true,
        durationMinutes: true,
        timezone: true,
      },
    });

    return { kind: 'updated' as const, updated };
  });

  if (outcome.kind === 'conflict') {
    const slots = await getAvailableSlots(targetDay, durationMinutes, now, input.bookingId);
    return {
      ok: false,
      kind: 'CONFLICT',
      message: CONFLICT_MESSAGE,
      availableSlots: slots.map((slot) => slot.startsAt),
    };
  }

  return {
    ok: true,
    previous: { startsAt: booking.startsAt, durationMinutes: booking.durationMinutes, timezone: booking.timezone },
    booking: outcome.updated,
    requester: {
      email: booking.lead.email,
      firstName: booking.lead.firstName,
      companyName: booking.lead.companyName ?? '',
    },
  };
}

// ── Status transitions ───────────────────────────────────────
 
export interface ChangeDemoBookingStatusInput {
  bookingId: string;
  status: DemoBookingStatus;
}
 
export interface StatusChangedBooking {
  id: string;
  reference: string;
  status: DemoBookingStatus;
  leadId: string;
  startsAt: Date;
  durationMinutes: number;
  timezone: string;
}
 
export type ChangeStatusResult =
  | {
      ok: true;
      previous: DemoBookingStatus;
      booking: StatusChangedBooking;
      requester: RescheduleRequester;
    }
  | { ok: false; kind: 'NOT_FOUND' }
  | { ok: false; kind: 'INVALID_TRANSITION'; from: DemoBookingStatus; allowed: DemoBookingStatus[] }
  | { ok: false; kind: 'CONFLICT' }
  | { ok: false; kind: 'SLOT_TAKEN'; clashesWith: string[] };
 
/**
 * Move a booking through the status workflow (confirm / cancel / complete).
 * The write is guarded on the status we read, so a simultaneous change by
 * another admin returns CONFLICT instead of being silently overwritten.
 * Cancelling frees the slot automatically: availability excludes CANCELLED.
 *
 * Because overlapping requests are accepted as PENDING, confirming is where
 * double-booking is prevented: a booking cannot be CONFIRMED while it overlaps
 * another CONFIRMED one. The admin reschedules one of them first.
 */
export async function changeDemoBookingStatus(
  input: ChangeDemoBookingStatusInput,
): Promise<ChangeStatusResult> {
  const booking = await prisma.demoBooking.findUnique({
    where: { id: input.bookingId },
    include: { lead: { select: { email: true, firstName: true, companyName: true } } },
  });
  if (!booking) return { ok: false, kind: 'NOT_FOUND' };
  if (!canTransition(booking.status, input.status)) {
    return {
      ok: false,
      kind: 'INVALID_TRANSITION',
      from: booking.status,
      allowed: getAllowedNextStatuses(booking.status),
    };
  }

  const dayKey = toBusinessWallClock(booking.startsAt).dateKey;
  const outcome = await prisma.$transaction(async (tx) => {
    if (input.status === 'CONFIRMED') {
      // Same day lock as create/reschedule, so two admins cannot confirm two
      // overlapping bookings at the same moment. Cancel/complete need no lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`demo_booking_slot:${dayKey}`}))`;
      const nearby = await tx.demoBooking.findMany({
        where: { ...candidateOverlapWhere(booking), status: 'CONFIRMED' },
        select: { id: true, reference: true, startsAt: true, durationMinutes: true, status: true },
      });
      const clashes = findCollisions(booking, nearby, booking.id);
      if (clashes.length > 0) {
        return { kind: 'slot_taken' as const, clashesWith: clashes.map((c) => c.reference) };
      }
    }

    const { count } = await tx.demoBooking.updateMany({
      where: { id: input.bookingId, status: booking.status },
      data: { status: input.status },
    });
    return count === 0 ? { kind: 'conflict' as const } : { kind: 'updated' as const };
  });
  if (outcome.kind === 'slot_taken') return { ok: false, kind: 'SLOT_TAKEN', clashesWith: outcome.clashesWith };
  if (outcome.kind === 'conflict') return { ok: false, kind: 'CONFLICT' };
 
  return {
    ok: true,
    previous: booking.status,
    booking: {
      id: booking.id,
      reference: booking.reference,
      status: input.status,
      leadId: booking.leadId,
      startsAt: booking.startsAt,
      durationMinutes: booking.durationMinutes,
      timezone: booking.timezone,
    },
    requester: {
      email: booking.lead.email,
      firstName: booking.lead.firstName,
      companyName: booking.lead.companyName ?? '',
    },
  };
}
 
export interface CalendarEntry {
  id: string;
  reference: string;
  status: DemoBookingStatus;
  startsAt: Date;
  durationMinutes: number;
  timezone: string;
  lead: { firstName: string; lastName: string; companyName: string; email: string };
  /** References of other open bookings overlapping this one — needs a reschedule. */
  overlapsWith: string[];
}

/**
 * Every open (non-cancelled) booking that touches a business day, for the
 * admin calendar, with overlaps flagged so clashes are visible at a glance.
 */
export async function getDayCalendar(dateKey: string): Promise<CalendarEntry[]> {
  const window = businessDayBookingWindow(dateKey);
  const rows = await prisma.demoBooking.findMany({
    where: { status: { not: 'CANCELLED' }, startsAt: { gte: window.gte, lt: window.lt } },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      reference: true,
      status: true,
      startsAt: true,
      durationMinutes: true,
      timezone: true,
      lead: { select: { firstName: true, lastName: true, companyName: true, email: true } },
    },
  });
  return rows
    .filter((row) => toBusinessWallClock(row.startsAt).dateKey === dateKey)
    .map((row) => ({
      ...row,
      lead: { ...row.lead, companyName: row.lead.companyName ?? '' },
      overlapsWith: findCollisions(row, rows, row.id).map((other) => other.reference),
    }));
}

/** Open slots for a business day, as UTC instants. */
export async function getAvailableSlots(
  dateKey: string,
  durationMinutes: number = DEFAULT_DURATION_MINUTES,
  now: Date = new Date(),
  excludeId?: string,
): Promise<AvailableSlot[]> {
  const window = businessDayBookingWindow(dateKey);
  const bookings = await prisma.demoBooking.findMany({
    where: { status: { not: 'CANCELLED' }, startsAt: { gte: window.gte, lt: window.lt } },
    select: { id: true, startsAt: true, durationMinutes: true, status: true },
  });
  return availableSlots({
    dateKey,
    durationMinutes,
    bookings: bookings as BookingInterval[],
    now,
    excludeId,
  });
}
