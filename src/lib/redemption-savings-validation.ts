/**
 * Simple, synchronous check — runs inline during the PATCH request, no
 * background jobs, no AuditLog writes, no RenewalGamingAlert. Just computes
 * an expected saving from the offer's pricing config and compares it to
 * what the employee entered.
 *
 * BOGO (buy_x_get_y) offers are verifiable when the trigger and free item
 * are the same product AND the employee reports how many units they
 * actually bought (quantityPurchased). Without a quantity, the check falls
 * back to the old single-trigger assumption with a wider tolerance.
 * Different trigger/free products remain NOT_VERIFIABLE — the schema has
 * no per-item price data to check them against.
 */

const TOLERANCE_ABSOLUTE = 1.0; // EUR
const TOLERANCE_RELATIVE = 0.1; // 10%
const TOLERANCE_FALLBACK_RELATIVE = 0.15; // 15% — used when quantityPurchased is missing

export type SavingValidationResult =
  | { status: "VALID"; message: string }
  | { status: "INVALID"; message: string }
  | { status: "NOT_VERIFIABLE"; message: string }
  | { status: "SKIPPED"; message: string };

function computeExpectedSaving(
  pricingType: string,
  configuration: Record<string, unknown>,
  billAmount: number,
  quantityPurchased?: number,
): { expected: number; tolerance: number } | null {
  switch (pricingType) {
    case "percentage":
    case "PERCENTAGE": {
      const pct = Number(configuration.percent);

      if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
        return null;
      }

      // billAmount = amount actually paid after discount
      const original = billAmount / (1 - pct / 100);
      const expected = original - billAmount;

      return {
        expected,
        tolerance: Math.max(TOLERANCE_ABSOLUTE, expected * TOLERANCE_RELATIVE),
      };
    }

    case "flat":
    case "FLAT":
    case "flat_rate":
    case "fixed_amount": {
      const amount = Number(configuration.amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return null;
      }

      return {
        expected: amount,
        tolerance: TOLERANCE_ABSOLUTE,
      };
    }

    case "buy_x_get_y":
    case "BUY_X_GET_Y": {
      const buyItem = configuration.buyItem;
      const freeItem = configuration.freeItem;
      const buyQuantity = Number(configuration.buyQuantity);
      const getQuantity = Number(configuration.getQuantity);
      const maxFreeItems = Number(configuration.maxFreeItems);

      if (buyItem === undefined || freeItem === undefined || buyItem !== freeItem) {
        return null; // different products — still not verifiable
      }
      if (!Number.isFinite(buyQuantity) || buyQuantity <= 0) return null;
      if (!Number.isFinite(getQuantity) || getQuantity <= 0) return null;

      // Use actual quantity purchased when provided; fall back to the old
      // single-trigger assumption (with wider tolerance) if not provided,
      // so existing calls to this function without the new param still work.
      const qp = Number(quantityPurchased);
      const hasQuantity =
        quantityPurchased !== undefined &&
        Number.isFinite(qp) &&
        qp > 0;
      const actualQuantity = hasQuantity ? qp : buyQuantity;

      const freeUnitsTriggered =
        Math.floor(actualQuantity / buyQuantity) * getQuantity;
      const freeUnitsEarned =
        Number.isFinite(maxFreeItems) && maxFreeItems > 0
          ? Math.min(freeUnitsTriggered, maxFreeItems)
          : freeUnitsTriggered;

      const unitPrice = billAmount / actualQuantity;
      const expected = freeUnitsEarned * unitPrice;

      // Tighter tolerance now that we have real quantity data — only fall
      // back to the wider 15% tolerance when quantityPurchased is missing.
      const usedFallback = !hasQuantity;
      const tolerance = usedFallback
        ? Math.max(TOLERANCE_ABSOLUTE, expected * TOLERANCE_FALLBACK_RELATIVE)
        : Math.max(TOLERANCE_ABSOLUTE, expected * TOLERANCE_RELATIVE);

      return { expected, tolerance };
    }

    default:
      return null;
  }
}

export function validateSaving(
  pricingType: string | undefined,
  configuration: Record<string, unknown> | undefined,
  billAmount: number,
  enteredSaving: number,
  quantityPurchased?: number,
): SavingValidationResult {
  if (!pricingType) {
    return {
      status: "NOT_VERIFIABLE",
      message:
        "Saving validation cannot be performed because the offer type is missing.",
    };
  }

  // buy_x_get_y is no longer short-circuited to SKIPPED — it is verifiable
  // when trigger and free item are the same product (see
  // computeExpectedSaving). Different-product BOGO falls through to
  // NOT_VERIFIABLE below.
  const computed = computeExpectedSaving(
    pricingType,
    configuration ?? {},
    billAmount,
    quantityPurchased,
  );

  if (!computed) {
    return {
      status: "NOT_VERIFIABLE",
      message: "Saving validation cannot be performed for this offer type.",
    };
  }

  const { expected, tolerance } = computed;
  const deviation = Math.abs(enteredSaving - expected);

  if (deviation <= tolerance) {
    return { status: "VALID", message: "Saving amount is valid." };
  }

  return {
    status: "INVALID",
    message: `This saving amount isn't possible for this offer. Expected around €${expected.toFixed(2)}, based on your bill amount.`,
  };
}
