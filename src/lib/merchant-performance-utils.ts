/**
 * Pure max-offer-cost utilities — no Prisma, no server dependencies.
 * Safe to import from client components.
 *
 * Business-performance metric: the total maximum discount cost (exposure)
 * a merchant has committed to across their LIVE offers.
 *
 * Per live offer:
 *   - flat_rate   → per-redemption cost = pricing.configuration.amount
 *   - percentage  → per-redemption cost = pricing.configuration.maximumDiscount (the cap);
 *                   if no cap is configured the exposure is unbounded
 *   - buy_x_get_y → no monetary value in pricing config → not computable
 *
 * Offer exposure = per-redemption cost × maxRedemptions.
 *   - maxRedemptions NULL  → unlimited redemptions → unbounded exposure
 *   - maxRedemptions 0     → no redemptions possible → contributes 0
 *   - maxRedemptions > 0   → finite: per-redemption × maxRedemptions
 *
 * All data comes from existing tables (MerchantOffer + OfferPricing +
 * OfferRedemption). No schema changes.
 */

export interface MaxOfferCostInput {
  offerType: string
  pricing: { configuration: unknown } | null
  redemption: { maxRedemptions: number | null } | null
}

export interface MaxOfferCost {
  /** Sum of computable finite exposure across live offers. */
  total: number
  /** True if any live offer has unlimited redemptions (maxRedemptions NULL). */
  hasUnlimited: boolean
  /** True if any live offer's per-redemption cost can't be capped (uncapped % or buy_x_get_y). */
  hasUncapped: boolean
  /** Number of live offers evaluated. */
  liveOfferCount: number
}

export function computeMaxOfferCost(liveOffers: MaxOfferCostInput[]): MaxOfferCost {
  let total = 0
  let hasUnlimited = false
  let hasUncapped = false

  for (const o of liveOffers) {
    const config = (o.pricing?.configuration as Record<string, unknown> | null | undefined) ?? {}
    const maxR = o.redemption?.maxRedemptions ?? null

    let perRedemption: number | null = null
    if (o.offerType === 'flat_rate') {
      perRedemption = Number(config.amount ?? 0)
    } else if (o.offerType === 'percentage') {
      perRedemption = config.maximumDiscount != null ? Number(config.maximumDiscount) : null
    }
    // buy_x_get_y and unknown types → perRedemption stays null (no monetary value)

    if (perRedemption == null) {
      hasUncapped = true
      continue
    }
    if (maxR == null) {
      hasUnlimited = true
      continue
    }
    if (maxR <= 0) continue // no redemptions possible → 0 exposure
    total += perRedemption * maxR
  }

  return { total, hasUnlimited, hasUncapped, liveOfferCount: liveOffers.length }
}

/**
 * Format the max-offer-cost metric for display.
 *   - Any unbounded component → "€X+" when a finite part exists, else "Unlimited"
 *   - Otherwise → "€X"
 */
export function formatMaxOfferCost(p: MaxOfferCost | null | undefined): string {
  if (!p) return '—'
  const fmt = (n: number) => `€${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
  if (p.hasUnlimited || p.hasUncapped) {
    return p.total > 0 ? `${fmt(p.total)}+` : 'Unlimited'
  }
  return fmt(p.total)
}
