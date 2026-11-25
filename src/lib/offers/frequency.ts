/**
 * Offer "Frequency": how often each employee can use an offer.
 *
 * Stored in the existing `repeatAfterHours` cooldown so the current API and
 * mobile redeem logic keep working unchanged:
 *   - DAY / WEEK / MONTH → 24 / 168 / 720 hours
 *   - UNLIMITED          → a 1-minute cooldown (effectively no limit, and still
 *                          a positive value the existing cooldown logic accepts;
 *                          an empty value would mean "one redemption ever").
 */
export type OfferFrequency = "DAY" | "WEEK" | "MONTH" | "UNLIMITED";

export const UNLIMITED_REPEAT_HOURS = 1 / 60;

export const OFFER_FREQUENCY_OPTIONS: ReadonlyArray<{
  value: OfferFrequency;
  label: string;
  hours: number;
}> = [
  { value: "DAY", label: "Once a day", hours: 24 },
  { value: "WEEK", label: "Once a week", hours: 168 },
  { value: "MONTH", label: "Once a month", hours: 720 },
  { value: "UNLIMITED", label: "Unlimited", hours: UNLIMITED_REPEAT_HOURS },
];

export const DEFAULT_OFFER_FREQUENCY: OfferFrequency = "WEEK";

export function frequencyToRepeatHours(frequency: OfferFrequency): number {
  return OFFER_FREQUENCY_OPTIONS.find((o) => o.value === frequency)!.hours;
}

/**
 * Map a stored `repeatAfterHours` back to a Frequency option.
 * Returns null for values that don't match an option (legacy offers with a
 * custom cooldown, or none) so the merchant must pick one.
 */
export function repeatHoursToFrequency(
  hours: string | number | null | undefined,
): OfferFrequency | null {
  if (hours === null || hours === undefined || hours === "") return null;
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return null;
  const match = OFFER_FREQUENCY_OPTIONS.find((o) => Math.abs(o.hours - h) < 1e-6);
  return match?.value ?? null;
}
