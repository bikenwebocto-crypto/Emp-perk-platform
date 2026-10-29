-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "DeactivationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "profile_deactivation_requests" (
    "id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "reason" TEXT,
    "status" "DeactivationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedByType" VARCHAR(50),
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "profile_deactivation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "profile_deactivation_requests_employeeId_idx" ON "profile_deactivation_requests"("employeeId");
CREATE INDEX IF NOT EXISTS "profile_deactivation_requests_companyId_status_idx" ON "profile_deactivation_requests"("companyId", "status");
CREATE INDEX IF NOT EXISTS "profile_deactivation_requests_status_idx" ON "profile_deactivation_requests"("status");

-- AddForeignKey
ALTER TABLE "profile_deactivation_requests" ADD CONSTRAINT "profile_deactivation_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profile_deactivation_requests" ADD CONSTRAINT "profile_deactivation_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
