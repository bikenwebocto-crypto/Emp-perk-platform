/**
 * Lifecycle order for merchant offers: what is running now first, then what
 * is moving toward live, then what needs the merchant's attention, then what
 * has ended. Used for the default list order and the Status column sort.
 */
const OFFER_STATUS_ORDER = [
  'LIVE',
  'REPLACEMENT_PENDING',
  'VALIDATION_IN_PROGRESS',
  'PENDING_APPROVAL',
  'AWAITING_APPROVAL',
  'CHANGES_REQUESTED',
  'VALIDATION_FAILED',
  'DRAFT',
  'REJECTED',
  'FULL',
  'EXPIRED',
  'REPLACED',
  'ARCHIVED',
] as const

export function offerStatusRank(status: string | null | undefined): number {
  const i = OFFER_STATUS_ORDER.indexOf((status ?? '') as (typeof OFFER_STATUS_ORDER)[number])
  return i === -1 ? OFFER_STATUS_ORDER.length : i
}
