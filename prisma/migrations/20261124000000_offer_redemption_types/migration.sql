-- Every redemption method an offer supports (Both = online code + in-store card).
ALTER TABLE "offer_redemptions" ADD COLUMN "redemptionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill from the legacy single value / stored channel.
UPDATE "offer_redemptions"
SET "redemptionTypes" = CASE
  WHEN "configuration"->>'channel' = 'BOTH' THEN ARRAY['ONLINE_CODE', 'VIRTUAL_CARD_AUTO_VERIFY']
  WHEN "configuration"->>'channel' = 'IN_STORE' THEN ARRAY['VIRTUAL_CARD_AUTO_VERIFY']
  WHEN "configuration"->>'channel' = 'ONLINE' THEN ARRAY['ONLINE_CODE']
  WHEN "redemptionType" IS NOT NULL THEN ARRAY["redemptionType"]
  ELSE ARRAY[]::TEXT[]
END;
