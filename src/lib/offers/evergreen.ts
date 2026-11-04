export function isEvergreenRange(startDate: Date | string, endDate: Date | string): boolean {
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
  endDate: Date | string;
}): boolean {
  return !!offer.isForever || isEvergreenRange(offer.startDate, offer.endDate);
}

type LiveOfferForForeverPolicy = {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
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
    endDate: Date | string;
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

  if (isUpcomingForeverOffer) {
    if (remainingHasForever) {
      return "A live Forever offer already exists for this merchant. Only the current live Forever offer can be replaced.";
    }
  } else if (!remainingHasForever) {
    if (hasLiveForeverOffer) {
      return "A live Forever offer can only be replaced by another Forever offer.";
    }
    return "This merchant must have a live Forever offer before submitting a regular or Flash offer. Create or submit a Forever offer first.";
  }

  if (remainingLiveOffers.length >= 5) {
    return isUpcomingForeverOffer
      ? "This merchant already has 5 live offers. The first Forever offer cannot be approved until a live offer is replaced or removed."
      : "This merchant already has 5 live offers. Approval is blocked because the total live count would exceed 5.";
  }

  return null;
}
