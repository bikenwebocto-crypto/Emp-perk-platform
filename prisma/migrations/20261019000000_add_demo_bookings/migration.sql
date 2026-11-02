-- "Book a Demo" requests from the public website.
-- Additive only: one new enum, one new table, its indexes and FK. No existing
-- table or column is altered or dropped.

-- CREATE TYPE has no IF NOT EXISTS, so guard it for re-runs.
DO $$ BEGIN
  CREATE TYPE "DemoBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "demo_bookings" (
  "id"              UUID NOT NULL,
  "reference"       VARCHAR(24) NOT NULL,
  "leadId"          UUID NOT NULL,
  -- UTC instant. A plain timestamp stored in UTC, matching every other table.
  "startsAt"        TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "timezone"        VARCHAR(64) NOT NULL,
  "notes"           VARCHAR(2000),
  "status"          "DemoBookingStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "demo_bookings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "demo_bookings_reference_key" ON "demo_bookings"("reference");
CREATE INDEX IF NOT EXISTS "demo_bookings_leadId_idx" ON "demo_bookings"("leadId");
CREATE INDEX IF NOT EXISTS "demo_bookings_status_startsAt_idx" ON "demo_bookings"("status", "startsAt");

ALTER TABLE "demo_bookings"
  ADD CONSTRAINT "demo_bookings_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
