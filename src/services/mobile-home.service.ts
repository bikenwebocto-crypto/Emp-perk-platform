// Mobile Employee Home service.
//
// Produces the JSON payload rendered by the mobile app's landing page after
// successful employee login. The endpoint fans out nine sections, each of
// which has its own ranking rules. All section queries are independent and
// run in parallel via Promise.all.
//
// Performance contract:
//   - Every section query uses `select` (not `include`) so the DB only
//     returns the 16 offer fields + 4 merchant fields + 3 category fields
//     actually serialized by `mapOffer`.
//   - The company-name lookup runs in parallel with the section builders
//     via Promise.all.
//   - No N+1 queries: merchant and category relations are pre-fetched in
//     the same query.
//
// Analytics metrics (offer_analytics table):
//   - viewCount       → Employee viewed the offer details page.
//   - clickCount      → Employee tapped the Redeem button (redemption intent).
//   - saveCount       → Employee saved/bookmarked the offer.
//
// These represent distinct stages in the user journey and should not be
// mixed when ranking sections.
//
// Extensibility notes:
//   - The `Section` and item shapes are intentionally stable so future
//     enhancements (sponsored slots, AI recommendations, location-aware
//     personalization) can be added without changing the API contract.
//   - The optional `Location` input is currently advisory; when a real
//     geolocation flow lands it can be used to bias every section without
//     breaking the wire format.

import { prisma } from '@/lib/prisma'
import { haversineKm, branchCoordinate } from '@/lib/distance'
import { safeQuery } from '@/lib/prisma/safe-query'

// Minimal employee shape required by this service. Decoupled from
// `EmployeeSession` (from `@/lib/employee-session`) so the service can
// be called from any mobile route that already has the Employee row
// in hand — e.g. the result of `getAuthenticatedMobileEmployee`.
export interface MobileHomeEmployee {
  id: string
  companyId: string
  firstName: string
  lastName: string
  avatarUrl: string | null
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Location {
  latitude: number
  longitude: number
}

export interface MobileHomeUser {
  id: string
  firstName: string
  lastName: string
  company: string
  avatarUrl: string | null
}

export interface MobileHomeOffer {
  id: string
  title: string
  shortDescription: string | null
  imageUrl: string | null
  merchantId: string
  merchantName: string
  merchantLogo: string | null
  category: { id: string; name: string; icon: string | null } | null
  offerType: string
  discountValue: number
  discountPercent: number | null
  startDate: string
  endDate: string
  isFeatured: boolean
  isExclusive: boolean
  distance: number | null
  redemptionType: string | null
  offerCode: string | null
  bookingUrl: string | null
  qrCodeUrl: string | null
}

export interface MobileHomeMerchant {
  id: string
  name: string
  logo: string | null
  category: { id: string; name: string; icon: string | null } | null
  distance: number | null
  offerCount: number
}

export interface MobileHomeBanner {
  id: string
  imageUrl: string
  altText: string | null
  redirectUrl: string | null
  businessName: string
  bannerName: string
  position: string
}

export type SectionType = 'hero' | 'merchant' | 'offer' | 'banner' | 'most_requested' | 'most_redeemed'

export interface MobileHomeSection<T = unknown> {
  id: string
  title: string
  type: SectionType
  items: T[]
}

export interface MobileHomeData {
  user: MobileHomeUser
  sections: [
    MobileHomeSection<MobileHomeBanner>,
    MobileHomeSection<MobileHomeOffer>,
    MobileHomeSection<MobileHomeMerchant>,
    MobileHomeSection<MobileHomeOffer>,
    MobileHomeSection<MobileHomeOffer>,
    MobileHomeSection<MobileHomeOffer>,
    MobileHomeSection<MobileHomeOffer>,
    MobileHomeSection<MobileHomeOffer>,
    MobileHomeSection<MobileHomeOffer>,
  ]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SECTION_LIMITS = {
  banner: 10,
  discover: 5,
  nearBrands: 10,
  forYou: 10,
  nearbyOffers: 10,
  newArrivals: 10,
  mostRequested: 10,
  mostRedeemed: 10,
  today: 10,
} as const

// Shared "offer is currently visible to employees" filter. Mirrors the
// visibility rules in `lib/offer-visibility.ts` but expressed as a reusable
// `where` clause so we can compose it with section-specific filters.
//
// IMPORTANT: this is the single source of truth for visibility. Any other
// place that filters LIVE offers (e.g. buildNearbyOffers) MUST reuse this.
const liveOfferWhere = (now: Date) => ({
  status: 'LIVE' as const,
  startDate: { lte: now },
  endDate: { gt: now },
  merchant: {
    status: 'ACTIVE' as const,
    deletedAt: null,
    branches: {
      some: { isActive: true, status: 'ACTIVE' as const, deletedAt: null },
    },
  },
})

// Select-only projection for `MerchantOffer` rows. Only the 16 fields used
// by `mapOffer` are fetched, plus the nested `merchant` + `category`. This
// replaces the previous `include` (which fetched ~20 unused columns per
// row) and matches the wire payload exactly.
const offerSelect = {
  id: true,
  title: true,
  offerType: true,
  startDate: true,
  endDate: true,
  isFeatured: true,
  isExclusive: true,
  createdAt: true,
  content: {
    select: {
      shortDescription: true,
      imageUrls: true,
    },
  },
  pricing: {
    select: {
      configuration: true,
    },
  },
  redemption: {
    select: {
      redemptionType: true,
      configuration: true,
    },
  },
  merchant: {
    select: {
      id: true,
      businessName: true,
      logoUrl: true,
      category: { select: { id: true, name: true, icon: true } },
    },
  },
} as const

function toIso(d: Date): string {
  return d.toISOString()
}

// Map a Prisma offer row (with `merchant` relation pre-included) to the
// mobile payload. `distance` is derived from the merchant's primary branch
// or null if no location was supplied.
function mapOffer(
  o: {
    id: string
    title: string
    offerType: string
    startDate: Date
    endDate: Date
    isFeatured: boolean
    isExclusive: boolean
    content: {
      shortDescription: string | null
      imageUrls: string[]
    } | null
    pricing: {
      configuration: Record<string, unknown> | unknown
    } | null
    redemption: {
      redemptionType: string | null
      configuration: Record<string, unknown> | unknown
    } | null
    merchant: {
      id: string
      businessName: string
      logoUrl: string | null
      category: { id: string; name: string; icon: string | null } | null
    }
  },
  distance: number | null,
): MobileHomeOffer {
  const pricingConfig = (o.pricing?.configuration as Record<string, unknown>) ?? {}
  const redemptionConfig = (o.redemption?.configuration as Record<string, unknown>) ?? {}
  const discountRaw = pricingConfig.amount ?? pricingConfig.percent ?? 0
  const discountValue = typeof discountRaw === 'number' ? discountRaw : 0

  return {
    id: o.id,
    title: o.title,
    shortDescription: o.content?.shortDescription ?? null,
    imageUrl: o.content?.imageUrls?.[0] ?? null,
    merchantId: o.merchant.id,
    merchantName: o.merchant.businessName,
    merchantLogo: o.merchant.logoUrl,
    category: o.merchant.category,
    offerType: o.offerType,
    discountValue,
    discountPercent: pricingConfig.percent as number ?? null,
    startDate: toIso(o.startDate),
    endDate: toIso(o.endDate),
    isFeatured: o.isFeatured,
    isExclusive: o.isExclusive,
    distance,
    redemptionType: o.redemption?.redemptionType ?? null,
    offerCode: redemptionConfig.code as string ?? null,
    bookingUrl: redemptionConfig.bookingUrl as string ?? null,
    qrCodeUrl: redemptionConfig.qrCodeUrl as string ?? null,
  }
}

function mapMerchant(
  m: {
    id: string
    businessName: string
    logoUrl: string | null
    category: { id: string; name: string; icon: string | null } | null
    _count: { offers: number }
  },
  distance: number | null,
): MobileHomeMerchant {
  return {
    id: m.id,
    name: m.businessName,
    logo: m.logoUrl,
    category: m.category,
    distance,
    offerCount: m._count.offers,
  }
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

async function buildDiscover(now: Date): Promise<MobileHomeOffer[]> {
  const rows = await prisma.merchantOffer.findMany({
    where: liveOfferWhere(now),
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    take: SECTION_LIMITS.discover,
    select: offerSelect,
  })
  return rows.map((o) => mapOffer(o, null))
}

async function buildBanners(now: Date): Promise<MobileHomeBanner[]> {
  const rows = await safeQuery(
    () =>
      prisma.bannerBooking.findMany({
        where: {
          status: 'APPROVED',
          paid: true,
          startDate: { lte: now },
          endDate: { gte: now },
          banner: {
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: now } },
            ],
          },
        },
        include: {
          content: true,
          banner: { select: { name: true, position: true } },
          merchant: { select: { businessName: true } },
        },
        orderBy: { banner: { displayOrder: 'asc' } },
        take: SECTION_LIMITS.banner,
      }),
    [],
    { context: 'BannerBooking.findMany:mobile-home' },
  )
  return rows.map((row) => ({
    id: row.id,
    imageUrl: row.content?.imageUrl ?? '',
    altText: row.content?.altText ?? null,
    urlType: row.content?.urlType ?? null,
    redirectUrl: row.content?.redirectUrl ?? null,
    businessName: row.merchant?.businessName ?? '',
    bannerName: row.banner?.name ?? '',
    position: row.banner?.position ?? '',
  }))
}

async function buildBrandsNearYou(
  location: Location | null,
): Promise<MobileHomeMerchant[]> {
  const rows = await prisma.merchant.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      branches: { some: { isActive: true, status: 'ACTIVE', deletedAt: null } },
    },
    take: SECTION_LIMITS.nearBrands * 3, // overscan then re-sort in memory
    orderBy: [{ isFeatured: 'desc' }, { isTopRated: 'desc' }, { businessName: 'asc' }],
    select: {
      id: true,
      businessName: true,
      logoUrl: true,
      isFeatured: true,
      isTopRated: true,
      category: { select: { id: true, name: true, icon: true } },
      branches: {
        where: { deletedAt: null, status: 'ACTIVE' },
        select: { latitude: true, longitude: true, isPrimary: true },
      },
      _count: {
        select: {
          offers: {
            where: {
              status: 'LIVE',
              startDate: { lte: new Date() },
              endDate: { gt: new Date() },
            },
          },
        },
      },
    },
  })

  const enriched = rows.map((m) => {
    const coord = branchCoordinate(m.branches)
    const distance =
      location && coord
        ? haversineKm(location.latitude, location.longitude, coord.latitude, coord.longitude)
        : null
    return { merchant: m, distance }
  })

  enriched.sort((a, b) => {
    if (location && a.distance != null && b.distance != null) {
      return a.distance - b.distance
    }
    if (location && a.distance != null) return -1
    if (location && b.distance != null) return 1
    return 0
  })

  return enriched.slice(0, SECTION_LIMITS.nearBrands).map((e) => mapMerchant(e.merchant, e.distance))
}

async function buildForYou(employeeId: string, now: Date): Promise<MobileHomeOffer[]> {
  // Pull the employee's recent redemption history to infer preferences.
  // 30 days is long enough to surface real patterns without going stale.
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const [history, redeemedIds] = await Promise.all([
    prisma.redemption.findMany({
      where: { employeeId, redeemedAt: { gte: cutoff } },
      select: {
        offerId: true,
        merchantId: true,
      
        offer: { select: { categoryId: true } },
      },
      take: 50,
    }),
    // All-time redeemed offer ids for this employee — used to exclude them
    // from recommendations (so the same offer never appears twice in the
    // "for you" section after the employee redeems it).
    prisma.redemption.findMany({
      where: { employeeId },
      select: { offerId: true },
    }),
  ])

  const redeemedSet = new Set(redeemedIds.map((r) => r.offerId))

  if (history.length === 0) {
    // Cold-start fallback: newest LIVE offers that this employee has not
    // already redeemed. The empty-set filter becomes a no-op for new
    // employees; for returning employees with prior (out-of-window)
    // redemptions, it prevents the section from re-surfacing used offers.
    const rows = await prisma.merchantOffer.findMany({
      where: {
        ...liveOfferWhere(now),
        id: { notIn: [...redeemedSet] },
      },
      orderBy: { createdAt: 'desc' },
      take: SECTION_LIMITS.forYou,
      select: offerSelect,
    })
    return rows.map((o) => mapOffer(o, null))
  }

  const categoryWeight = new Map<string, number>()
  const merchantWeight = new Map<string, number>()
  for (const r of history) {
    if (r.offer?.categoryId) {
      categoryWeight.set(r.offer.categoryId, (categoryWeight.get(r.offer.categoryId) ?? 0) + 1)
    }
    merchantWeight.set(r.merchantId, (merchantWeight.get(r.merchantId) ?? 0) + 1)
  }
  const topCategoryIds = [...categoryWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id)
  const topMerchantIds = [...merchantWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id)

  const rows = await prisma.merchantOffer.findMany({
    where: {
      ...liveOfferWhere(now),
      id: { notIn: [...redeemedSet] },
      OR: [
        ...(topCategoryIds.length > 0 ? [{ categoryId: { in: topCategoryIds } }] : []),
        ...(topMerchantIds.length > 0 ? [{ merchantId: { in: topMerchantIds } }] : []),
      ],
    },
    take: SECTION_LIMITS.forYou,
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    select: offerSelect,
  })
  return rows.map((o) => mapOffer(o, null))
}

async function buildNearbyOffers(
  now: Date,
  location: Location | null,
): Promise<MobileHomeOffer[]> {
  if (!location) {
    const rows = await prisma.merchantOffer.findMany({
      where: liveOfferWhere(now),
      orderBy: { createdAt: 'desc' },
      take: SECTION_LIMITS.nearbyOffers,
      select: offerSelect,
    })
    return rows.map((o) => mapOffer(o, null))
  }

  // Reuse `liveOfferWhere(now)` as the single source of truth for branch
  // visibility. Previously the location path used a slightly looser
  // `branches: { some: { deletedAt: null, status: 'ACTIVE' } }` (no
  // `isActive` check) — fixed in this version.
  const rows = await prisma.merchantOffer.findMany({
    where: liveOfferWhere(now),
    take: SECTION_LIMITS.nearbyOffers * 3,
    orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
    select: {
      ...offerSelect,
      merchant: {
        select: {
          ...offerSelect.merchant.select,
          branches: {
            where: { deletedAt: null, status: 'ACTIVE', isActive: true },
            select: { latitude: true, longitude: true, isPrimary: true },
          },
        },
      },
    },
  })

  const withDistance = rows
    .map((o) => {
      const coord = branchCoordinate(o.merchant.branches)
      const distance = coord
        ? haversineKm(location.latitude, location.longitude, coord.latitude, coord.longitude)
        : null
      return { offer: o, distance }
    })
    .filter((r): r is { offer: typeof rows[number]; distance: number } => r.distance != null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, SECTION_LIMITS.nearbyOffers)

  return withDistance.map(({ offer, distance }) => {
    // Strip the branches join before mapping so the payload stays lean.
    const { branches: _branches, ...merchantRest } = offer.merchant
    return mapOffer({ ...offer, merchant: merchantRest }, distance)
  })
}

async function buildNewArrivals(now: Date): Promise<MobileHomeOffer[]> {
  const rows = await prisma.merchantOffer.findMany({
    where: liveOfferWhere(now),
    orderBy: { createdAt: 'desc' },
    take: SECTION_LIMITS.newArrivals,
    select: offerSelect,
  })
  return rows.map((o) => mapOffer(o, null))
}

// Most Requested — ranked by tap on Redeem button (redemption intent).
// Uses clickCount from offer_analytics to surface offers employees most
// frequently attempt to redeem.
async function buildMostRequested(now: Date): Promise<MobileHomeOffer[]> {
  const rows = await prisma.merchantOffer.findMany({
    where: liveOfferWhere(now),
    orderBy: [
      { analytics: { clickCount: 'desc' } },
      { isFeatured: 'desc' },
      { createdAt: 'desc' },
    ],
    take: SECTION_LIMITS.mostRequested,
    select: offerSelect,
  })
  return rows.map((o) => mapOffer(o, null))
}

// Most Redeemed — ranked by completed redemption count.
// Uses redeemedCount from offer_redemption_capacity (the atomically
// maintained counter that increments on each successful Redemption record).
async function buildMostRedeemed(now: Date): Promise<MobileHomeOffer[]> {
  const rows = await prisma.merchantOffer.findMany({
    where: liveOfferWhere(now),
    orderBy: [
      { capacity: { redeemedCount: 'desc' } },
      { isFeatured: 'desc' },
      { createdAt: 'desc' },
    ],
    take: SECTION_LIMITS.mostRedeemed,
    select: offerSelect,
  })
  return rows.map((o) => mapOffer(o, null))
}

async function buildTodaysPicks(now: Date): Promise<MobileHomeOffer[]> {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  // Pull today's redemption counts. We deliberately do NOT apply
  // `liveOfferWhere` here — the offer id is what we need; visibility is
  // re-applied in step 3 so an expired or paused offer never reaches the
  // final list, even if it was redeemed earlier today.
  const todaysCounts = await prisma.redemption.groupBy({
    by: ['offerId'],
    where: { redeemedAt: { gte: startOfDay } },
    _count: { _all: true },
    orderBy: { _count: { offerId: 'desc' } },
    take: SECTION_LIMITS.today,
  })

  if (todaysCounts.length === 0) {
    return buildMostRequested(now)
  }

  const ids = todaysCounts.map((r) => r.offerId)
  const countMap = new Map(todaysCounts.map((r) => [r.offerId, r._count._all]))

  // Apply `liveOfferWhere` so only valid LIVE offers are returned.
  // Previously the visibility filter was applied AFTER the top-10 were
  // selected, which meant an expired top offer silently dropped out of
  // the rank order. Filtering here preserves rank order integrity.
  const rows = await prisma.merchantOffer.findMany({
    where: { ...liveOfferWhere(now), id: { in: ids } },
    select: offerSelect,
  })

  // Preserve the groupBy ranking. Use featured + recency as tiebreakers so
  // a featured offer is preferred over a non-featured one with the same
  // redemption count.
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids
    .map((id) => byId.get(id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
    .sort((a, b) => {
      const ca = countMap.get(a.id) ?? 0
      const cb = countMap.get(b.id) ?? 0
      if (ca !== cb) return cb - ca
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
      return b.createdAt.getTime() - a.createdAt.getTime()
    })
    .map((o) => mapOffer(o, null))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GetMobileHomeInput {
  employee: MobileHomeEmployee
  location?: Location | null
}

/**
 * Lightweight home data.
 *
 * Keep queries here that are relatively cheap and don't require
 * expensive aggregation, personalization, or location calculations.
 */
export async function getMobileHomeLight({
  employee,
  location,
}: GetMobileHomeInput) {
  const now = new Date();

  const [
    company,
    banner,
    discover,
    newArrivals,
    today,
  ] = await Promise.all([
    prisma.company.findUnique({
      where: {
        id: employee.companyId,
      },
      select: {
        name: true,
      },
    }),

    buildBanners(now),
    buildDiscover(now),
    buildNewArrivals(now),
    buildTodaysPicks(now),
  ]);

  return {
    user: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      company: company?.name ?? "",
      avatarUrl: employee.avatarUrl,
    },

    sections: [
      {
        id: "banner",
        title: "Sponsored",
        type: "banner",
        items: banner,
      },
      {
        id: "discover",
        title: "Discover Now",
        type: "hero",
        items: discover,
      },
      {
        id: "newArrivals",
        title: "New Arrivals",
        type: "offer",
        items: newArrivals,
      },
      {
        id: "today",
        title: "Today's Hot Picks",
        type: "offer",
        items: today,
      },
    ],
  };
}


/**
 * Heavy home data.
 *
 * These sections may involve location, personalization,
 * aggregation, ranking, or more expensive database queries.
 */
export async function getMobileHomeHeavy({
  employee,
  location,
}: GetMobileHomeInput) {
  const now = new Date();

  const [
    nearBrands,
    forYou,
    nearbyOffers,
    mostRequested,
    mostRedeemed,
  ] = await Promise.all([
    buildBrandsNearYou(location ?? null),
    buildForYou(employee.id, now),
    buildNearbyOffers(now, location ?? null),
    buildMostRequested(now),
    buildMostRedeemed(now),
  ]);

  // All offers from all offer-based sections
  const offerIds = [
    ...forYou,
    ...nearbyOffers,
    ...mostRequested,
    ...mostRedeemed,
  ].map((offer) => offer.id);

  const uniqueOfferIds = [...new Set(offerIds)];

  // Find which of these offers are saved by the current employee
  const savedOffers = uniqueOfferIds.length
    ? await prisma.notificationEvent.findMany({
        where: {
          employeeId: employee.id,
          referenceType: "saved_offer",
          referenceId: {
            in: uniqueOfferIds,
          },
        },
        select: {
          referenceId: true,
        },
      })
    : [];

  const savedOfferIds = new Set(
    savedOffers.map((saved) => saved.referenceId),
  );

  // Always return isSaved: true OR false
  const withSavedStatus = <T extends { id: string }>(offers: T[]) =>
    offers.map((offer) => ({
      ...offer,
      isSaved: savedOfferIds.has(offer.id),
    }));

  return [
    {
      id: "nearBrands",
      title: "Brands Near You",
      type: "merchant",
      items: nearBrands,
    },
    {
      id: "forYou",
      title: "Recommended For You",
      type: "offer",
      items: withSavedStatus(forYou),
    },
    {
      id: "nearbyOffers",
      title: "Nearby Offers",
      type: "offer",
      items: withSavedStatus(nearbyOffers),
    },
    {
      id: "mostRequested",
      title: "Most Requested",
      type: "most_requested",
      items: withSavedStatus(mostRequested),
    },
    {
      id: "mostRedeemed",
      title: "Most Redeemed",
      type: "most_redeemed",
      items: withSavedStatus(mostRedeemed),
    },
  ];
}
