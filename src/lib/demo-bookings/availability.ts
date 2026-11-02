import type { Prisma } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';

// ─────────────────────────────────────────────────────────────
// Demo-booking policy and availability — the single source of truth.
//
// Both the scheduling service and any admin surface use these helpers, so the
// slots offered to a visitor can never disagree with what the server accepts.
// There is no stored "available" flag: availability is derived from the
// bookings themselves on every read, mirroring banner availability.
//
// Timezone policy: `startsAt` is always UTC. Working hours are defined in the
// team's BUSINESS_TIMEZONE; the visitor's own IANA zone is stored on the
// booking for display only. Nothing here trusts a timezone the client computed.
// ─────────────────────────────────────────────────────────────

/** The demo is a fixed-format meeting: a 30-minute video call, for employers. */
export const MEETING_MODE = 'Video call' as const;
export const ALLOWED_DURATIONS_MINUTES = [30] as const;
export const DEFAULT_DURATION_MINUTES = 30;

/** Working hours are the demo team's calendar, in this zone. */
export const BUSINESS_TIMEZONE = 'Europe/Nicosia';
/** 0 = Sunday. Monday to Friday. */
export const WORKING_DAYS = [1, 2, 3, 4, 5] as const;
export const WORKING_START_MINUTES = 9 * 60; // 09:00
/** A meeting must finish by this time, not merely start before it. */
export const WORKING_END_MINUTES = 17 * 60; // 17:00

/** Slot grid step. */
export const SLOT_STEP_MINUTES = 30;

export const MIN_NOTICE_HOURS = 24;
export const MAX_HORIZON_DAYS = 60;

/** Marks demo-booking leads in the admin lead views. */
export const DEMO_BOOKING_FORM_KEY = 'demo_booking';

const WORKING_HOURS_MESSAGE = 'Demos run Monday to Friday, 09:00–17:00 (Nicosia time)';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MAX_DURATION_MINUTES = Math.max(...ALLOWED_DURATIONS_MINUTES);

// ── Intervals ────────────────────────────────────────────────

export interface MeetingInterval {
  startsAt: Date;
  durationMinutes: number;
}

export interface BookingInterval extends MeetingInterval {
  id: string;
  status: string;
}

/** The (exclusive) end of [startsAt, startsAt + durationMinutes). */
export function meetingEnd(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * MS_PER_MINUTE);
}

/**
 * Half-open overlap: [aStart, aEnd) intersects [bStart, bEnd).
 * Back-to-back slots (10:00–10:30 and 10:30–11:00) do NOT overlap.
 */
export function intervalsOverlap(a: MeetingInterval, b: MeetingInterval): boolean {
  return (
    a.startsAt.getTime() < meetingEnd(b.startsAt, b.durationMinutes).getTime() &&
    b.startsAt.getTime() < meetingEnd(a.startsAt, a.durationMinutes).getTime()
  );
}

/** Bookings that collide with `candidate`. CANCELLED rows never collide. */
export function findCollisions<T extends BookingInterval>(
  candidate: MeetingInterval,
  bookings: T[],
  excludeId?: string,
): T[] {
  return bookings.filter(
    (b) => b.status !== 'CANCELLED' && b.id !== excludeId && intervalsOverlap(candidate, b),
  );
}

/**
 * Prisma filter for rows that *may* collide with `candidate` — a superset of
 * `findCollisions()`, which stays authoritative. The query narrows to rows that
 * could possibly overlap (start before our end, and no further before our start
 * than the longest allowed meeting), then the pure helper decides exactly.
 */
export function candidateOverlapWhere(candidate: MeetingInterval): Prisma.DemoBookingWhereInput {
  return {
    status: { not: 'CANCELLED' },
    startsAt: {
      gt: new Date(candidate.startsAt.getTime() - MAX_DURATION_MINUTES * MS_PER_MINUTE),
      lt: meetingEnd(candidate.startsAt, candidate.durationMinutes),
    },
  };
}

// ── Timezone conversions ─────────────────────────────────────

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dateKeyOf(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Split "YYYY-MM-DD" into numbers. Callers validate with isValidDateKey first. */
function dateKeyParts(dateKey: string): { year: number; month: number; day: number } {
  const parts = dateKey.split('-');
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
}

const WALL_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export interface WallClock {
  /** YYYY-MM-DD in the business timezone. */
  dateKey: string;
  /** 0 = Sunday. */
  weekday: number;
  hour: number;
  minute: number;
  minutesOfDay: number;
}

/**
 * The business-zone wall clock for a UTC instant, read with Intl so the result
 * is independent of the server's own timezone.
 */
export function toBusinessWallClock(instant: Date): WallClock {
  const parts = WALL_CLOCK_FORMATTER.formatToParts(instant);
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const year = Number(value('year'));
  const month = Number(value('month'));
  const day = Number(value('day'));
  // Some ICU builds emit "24" for midnight under hour12: false.
  const hour = Number(value('hour')) % 24;
  const minute = Number(value('minute'));
  return {
    dateKey: dateKeyOf(year, month, day),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const { year, month, day } = dateKeyParts(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return dateKeyOf(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/**
 * A business-zone wall clock (date key + minute of day) → the UTC instant.
 * Uses `fromZonedTime`, which resolves the correct offset for that date and so
 * handles the DST transitions Nicosia observes.
 */
export function businessWallClockToUtc(dateKey: string, minutesOfDay: number): Date {
  const { year, month, day } = dateKeyParts(dateKey);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return fromZonedTime(new Date(year, month - 1, day, hour, minute, 0, 0), BUSINESS_TIMEZONE);
}

/** "2026-10-25 09:00" in the business timezone, for messages/notifications. */
export function formatBusinessLocal(instant: Date): string {
  const wall = toBusinessWallClock(instant);
  return `${wall.dateKey} ${pad2(wall.hour)}:${pad2(wall.minute)}`;
}

/**
 * The instant rendered in an arbitrary IANA zone — used to show a time back in
 * the requester's own clock (e.g. "Sunday, 25 October 2026 at 14:00").
 */
export function formatInTimeZone(instant: Date, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : BUSINESS_TIMEZONE;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false;
  const { year, month, day } = dateKeyParts(value);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

// ── Policy validation ────────────────────────────────────────

export type AvailabilityReason =
  | 'INVALID_DURATION'
  | 'INVALID_TIMEZONE'
  | 'IN_THE_PAST'
  | 'TOO_SOON'
  | 'TOO_FAR'
  | 'OUTSIDE_WORKING_HOURS'
  | 'COLLISION';

export interface PolicyViolation {
  reason: AvailabilityReason;
  /** Request field to attach the message to. */
  field: 'startsAt' | 'durationMinutes' | 'timezone';
  message: string;
}

export interface BookingCandidate {
  startsAt: Date;
  durationMinutes: number;
  timezone: string;
}

/**
 * Every rule that applies to a requested or rescheduled meeting, independent of
 * existing bookings. Returns the first violation, or null when the request is
 * within policy. Always re-run on the server — never trust the browser.
 */
export function validateBookingPolicy(
  candidate: BookingCandidate,
  now: Date = new Date(),
): PolicyViolation | null {
  const { startsAt, durationMinutes, timezone } = candidate;

  if (Number.isNaN(startsAt.getTime())) {
    return { reason: 'IN_THE_PAST', field: 'startsAt', message: 'Choose a valid date and time' };
  }
  if (!isValidTimeZone(timezone)) {
    return { reason: 'INVALID_TIMEZONE', field: 'timezone', message: 'Choose a valid time zone' };
  }
  if (!(ALLOWED_DURATIONS_MINUTES as readonly number[]).includes(durationMinutes)) {
    return {
      reason: 'INVALID_DURATION',
      field: 'durationMinutes',
      message: `Demos are ${DEFAULT_DURATION_MINUTES} minutes long`,
    };
  }

  const startMs = startsAt.getTime();
  if (startMs <= now.getTime()) {
    return { reason: 'IN_THE_PAST', field: 'startsAt', message: 'Choose a time in the future' };
  }
  if (startMs - now.getTime() < MIN_NOTICE_HOURS * MS_PER_HOUR) {
    return {
      reason: 'TOO_SOON',
      field: 'startsAt',
      message: `Please choose a time at least ${MIN_NOTICE_HOURS} hours from now`,
    };
  }
  if (startMs - now.getTime() > MAX_HORIZON_DAYS * MS_PER_DAY) {
    return {
      reason: 'TOO_FAR',
      field: 'startsAt',
      message: `Please choose a time within the next ${MAX_HORIZON_DAYS} days`,
    };
  }

  // The whole interval must sit inside working hours on a working day.
  const start = toBusinessWallClock(startsAt);
  const end = toBusinessWallClock(meetingEnd(startsAt, durationMinutes));
  const startsInHours =
    (WORKING_DAYS as readonly number[]).includes(start.weekday) &&
    start.minutesOfDay >= WORKING_START_MINUTES &&
    start.minutesOfDay < WORKING_END_MINUTES;
  const endsInHours =
    (WORKING_DAYS as readonly number[]).includes(end.weekday) &&
    end.minutesOfDay <= WORKING_END_MINUTES &&
    end.minutesOfDay > WORKING_START_MINUTES;

  if (start.dateKey !== end.dateKey || !startsInHours || !endsInHours) {
    return { reason: 'OUTSIDE_WORKING_HOURS', field: 'startsAt', message: WORKING_HOURS_MESSAGE };
  }

  return null;
}

// ── Availability ─────────────────────────────────────────────

export interface AvailableSlot {
  startsAt: Date;
  endAt: Date;
}

/** Every slot start in the business grid for a day. */
export function businessDaySlotStarts(dateKey: string): Date[] {
  const slots: Date[] = [];
  for (
    let minutes = WORKING_START_MINUTES;
    minutes + DEFAULT_DURATION_MINUTES <= WORKING_END_MINUTES;
    minutes += SLOT_STEP_MINUTES
  ) {
    slots.push(businessWallClockToUtc(dateKey, minutes));
  }
  return slots;
}

/**
 * Open slots for a day: the grid minus anything that breaks policy (notice,
 * horizon) or collides with an existing booking. PENDING bookings reserve their
 * slot; only CANCELLED frees one.
 */
export function availableSlots(params: {
  dateKey: string;
  durationMinutes: number;
  bookings: BookingInterval[];
  now: Date;
  excludeId?: string;
}): AvailableSlot[] {
  const { dateKey, durationMinutes, bookings, now, excludeId } = params;
  const open: AvailableSlot[] = [];
  for (const startsAt of businessDaySlotStarts(dateKey)) {
    const candidate = { startsAt, durationMinutes };
    if (validateBookingPolicy({ ...candidate, timezone: BUSINESS_TIMEZONE }, now)) continue;
    if (findCollisions(candidate, bookings, excludeId).length > 0) continue;
    open.push({ startsAt, endAt: meetingEnd(startsAt, durationMinutes) });
  }
  return open;
}

/** Prisma window covering every booking that could touch a business day. */
export function businessDayBookingWindow(dateKey: string): { gte: Date; lt: Date } {
  const margin = MAX_DURATION_MINUTES * MS_PER_MINUTE;
  const dayStart = businessWallClockToUtc(dateKey, 0);
  const nextDayStart = businessWallClockToUtc(addDaysToDateKey(dateKey, 1), 0);
  return { gte: new Date(dayStart.getTime() - margin), lt: new Date(nextDayStart.getTime() + margin) };
}
