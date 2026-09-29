-- CreateEnum
CREATE TYPE "MerchantSuggestionStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'CONTACTED', 'REJECTED', 'CONVERTED');

-- CreateTable
CREATE TABLE "merchant_suggestions" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "merchantName" VARCHAR(255) NOT NULL,
    "merchantWebsite" VARCHAR(500),
    "merchantPhone" VARCHAR(50) NOT NULL,
    "merchantEmail" VARCHAR(255) NOT NULL,
    "reason" TEXT,
    "status" "MerchantSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "rejectionReason" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "merchantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchant_suggestions_merchantId_key" ON "merchant_suggestions"("merchantId");

-- CreateIndex
CREATE INDEX "merchant_suggestions_employeeId_createdAt_idx" ON "merchant_suggestions"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "merchant_suggestions_status_createdAt_idx" ON "merchant_suggestions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "merchant_suggestions_merchantEmail_idx" ON "merchant_suggestions"("merchantEmail");

-- CreateIndex
CREATE INDEX "merchant_suggestions_merchantPhone_idx" ON "merchant_suggestions"("merchantPhone");

-- CreateIndex
CREATE INDEX "merchant_suggestions_companyId_idx" ON "merchant_suggestions"("companyId");

-- AddForeignKey
ALTER TABLE "merchant_suggestions" ADD CONSTRAINT "merchant_suggestions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_suggestions" ADD CONSTRAINT "merchant_suggestions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_suggestions" ADD CONSTRAINT "merchant_suggestions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

