import type { MerchantOffer } from '@prisma/client'

/**
 * Single source of truth for the shape of an offer as seen by an
 * Employee user. Returned by:
 *   - GET /api/employee/offers (list)
 *   - GET /api/employee/saved     (saved)
 *   - GET /api/employee/dashboard/stats (home featured)
 *
 * The `RedeemModal` consumes this exact shape and is the single
 * component that handles viewing + redeeming. It does NOT trigger
 * any additional request.
 */
export interface EmployeeOffer {
  id: string
  title: string

  description: string | null
  shortDescription: string | null
  termsAndConditions: string | null

  imageUrls: string[]

  offerType: string

  // Pricing — these come from the OfferPricing.configuration JSON
  // and are flattened by the API for easy consumption.
  discountValue: number | string | null
  discountPercent: number | null
  discountMax: number | string | null
  minimumSpend: number | string | null

  // Redemption — come from OfferRedemption
  redemptionType: string | null
  redemptionInstructions: string | null
  offerCode: string | null
  bookingUrl: string | null
  qrCodeUrl: string | null
  daysOfWeek: number[] | null
  maxRedemptions: number | null
  currentRedemptions: number

  // Bookkeeping
  isFeatured: boolean
  isExclusive: boolean

  startDate: string
  endDate: string

  merchant: {
    id: string
    businessName: string
    logoUrl: string | null
    averageRating: number | string
    city: string | null
    state: string | null
    description: string | null
    category: { id: string; name: string; icon: string | null } | null
    branches: {
      id: string
      name: string
      branchType: string
      isActive: boolean
      addressLine1: string
      city: string
      state: string | null
    }[]
  }

  /**
   * Live-computed visibility status. Mirrors the `isOfferVisibleToEmployees`
   * helper. `false` means the offer exists but is currently not redeemable
   * (e.g. merchant is paused, no active branches).
   */
  isVisible: boolean
  visibilityReason?: string

  // Per-employee state
  isSaved: boolean
  isRedeemed: boolean
}

export type EmployeeOfferType = EmployeeOffer['offerType']

/**
 * Helper to locate an offer in a list by id. Returns the index + the
 * offer so callers can also patch the list in place.
 */
export function findOfferInList<T extends { id: string }>(
  list: T[] | undefined,
  id: string,
): { index: number; offer: T } | null {
  if (!list) return null
  const index = list.findIndex((o) => o.id === id)
  if (index < 0) return null
  return { index, offer: list[index]! }
}

/**
 * Re-export the Prisma type for places that need to do a stricter
 * Prisma-side cast.
 */
export type { MerchantOffer }
