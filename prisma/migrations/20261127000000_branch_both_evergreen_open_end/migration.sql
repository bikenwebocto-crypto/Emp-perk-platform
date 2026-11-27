-- Branches can be both a physical store and an online shop.
ALTER TYPE "BranchType" ADD VALUE IF NOT EXISTS 'BOTH';

-- Evergreen offers are open-ended: endDate may be NULL.
ALTER TABLE "merchant_offers" ALTER COLUMN "endDate" DROP NOT NULL;
