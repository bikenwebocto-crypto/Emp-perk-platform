/**
 * Offer endDate is nullable: null means open-ended (Evergreen) and never ends.
 * A plain `endDate: { gt: now }` filter would drop those offers, so offer
 * queries use `AND: [notEndedBy(now)]` instead.
 */
export function notEndedBy(at: Date, inclusive = false) {
  return {
    OR: [{ endDate: null }, { endDate: inclusive ? { gte: at } : { gt: at } }],
  }
}

/** True when the offer has ended at `at`. Open-ended offers (null) never end. */
export function hasEnded(endDate: Date | string | null | undefined, at: Date = new Date()): boolean {
  return endDate != null && new Date(endDate) <= at
}

/** Milliseconds timestamp for sorting/comparing; open-ended sorts last. */
export function endTime(endDate: Date | string | null | undefined): number {
  return endDate == null ? Number.POSITIVE_INFINITY : new Date(endDate).getTime()
}
