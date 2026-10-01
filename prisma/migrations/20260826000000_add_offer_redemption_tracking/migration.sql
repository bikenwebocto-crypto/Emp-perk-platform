-- Add new tables for redemption tracking and per-employee claim.
-- No existing tables are altered.

CREATE TABLE "offer_redemption_capacity" (
  "id" UUID NOT NULL,
  "offerId" UUID NOT NULL,
  "maxRedemptions" INTEGER,
  "redeemedCount" INTEGER NOT NULL DEFAULT 0,
  "lastRedeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offer_redemption_capacity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offer_redemption_capacity_offerId_key" ON "offer_redemption_capacity"("offerId");
CREATE INDEX "offer_redemption_capacity_offerId_idx" ON "offer_redemption_capacity"("offerId");

ALTER TABLE "offer_redemption_capacity"
  ADD CONSTRAINT "offer_redemption_capacity_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "offer_redemption_attempts" (
  "id" UUID NOT NULL,
  "offerId" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "redemptionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offer_redemption_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offer_redemption_attempts_offerId_employeeId_key" ON "offer_redemption_attempts"("offerId", "employeeId");
CREATE UNIQUE INDEX "offer_redemption_attempts_redemptionId_key" ON "offer_redemption_attempts"("redemptionId");
CREATE INDEX "offer_redemption_attempts_offerId_idx" ON "offer_redemption_attempts"("offerId");
CREATE INDEX "offer_redemption_attempts_employeeId_idx" ON "offer_redemption_attempts"("employeeId");

ALTER TABLE "offer_redemption_attempts"
  ADD CONSTRAINT "offer_redemption_attempts_offerId_fkey"
  FOREIGN KEY ("offerId") REFERENCES "merchant_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "offer_redemption_attempts"
  ADD CONSTRAINT "offer_redemption_attempts_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
