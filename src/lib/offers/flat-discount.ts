/**
 * Shared validation for flat-amount offers (Discount Amount + Minimum Spend).
 * Used by the merchant offer form and by the create / update / submit APIs,
 * so the rules can't be bypassed by calling the API directly.
 *
 * Money is compared as integer cents to avoid floating-point surprises
 * (e.g. 0.1 + 0.2). Values may have at most 2 decimal places.
 */

export const FLAT_DISCOUNT_MESSAGES = {
  discountRequired: "Discount amount is required.",
  discountInvalid: "Discount amount must be a valid amount with up to 2 decimal places.",
  discountNotPositive: "Discount amount must be greater than zero.",
  minSpendRequired: "Minimum spend is required.",
  minSpendInvalid: "Minimum spend must be a valid amount with up to 2 decimal places.",
  minSpendNotPositive: "Minimum spend must be greater than zero.",
  minSpendNotGreater: "Minimum spend must be greater than the discount amount.",
  fullDiscount: "A 100% discount or greater is not permitted.",
} as const;

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
// Keep well inside Number.MAX_SAFE_INTEGER once converted to cents.
const MAX_CENTS = 1_000_000_000_00;

export type MoneyParse =
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "ok"; cents: number };

/** Parse a monetary value (number or string) into integer cents. */
export function parseMoneyToCents(value: unknown): MoneyParse {
  if (value === null || value === undefined) return { kind: "missing" };
  let str: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { kind: "invalid" };
    // Negative numbers fail the regex below; String() of e.g. 99.99 is "99.99".
    str = String(value);
  } else if (typeof value === "string") {
    str = value.trim();
    if (str === "") return { kind: "missing" };
  } else {
    return { kind: "invalid" };
  }
  if (!MONEY_RE.test(str)) return { kind: "invalid" };
  const [whole, frac = ""] = str.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return { kind: "invalid" };
  return { kind: "ok", cents };
}

export interface FlatDiscountErrors {
  discountValue?: string;
  minimumSpend?: string;
}

/**
 * Validate a flat discount.
 * @param requireAll true for submission (both fields mandatory); false for
 *   drafts, where empty fields are allowed but any value given must be valid
 *   and the combination rule still applies when both are present.
 */
export function validateFlatDiscount(
  input: { discountValue: unknown; minimumSpend: unknown },
  { requireAll }: { requireAll: boolean },
): FlatDiscountErrors {
  const errors: FlatDiscountErrors = {};
  const d = parseMoneyToCents(input.discountValue);
  const m = parseMoneyToCents(input.minimumSpend);

  if (d.kind === "missing") {
    if (requireAll) errors.discountValue = FLAT_DISCOUNT_MESSAGES.discountRequired;
  } else if (d.kind === "invalid") {
    errors.discountValue = isNegative(input.discountValue)
      ? FLAT_DISCOUNT_MESSAGES.discountNotPositive
      : FLAT_DISCOUNT_MESSAGES.discountInvalid;
  } else if (d.cents <= 0) {
    errors.discountValue = FLAT_DISCOUNT_MESSAGES.discountNotPositive;
  }

  if (m.kind === "missing") {
    if (requireAll) errors.minimumSpend = FLAT_DISCOUNT_MESSAGES.minSpendRequired;
  } else if (m.kind === "invalid") {
    errors.minimumSpend = isNegative(input.minimumSpend)
      ? FLAT_DISCOUNT_MESSAGES.minSpendNotPositive
      : FLAT_DISCOUNT_MESSAGES.minSpendInvalid;
  } else if (m.cents <= 0) {
    errors.minimumSpend = FLAT_DISCOUNT_MESSAGES.minSpendNotPositive;
  }

  // Combination rule: discount must be strictly below minimum spend (< 100%).
  if (!errors.discountValue && !errors.minimumSpend && d.kind === "ok" && m.kind === "ok") {
    if (d.cents >= m.cents) {
      errors.minimumSpend = FLAT_DISCOUNT_MESSAGES.minSpendNotGreater;
      errors.discountValue = FLAT_DISCOUNT_MESSAGES.fullDiscount;
    }
  }

  return errors;
}

// ── Percentage offers ────────────────────────────────────────────────────────

export const PERCENT_MIN = 1;
export const PERCENT_MAX = 90;

export const PERCENT_DISCOUNT_MESSAGES = {
  percentRequired: "Discount percentage is required.",
  percentInvalid: "Discount percentage must be a number with up to 2 decimal places.",
  percentRange: `Discount percentage must be between ${PERCENT_MIN}% and ${PERCENT_MAX}%.`,
  minSpendRequired: FLAT_DISCOUNT_MESSAGES.minSpendRequired,
  minSpendInvalid: FLAT_DISCOUNT_MESSAGES.minSpendInvalid,
  minSpendNotPositive: FLAT_DISCOUNT_MESSAGES.minSpendNotPositive,
  maxRequired: "Maximum discount is required.",
  maxInvalid: "Maximum discount must be a valid amount with up to 2 decimal places.",
  maxNotPositive: "Maximum discount must be greater than zero.",
  maxNotBelowMinSpend: "Maximum discount must be less than the minimum spend.",
  maxBelowPercentOfMinSpend:
    "Maximum discount is lower than the % discount on the minimum spend, so the advertised % can never be reached.",
} as const;

export interface PercentDiscountErrors {
  discountPercent?: string;
  minimumSpend?: string;
  discountMax?: string;
}

/**
 * Validate a percentage offer:
 *  - Discount %: required, 1–90, up to 2 decimals.
 *  - Minimum Spend: required, > 0.
 *  - Maximum Discount: required, > 0, strictly below Minimum Spend (never a
 *    100%+ discount), and at least Discount % × Minimum Spend (otherwise the
 *    advertised % can't be achieved even at the minimum spend).
 */
export function validatePercentDiscount(
  input: { discountPercent: unknown; minimumSpend: unknown; discountMax: unknown },
  { requireAll }: { requireAll: boolean },
): PercentDiscountErrors {
  const M = PERCENT_DISCOUNT_MESSAGES;
  const errors: PercentDiscountErrors = {};
  // A percentage parses like money: integer "hundredths of a percent".
  const p = parseMoneyToCents(input.discountPercent);
  const m = parseMoneyToCents(input.minimumSpend);
  const x = parseMoneyToCents(input.discountMax);

  if (p.kind === "missing") {
    if (requireAll) errors.discountPercent = M.percentRequired;
  } else if (p.kind === "invalid") {
    errors.discountPercent = isNegative(input.discountPercent) ? M.percentRange : M.percentInvalid;
  } else if (p.cents < PERCENT_MIN * 100 || p.cents > PERCENT_MAX * 100) {
    errors.discountPercent = M.percentRange;
  }

  if (m.kind === "missing") {
    if (requireAll) errors.minimumSpend = M.minSpendRequired;
  } else if (m.kind === "invalid") {
    errors.minimumSpend = isNegative(input.minimumSpend) ? M.minSpendNotPositive : M.minSpendInvalid;
  } else if (m.cents <= 0) {
    errors.minimumSpend = M.minSpendNotPositive;
  }

  if (x.kind === "missing") {
    if (requireAll) errors.discountMax = M.maxRequired;
  } else if (x.kind === "invalid") {
    errors.discountMax = isNegative(input.discountMax) ? M.maxNotPositive : M.maxInvalid;
  } else if (x.cents <= 0) {
    errors.discountMax = M.maxNotPositive;
  }

  if (!errors.minimumSpend && !errors.discountMax && m.kind === "ok" && x.kind === "ok") {
    if (x.cents >= m.cents) {
      errors.discountMax = M.maxNotBelowMinSpend;
    } else if (!errors.discountPercent && p.kind === "ok") {
      // percent-of-min-spend in cents, computed in integers: m * p / 10000
      // (p is hundredths of a percent). Compare x * 10000 < m * p exactly.
      if (x.cents * 10000 < m.cents * p.cents) {
        errors.discountMax = M.maxBelowPercentOfMinSpend;
      }
    }
  }

  return errors;
}

/** Suggested Maximum Discount = Minimum Spend × Discount %, rounded to cents. */
export function suggestedPercentMax(discountPercent: unknown, minimumSpend: unknown): string {
  const p = parseMoneyToCents(discountPercent);
  const m = parseMoneyToCents(minimumSpend);
  if (p.kind !== "ok" || m.kind !== "ok" || p.cents <= 0 || m.cents <= 0) return "";
  const cents = Math.round((m.cents * p.cents) / 10000);
  return (cents / 100).toFixed(2);
}

export function isValidPercent(value: unknown): boolean {
  const p = parseMoneyToCents(value);
  return p.kind === "ok" && p.cents >= PERCENT_MIN * 100 && p.cents <= PERCENT_MAX * 100;
}

export function firstPercentDiscountError(errors: PercentDiscountErrors): string | null {
  return errors.discountPercent ?? errors.minimumSpend ?? errors.discountMax ?? null;
}

export function isPercentOfferType(offerType: unknown): boolean {
  return offerType === "percentage" || offerType === "PERCENTAGE";
}

/** True when the discount amount alone is a valid positive amount. */
export function isValidDiscountAmount(value: unknown): boolean {
  const d = parseMoneyToCents(value);
  return d.kind === "ok" && d.cents > 0;
}

/** Effective discount % = discount / minimum spend × 100, or null if not computable. */
export function flatDiscountPercent(discountValue: unknown, minimumSpend: unknown): number | null {
  const d = parseMoneyToCents(discountValue);
  const m = parseMoneyToCents(minimumSpend);
  if (d.kind !== "ok" || m.kind !== "ok" || m.cents <= 0) return null;
  return (d.cents / m.cents) * 100;
}

/** First error message, or null — handy for returning a single 400 message. */
export function firstFlatDiscountError(errors: FlatDiscountErrors): string | null {
  return errors.minimumSpend ?? errors.discountValue ?? null;
}

export function isFlatOfferType(offerType: unknown): boolean {
  return offerType === "flat_rate" || offerType === "fixed_amount" || offerType === "FLAT";
}

function isNegative(value: unknown): boolean {
  if (typeof value === "number") return value < 0;
  if (typeof value === "string") return /^\s*-/.test(value);
  return false;
}
