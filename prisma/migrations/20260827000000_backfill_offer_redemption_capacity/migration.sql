-- Backfill offer_redemption_capacity for offers that already have an
-- offer_redemptions row but no capacity row yet (i.e. every offer created
-- before the capacity/attempt tracking system existed).
--
-- Without this, every pre-existing offer would show as "0 redeemed / no
-- cap" the moment reads are switched over to offer_redemption_capacity,
-- even offers already partway through their redemption limit.
--
-- offer_redemptions.maxRedemptions defaults to 0 and historically 0/NULL
-- both mean "unlimited" in the legacy eligibility check (see
-- src/lib/offer-visibility.ts, `maxRedemptions > 0` is the only capped
-- case). offer_redemption_capacity uses NULL (not 0) to mean unlimited
-- (see reserveCapacity's "maxRedemptions IS NULL OR ..." check in
-- src/lib/redemption-tracking.ts). NULLIF(..., 0) preserves that meaning
-- across the backfill.
--
-- Idempotent: only inserts rows for offers that don't already have one.

INSERT INTO "offer_redemption_capacity" ("id", "offerId", "maxRedemptions", "redeemedCount", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."offerId", NULLIF(r."maxRedemptions", 0), r."currentRedemptions", NOW(), NOW()
FROM "offer_redemptions" r
LEFT JOIN "offer_redemption_capacity" c ON c."offerId" = r."offerId"
WHERE c."offerId" IS NULL;
