-- Optional campaign start date for banner slots.
--
-- Availability is calculated at query time from (startDate, expiresAt, isActive),
-- so no scheduler/cron is needed to "activate" a banner. Additive only: existing
-- rows keep startDate = NULL, which preserves the previous always-available
-- behaviour. The column type intentionally matches "expiresAt" (TIMESTAMP(3)) so
-- the two schedule bounds compare identically against `now`.
ALTER TABLE "banners"
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
