import type { Prisma } from '@prisma/client'

/**
 * Single source of truth for banner availability.
 *
 * Both the admin UI and every API that decides whether a banner can still be
 * booked use these helpers, so the admin screen can never report "ACTIVE" while
 * the merchant API treats the banner as unavailable.
 *
 * There is no scheduler/cron and no stored status: the state is derived from
 * `isActive`, `startDate` and `expiresAt` on every read.
 */
export type BannerAvailability = 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'INACTIVE'

export const BANNER_AVAILABILITY_LABEL: Record<BannerAvailability, string> = {
  SCHEDULED: 'Scheduled',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  INACTIVE: 'Inactive',
}

export const BANNER_AVAILABILITY_HINT: Record<BannerAvailability, string> = {
  SCHEDULED: 'Not yet available for booking',
  ACTIVE: 'Available for booking',
  EXPIRED: 'No longer available for new bookings',
  INACTIVE: 'Manually disabled',
}

export interface BannerScheduleInput {
  isActive: boolean
  startDate?: Date | string | null
  expiresAt?: Date | string | null
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * `INACTIVE` (manually disabled) wins over the schedule; then a future
 * `startDate` means `SCHEDULED`; then a passed `expiresAt` means `EXPIRED`;
 * otherwise the banner is `ACTIVE` (bookable).
 */
export function getBannerAvailability(
  banner: BannerScheduleInput,
  now: Date = new Date(),
): BannerAvailability {
  if (!banner.isActive) return 'INACTIVE'

  const start = toDate(banner.startDate)
  if (start && start > now) return 'SCHEDULED'

  const expires = toDate(banner.expiresAt)
  if (expires && expires <= now) return 'EXPIRED'

  return 'ACTIVE'
}

export function isBannerBookable(
  banner: BannerScheduleInput,
  now: Date = new Date(),
): boolean {
  return getBannerAvailability(banner, now) === 'ACTIVE'
}

/** Whole days until the banner opens; null when it is already open. */
export function daysUntilBannerStart(
  banner: BannerScheduleInput,
  now: Date = new Date(),
): number | null {
  const start = toDate(banner.startDate)
  if (!start || start <= now) return null
  return Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/** Whole days until the banner expires; null when there is no expiry. */
export function daysUntilBannerExpiry(
  banner: BannerScheduleInput,
  now: Date = new Date(),
): number | null {
  const expires = toDate(banner.expiresAt)
  if (!expires) return null
  return Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Prisma filter fragment for banners that are bookable right now.
 *
 * Mirrors `getBannerAvailability() === 'ACTIVE'` exactly:
 *   isActive = true
 *   AND (startDate IS NULL OR startDate <= now)
 *   AND (expiresAt IS NULL OR expiresAt >  now)
 *
 * Deliberately type-only Prisma import so client components can import the
 * pure helpers from this module without pulling the Prisma client into the
 * browser bundle.
 */
export function bookableBannerWhere(now: Date = new Date()): Prisma.BannerWhereInput {
  return {
    isActive: true,
    AND: [
      { OR: [{ startDate: null }, { startDate: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
  }
}
