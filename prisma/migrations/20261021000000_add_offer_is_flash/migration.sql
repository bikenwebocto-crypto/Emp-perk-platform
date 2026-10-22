-- AlterTable
ALTER TABLE "merchant_offers" ADD COLUMN IF NOT EXISTS "isFlash" BOOLEAN NOT NULL DEFAULT false;
