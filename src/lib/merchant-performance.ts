/**
 * Business Overview service (Groups A–D).
 *
 * Pure display/computation helpers live in ./merchant-performance-utils
 * (client-safe, no Prisma); this module adds the Prisma-backed service.
 */
import { computeMaxOfferCost, formatMaxOfferCost, type MaxOfferCost, type MaxOfferCostInput } from './merchant-performance-utils'

// Re-export for backward compatibility — existing consumers import these
// from this module.
export { computeMaxOfferCost, formatMaxOfferCost }
export type { MaxOfferCost, MaxOfferCostInput }

import { prisma } from '@/lib/prisma'

export interface OverviewTopOffer {
  offerId: string
  title: string
  redemptions: number
  totalSavings: number
  totalDiscount: number
}

export interface OverviewOfferCapacityRow {
  id: string
  title: string
  maxRedemptions: number | null
  redeemed: number
  remaining: number | null
  percentUsed: number | null
  /** True when both capacity and legacy rows exist with different values. */
  drift: boolean
}

export interface OverviewExpiringOffer {
  id: string
  title: string
  endDate: string
  daysRemaining: number
}

export interface OverviewBannerBooking {
  id: string
  bannerName: string
  position: string
  startDate: string
  endDate: string
  totalPrice: number
  expiringSoon?: boolean
}

export interface MerchantBusinessOverview {
  redemptions: {
    total: number
    thisWeek: number
    thisMonth: number
    totalSavings: number
    totalDiscount: number
  }
  topOffers: OverviewTopOffer[]
  offerCapacity: {
    maxOfferCost: MaxOfferCost
    /** Pre-formatted display string (e.g. "€1,200+", "Unlimited") — computed
     *  server-side so client components never need to import formatMaxOfferCost
     *  (and therefore never pull this Prisma-importing module into the browser
     *  bundle). */
    maxOfferCostDisplay: string
    offers: OverviewOfferCapacityRow[]
  }
  expiry: {
    expiringSoon: OverviewExpiringOffer[]
    expiredCount: number
  }
  banners: {
    active: OverviewBannerBooking[]
    upcoming: OverviewBannerBooking[]
    pendingCount: number
    totalSpent: number
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Narrow Prisma groupBy's conditional `_count` union
 * (number | boolean | { _all?: number, ... }) to a plain number.
 * With `_count: true` the runtime value is always a number; the union is
 * just over-conservative generated typing when orderBy references _count.
 */
function groupCount(c: unknown): number {
  if (typeof c === 'number') return c
  if (typeof c === 'object' && c !== null && '_all' in c) {
    return Number((c as { _all?: number })._all ?? 0)
  }
  return 0
}

/**
 * Compute the full Business Overview for a merchant.
 *
 * Executes 8 queries in a single Promise.all batch — all covered by
 * existing indexes (see query plan). A conditional title lookup for top
 * offers reuses titles already fetched with the live offers, so it is
 * skipped entirely in the common case.
 * No schema changes; no new indexes.
 */
export async function getMerchantBusinessOverview(
  merchantId: string,
): Promise<MerchantBusinessOverview> {
  const now = new Date()
  const weekStart = new Date(now.getTime() - 7 * DAY_MS)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const expiryWindow = new Date(now.getTime() + 7 * DAY_MS)

  const [agg, weekCount, monthCount, offerAgg, liveOffers, expiredCount, bannerSpendAgg, relevantBookings] =
    await Promise.all([
      prisma.redemption.aggregate({
        where: { merchantId },
        _count: { _all: true },
        _sum: { savingsAmount: true, discountAmount: true },
      }),
      prisma.redemption.count({
        where: { merchantId, redeemedAt: { gte: weekStart } },
      }),
      prisma.redemption.count({
        where: { merchantId, redeemedAt: { gte: monthStart } },
      }),
      prisma.redemption.groupBy({
        by: ['offerId'],
        where: { merchantId },
        _count: true,
        _sum: { savingsAmount: true, discountAmount: true },
        // Prisma 5.22 groupBy orderBy only accepts per-field count keys here
        // ('_all' and the string shorthand are rejected by the generated
        // types). offerId is a non-null FK, so COUNT(offerId) equals the
        // group row count — this IS a count-descending sort.
        orderBy: { _count: { offerId: 'desc' } },
        take: 5,
      }),
      prisma.merchantOffer.findMany({
        where: { merchantId, status: 'LIVE', deletedAt: null },
        select: {
          id: true,
          title: true,
          offerType: true,
          endDate: true,
          pricing: { select: { configuration: true } },
          redemption: { select: { maxRedemptions: true, currentRedemptions: true } },
          capacity: { select: { maxRedemptions: true, redeemedCount: true } },
        },
        orderBy: { endDate: 'asc' },
      }),
      prisma.merchantOffer.count({
        where: { merchantId, status: 'EXPIRED', deletedAt: null },
      }),
      // Historical spend — aggregate only, no row transfer (index: merchantId)
      prisma.bannerBooking.aggregate({
        where: { merchantId, paid: true },
        _sum: { totalPrice: true },
      }),
      // Only currently-relevant bookings (pending or approved-and-not-ended) —
      // bounded result set, uses @@index([status, paid, startDate, endDate])
      prisma.bannerBooking.findMany({
        where: {
          merchantId,
          OR: [
            { status: 'PENDING' },
            { status: 'APPROVED', paid: true, endDate: { gte: now } },
          ],
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          totalPrice: true,
          status: true,
          paid: true,
          banner: { select: { name: true, position: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
    ])

  // Titles for top offers: reuse titles already fetched with liveOffers and
  // only look up the missing ones (usually none — top offers tend to be live).
  const topOfferIds = offerAgg.map((o) => o.offerId)
  const liveOfferTitleMap = new Map(liveOffers.map((o) => [o.id, o.title]))
  const missingIds = topOfferIds.filter((id) => !liveOfferTitleMap.has(id))
  const topOfferMeta = missingIds.length
    ? await prisma.merchantOffer.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, title: true },
      })
    : []
  const titleMap = new Map([
    ...liveOfferTitleMap,
    ...topOfferMeta.map((o) => [o.id, o.title] as const),
  ])

  // ── Group A: redemption & revenue performance ──
  const redemptions = {
    total: agg._count._all ?? 0,
    thisWeek: weekCount,
    thisMonth: monthCount,
    totalSavings: Number(agg._sum.savingsAmount ?? 0),
    totalDiscount: Number(agg._sum.discountAmount ?? 0),
  }
  const topOffers: OverviewTopOffer[] = offerAgg.map((o) => ({
    offerId: o.offerId,
    title: titleMap.get(o.offerId) ?? 'Unknown',
    redemptions: groupCount(o._count),
    totalSavings: Number(o._sum?.savingsAmount ?? 0),
    totalDiscount: Number(o._sum?.discountAmount ?? 0),
  }))

  // ── Group B: offer capacity (prefer capacity row, fall back to legacy) ──
  const maxOfferCost = computeMaxOfferCost(
    liveOffers.map((o) => ({
      offerType: o.offerType,
      pricing: o.pricing,
      redemption: {
        maxRedemptions: o.capacity
          ? o.capacity.maxRedemptions
          : (o.redemption?.maxRedemptions ?? null),
      },
    })),
  )
  const offerCapacity = {
    maxOfferCost,
    maxOfferCostDisplay: formatMaxOfferCost(maxOfferCost),
    offers: liveOffers.map((o) => {
      const cap = o.capacity
      const legacy = o.redemption
      const maxRedemptions = cap ? cap.maxRedemptions : (legacy?.maxRedemptions ?? null)
      const redeemed = cap ? cap.redeemedCount : (legacy?.currentRedemptions ?? 0)
      const drift = Boolean(
        cap &&
          legacy &&
          (cap.maxRedemptions !== legacy.maxRedemptions ||
            cap.redeemedCount !== legacy.currentRedemptions),
      )
      const remaining =
        maxRedemptions == null ? null : Math.max(0, maxRedemptions - redeemed)
      const percentUsed =
        maxRedemptions != null && maxRedemptions > 0
          ? Math.round((redeemed / maxRedemptions) * 100)
          : null
      return { id: o.id, title: o.title, maxRedemptions, redeemed, remaining, percentUsed, drift }
    }),
  }

  // ── Group C: offer expiry (derived from the same liveOffers query) ──
  // Guard endDate >= now: a LIVE offer whose endDate already passed
  // (scheduler hasn't flipped it to EXPIRED yet) is over, not "expiring soon".
  const expiringSoon = liveOffers
    .filter((o) => o.endDate >= now && o.endDate <= expiryWindow)
    .map((o) => ({
      id: o.id,
      title: o.title,
      endDate: o.endDate.toISOString(),
      daysRemaining: Math.max(0, Math.ceil((o.endDate.getTime() - now.getTime()) / DAY_MS)),
    }))
  const expiry = { expiringSoon, expiredCount }

  // ── Group D: banner bookings (from the two targeted queries) ──
  const active: OverviewBannerBooking[] = []
  const upcoming: OverviewBannerBooking[] = []
  let pendingCount = 0

  for (const b of relevantBookings) {
    if (b.status === 'PENDING') {
      pendingCount++
      continue
    }
    const start = new Date(b.startDate)
    const end = new Date(b.endDate)
    const row = {
      id: b.id,
      bannerName: b.banner.name,
      position: b.banner.position,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalPrice: Number(b.totalPrice),
    }
    if (start > now) {
      upcoming.push(row)
    } else {
      active.push({ ...row, expiringSoon: end <= expiryWindow })
    }
  }

  const totalSpent = Number(bannerSpendAgg._sum.totalPrice ?? 0)

  return { redemptions, topOffers, offerCapacity, expiry, banners: { active, upcoming, pendingCount, totalSpent } }
}
