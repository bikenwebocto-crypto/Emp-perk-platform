import { hasEnded, notEndedBy } from './end-date';

export function isEvergreenRange(startDate: Date | string, endDate: Date | string | null | undefined): boolean {
  // null = stored open-ended offer (Evergreen). "" / undefined = draft with no
  // end date yet, which is not a range.
  if (endDate === null) return true;
  if (!endDate) return false;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  const threshold = new Date(start);
  threshold.setFullYear(threshold.getFullYear() + 1);
  return end >= threshold;
}

export function offerRank(o: { evergreen: boolean; isFlash?: boolean | null }): number {
  return o.evergreen ? 0 : o.isFlash ? 1 : 2;
}

export function isForeverOffer(offer: {
  isForever?: boolean | null;
  startDate: Date | string;
  endDate: Date | string | null;
}): boolean {
  // A stored null endDate means open-ended, i.e. Evergreen.
  return !!offer.isForever || offer.endDate === null || isEvergreenRange(offer.startDate, offer.endDate);
}

type LiveOfferForForeverPolicy = {
  id: string;
  startDate: Date | string;
  endDate: Date | string | null;
  isForever?: boolean | null;
  isFlash?: boolean | null;
  replacesOfferId?: string | null;
};

export function validateMerchantForeverOfferPolicy({
  liveOffers,
  upcomingOffer,
  isReplacement = false,
  replacementTargetId = null,
}: {
  liveOffers: LiveOfferForForeverPolicy[];
  upcomingOffer: {
    id?: string | null;
    startDate: Date | string;
    endDate: Date | string | null;
    isForever?: boolean | null;
    isFlash?: boolean | null;
  };
  isReplacement?: boolean;
  replacementTargetId?: string | null;
}): string | null {
  const otherLiveOffers = liveOffers.filter(
    (offer) => offer.id !== upcomingOffer.id,
  );

  let replacementTarget: LiveOfferForForeverPolicy | null = null;
  if (isReplacement && replacementTargetId) {
    replacementTarget =
      otherLiveOffers.find((offer) => offer.id === replacementTargetId) ?? null;
  }

  const remainingLiveOffers = otherLiveOffers.filter(
    (offer) => offer.id !== replacementTarget?.id,
  );

  const isUpcomingForeverOffer = isForeverOffer({
    isForever: upcomingOffer.isForever,
    startDate: upcomingOffer.startDate,
    endDate: upcomingOffer.endDate,
  });
  const hasLiveForeverOffer = otherLiveOffers.some((offer) =>
    isForeverOffer({
      isForever: offer.isForever,
      startDate: offer.startDate,
      endDate: offer.endDate,
    }),
  );
  const remainingHasForever = remainingLiveOffers.some((offer) =>
    isForeverOffer({
      isForever: offer.isForever,
      startDate: offer.startDate,
      endDate: offer.endDate,
    }),
  );

  // Flash offers need an Evergreen that is LIVE *and* already inside its
  // validity window (started, not ended). A LIVE Evergreen scheduled for a
  // future start date does not unlock them yet.
  const now = new Date();
  const remainingHasActiveForever = remainingLiveOffers.some(
    (offer) =>
      isForeverOffer({
        isForever: offer.isForever,
        startDate: offer.startDate,
        endDate: offer.endDate,
      }) &&
      new Date(offer.startDate) <= now &&
      !hasEnded(offer.endDate, now),
  );

  if (isUpcomingForeverOffer) {
    if (remainingHasForever) {
      return "A live Forever offer already exists for this merchant. Only the current live Forever offer can be replaced.";
    }
  } else if (!remainingHasActiveForever) {
    if (hasLiveForeverOffer && !remainingHasForever) {
      return "A live Forever offer can only be replaced by another Forever offer.";
    }
    return EVERGREEN_REQUIRED_MESSAGE;
  }

  if (remainingLiveOffers.length >= 5) {
    return isUpcomingForeverOffer
      ? "This merchant already has 5 live offers. The first Forever offer cannot be approved until a live offer is replaced or removed."
      : "This merchant already has 5 live offers. Approval is blocked because the total live count would exceed 5.";
  }

  return null;
}

// ── Evergreen-first auto-activation ─────────────────────────────────────────

export const EVERGREEN_REQUIRED_MESSAGE =
  "You need a LIVE Evergreen offer before creating Flash offers. Please create your Evergreen offer first.";

export const EVERGREEN_LIVE_MESSAGE =
  "Your Evergreen offer is now LIVE! You can now create Flash offers.";

export const EVERGREEN_ALREADY_LIVE_MESSAGE =
  "You already have a LIVE Evergreen offer. Only one LIVE Evergreen offer is allowed — use Replace on your current Evergreen offer instead.";

export const EVERGREEN_REPLACE_CONFIRM_MESSAGE =
  "You already have a LIVE Evergreen offer. Only one Evergreen offer can be live per account — if you continue, this new offer is sent for admin approval. Once approved, your current Evergreen offer will become inactive and this new offer will go LIVE.";

export const EVERGREEN_REPLACE_CONFIRM_CODE = "EVERGREEN_REPLACE_CONFIRM_REQUIRED";

export class EvergreenActivationError extends Error {
  code: string;
  currentOffer: { id: string; title: string } | null;
  constructor(
    message: string,
    code = "EVERGREEN_ACTIVATION_BLOCKED",
    currentOffer: { id: string; title: string } | null = null,
  ) {
    super(message);
    this.name = "EvergreenActivationError";
    this.code = code;
    this.currentOffer = currentOffer;
  }
}

/** The merchant's currently LIVE Evergreen offer (non-flash forever), if any. */
export function findLiveEvergreen<T extends LiveOfferForForeverPolicy>(
  liveOffers: T[],
  excludeOfferId?: string | null,
): T | null {
  return (
    liveOffers.find((o) => o.id !== excludeOfferId && isEvergreenOffer(o)) ?? null
  );
}

/**
 * An offer is an Evergreen (foundational) offer only when it is a Forever
 * offer (flag or ≥1-year range) AND not a Flash offer. `isFlash = false`
 * alone does NOT mean Evergreen.
 */
export function isEvergreenOffer(offer: {
  isForever?: boolean | null;
  isFlash?: boolean | null;
  startDate: Date | string;
  endDate: Date | string | null;
}): boolean {
  return !offer.isFlash && isForeverOffer(offer);
}

/**
 * Should this submission skip admin approval and go straight to LIVE?
 * Never: every offer, Evergreen included, goes to AWAITING_APPROVAL. The
 * current LIVE Evergreen is deactivated by the admin approval, not on submit.
 */
export function shouldAutoActivateEvergreen(_params: {
  qcPassed: boolean;
  isReplacement: boolean;
  offer: {
    isForever?: boolean | null;
    isFlash?: boolean | null;
    startDate: Date | string;
    endDate: Date | string | null;
  };
}): boolean {
  return false;
}

/**
 * Must be called inside a transaction, before writing status = LIVE.
 * Locks the merchant row (the same lock the admin approval path takes), so
 * concurrent submissions / approvals for one merchant are serialised, then
 * re-checks the one-LIVE-Evergreen and 5-live-offer rules against committed
 * data. Throws EvergreenActivationError when activation is not allowed.
 */
export async function assertEvergreenActivationAllowed(
  tx: any,
  merchantId: string,
  excludeOfferId?: string | null,
  options: { confirmReplace?: boolean } = {},
): Promise<{ replacedOfferId: string | null; replacedOfferTitle: string | null }> {
  await tx.$queryRaw`SELECT id FROM "merchants" WHERE id = ${merchantId} FOR UPDATE`;
  const now = new Date();
  const live = await tx.merchantOffer.findMany({
    where: {
      merchantId,
      deletedAt: null,
      status: "LIVE",
      AND: [notEndedBy(now)],
      ...(excludeOfferId ? { id: { not: excludeOfferId } } : {}),
    },
    select: { id: true, title: true, isForever: true, isFlash: true, startDate: true, endDate: true },
  });

  // One LIVE Evergreen per account: the new one takes over once the merchant
  // has confirmed; the previous one is marked REPLACED (inactive).
  const current = live.find((o: LiveOfferForForeverPolicy) => isForeverOffer(o)) as
    | { id: string; title: string }
    | undefined;
  if (current && !options.confirmReplace) {
    throw new EvergreenActivationError(
      EVERGREEN_REPLACE_CONFIRM_MESSAGE,
      EVERGREEN_REPLACE_CONFIRM_CODE,
      { id: current.id, title: current.title },
    );
  }

  const remaining = current ? live.length - 1 : live.length;
  if (remaining >= 5) {
    throw new EvergreenActivationError(
      "This merchant already has 5 live offers. A live offer must be replaced or removed first.",
    );
  }

  if (current) {
    await tx.merchantOffer.update({
      where: { id: current.id },
      data: { status: "REPLACED" },
    });
  }
  return { replacedOfferId: current?.id ?? null, replacedOfferTitle: current?.title ?? null };
}

// ── One pending Evergreen replacement ───────────────────────────────────────

export const EVERGREEN_PENDING_CODE = "EVERGREEN_REPLACEMENT_PENDING";

export const evergreenPendingMessage = (title: string) =>
  `Your Evergreen offer "${title}" is already waiting for admin approval. Only one Evergreen replacement can be pending at a time — wait for the admin's decision, or withdraw it, before submitting another.`;

/**
 * The merchant's Evergreen offer currently AWAITING_APPROVAL (other than
 * `excludeOfferId`), if any. Together with the one-LIVE rule this caps a
 * merchant at one LIVE Evergreen plus one pending replacement.
 */
export async function findPendingEvergreen(
  db: any,
  merchantId: string,
  excludeOfferId?: string | null,
): Promise<{ id: string; title: string } | null> {
  const pending = await db.merchantOffer.findMany({
    where: {
      merchantId,
      deletedAt: null,
      status: "AWAITING_APPROVAL",
      isFlash: false,
      ...(excludeOfferId ? { id: { not: excludeOfferId } } : {}),
    },
    select: { id: true, title: true, isForever: true, isFlash: true, startDate: true, endDate: true },
  });
  const hit = pending.find((o: Parameters<typeof isEvergreenOffer>[0]) => isEvergreenOffer(o));
  return hit ? { id: hit.id, title: hit.title } : null;
}
