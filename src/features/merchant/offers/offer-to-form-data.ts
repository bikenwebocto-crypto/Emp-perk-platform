// Maps a merchant offer from GET /api/merchant/offers/[id] into OfferForm initialData.
// The form uses frontend enums (FLAT / PERCENTAGE / BUY_X_GET_Y) while the API
// uses backend values (flat_rate / percentage / buy_x_get_y).
const OFFER_TYPE_TO_FRONTEND: Record<string, string> = {
  flat_rate: 'FLAT',
  fixed_amount: 'FLAT',
  percentage: 'PERCENTAGE',
  buy_x_get_y: 'BUY_X_GET_Y',
}

// Convert a stored Date (ISO/UTC) into the value expected by <input type="datetime-local">,
// preserving the user's local time instead of shifting to UTC via toISOString().
export function toDateTimeLocal(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function offerToFormData(offer: any) {
  const pricingConfig = (offer.pricing?.configuration as Record<string, unknown>) ?? {}
  const redemptionConfig = (offer.redemption?.configuration as Record<string, unknown>) ?? {}
  return {
    title: offer.title ?? '',
    description: offer.content?.description ?? '',
    shortDescription: offer.content?.shortDescription ?? '',
    termsAndConditions: offer.content?.termsAndConditions ?? '',
    imageUrls: Array.isArray(offer.content?.imageUrls) ? offer.content.imageUrls : [],
    offerType: OFFER_TYPE_TO_FRONTEND[offer.offerType ?? ''] ?? 'FLAT',
    discountValue: pricingConfig.amount != null ? String(pricingConfig.amount) : '',
    discountMax: pricingConfig.maximumDiscount != null ? String(pricingConfig.maximumDiscount) : '',
    discountPercent: pricingConfig.percent != null ? String(pricingConfig.percent) : '',
    minimumSpend: pricingConfig.minimumSpend != null ? String(pricingConfig.minimumSpend) : '',
    buyQuantity: pricingConfig.buyQuantity != null ? String(pricingConfig.buyQuantity) : '',
    buyItem: pricingConfig.buyItem ? String(pricingConfig.buyItem) : '',
    getQuantity: pricingConfig.getQuantity != null ? String(pricingConfig.getQuantity) : '',
    freeItem: pricingConfig.freeItem ? String(pricingConfig.freeItem) : '',
    maxFreeItems: pricingConfig.maxFreeItems != null ? String(pricingConfig.maxFreeItems) : '',
    maxRedemptions:
      offer.capacity?.maxRedemptions != null
        ? String(offer.capacity.maxRedemptions)
        : offer.redemption?.maxRedemptions != null
          ? String(offer.redemption.maxRedemptions)
          : '',
    repeatAfterHours: offer.repeatAfterHours != null ? String(offer.repeatAfterHours) : '',
    startDate: toDateTimeLocal(offer.startDate),
    endDate: toDateTimeLocal(offer.endDate),
    isFlash: !!offer.isFlash,
    daysOfWeek: Array.isArray(offer.redemption?.daysOfWeek) ? offer.redemption.daysOfWeek.join(',') : '0,1,2,3,4,5,6',
    redemptionCode: redemptionConfig.code ? String(redemptionConfig.code) : '',
    redemptionInstructions: redemptionConfig.instructions ? String(redemptionConfig.instructions) : '',
    bookingUrl: redemptionConfig.bookingUrl ? String(redemptionConfig.bookingUrl) : '',
    redemptionType: offer.redemption?.redemptionType ?? 'IN_STORE_QR',
    // Channel + branches come from GET /api/merchant/offers/[id] (stored in redemption configuration).
    ...(offer.channel ? { channel: offer.channel } : {}),
    ...(typeof offer.allBranches === 'boolean' ? { allBranches: offer.allBranches } : {}),
    ...(Array.isArray(offer.branchIds) ? { branchIds: offer.branchIds } : {}),
    submissionNotes: offer.review?.submissionNotes ?? '',
  }
}
