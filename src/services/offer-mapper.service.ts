import type { EmployeeOffer } from '@/components/employee/offers/employee-offer'

export interface OfferRow {
  id: string
  title: string
  offerType: string
  isFeatured: boolean
  isExclusive: boolean
  endDate: Date
  startDate: Date
  status: string
  deletedAt: Date | null
  content: {
    description: string | null
    shortDescription: string | null
    termsAndConditions: string | null
    imageUrls: string[]
  } | null
  pricing: { configuration: unknown } | null
  redemption: {
    redemptionType: string | null
    configuration: unknown
    daysOfWeek: number[] | null
  } | null
  capacity: {
    maxRedemptions: number | null
    redeemedCount: number
  } | null
  merchant: {
    id: string
    businessName: string
    logoUrl: string | null
    averageRating: number | string
    city: string | null
    state: string | null
    status: string
    deletedAt: Date | null
    description: string | null
    category: { id: string; name: string; icon: string | null } | null
    branches: {
      id: string
      name: string
      branchType: string
      isActive: boolean
      status: string
      addressLine1: string
      city: string
      state: string | null
    }[]
  }
}

export interface VisibilityResult {
  visible: boolean
  reason?: string
}

export function evaluateOfferVisibility(o: OfferRow, now: Date): VisibilityResult {
  if (o.status !== 'LIVE') return { visible: false, reason: 'Offer is not live' }
  if (o.startDate > now) return { visible: false, reason: 'Offer has not started yet' }
  if (o.endDate <= now) return { visible: false, reason: 'Offer has expired' }
  if (o.merchant.status !== 'ACTIVE') return { visible: false, reason: 'Merchant is not active' }
  if (o.merchant.deletedAt) return { visible: false, reason: 'Merchant no longer exists' }
  const hasActiveBranch = o.merchant.branches.some((b) => b.isActive && b.status === 'ACTIVE')
  const hasOnlineBranch = o.merchant.branches.some(
    (b) => b.branchType === 'ONLINE' && b.status === 'ACTIVE',
  )
  if (!hasActiveBranch && !hasOnlineBranch) {
    return { visible: false, reason: 'Merchant has no active branches' }
  }
  return { visible: true }
}

export function mapOfferRow(
  o: OfferRow,
  now: Date,
  savedSet?: Set<string>,
  redeemedSet?: Set<string>,
): EmployeeOffer {
  const pricingConfig = (o.pricing?.configuration as Record<string, unknown>) ?? {}
  const redemptionConfig = (o.redemption?.configuration as Record<string, unknown>) ?? {}
  const visibility = evaluateOfferVisibility(o, now)

  return {
    id: o.id,
    title: o.title,
    description: o.content?.description ?? null,
    shortDescription: o.content?.shortDescription ?? null,
    termsAndConditions: o.content?.termsAndConditions ?? null,
    imageUrls: o.content?.imageUrls ?? [],
    offerType: o.offerType,
    discountValue:
      (pricingConfig.discountValue as string | number | null) ??
      (pricingConfig.amount as string | number | null) ??
      (pricingConfig.percent as string | number | null) ??
      null,
    discountPercent: (pricingConfig.percent as number | null) ?? null,
    discountMax: (pricingConfig.maximumDiscount as number | null) ?? null,
    minimumSpend: (pricingConfig.minimumSpend as number | null) ?? null,
    redemptionType: o.redemption?.redemptionType ?? null,
    redemptionInstructions: (redemptionConfig.instructions as string | null) ?? null,
    offerCode: (redemptionConfig.code as string | null) ?? null,
    bookingUrl: (redemptionConfig.bookingUrl as string | null) ?? null,
    qrCodeUrl: (redemptionConfig.qrCodeUrl as string | null) ?? null,
    daysOfWeek: o.redemption?.daysOfWeek ?? null,
    maxRedemptions: o.capacity?.maxRedemptions ?? null,
    currentRedemptions: o.capacity?.redeemedCount ?? 0,
    isFeatured: o.isFeatured,
    isExclusive: o.isExclusive,
    startDate: o.startDate.toISOString(),
    endDate: o.endDate.toISOString(),
    merchant: o.merchant,
    isVisible: visibility.visible,
    visibilityReason: visibility.reason,
    isSaved: savedSet?.has(o.id) ?? false,
    isRedeemed: redeemedSet?.has(o.id) ?? false,
  }
}
