-- New table for per-employee address data.
-- No existing tables are altered.

CREATE TABLE "employee_addresses" (
  "id" UUID NOT NULL,
  "employeeId" UUID NOT NULL,
  "addressLine1" VARCHAR(255),
  "addressLine2" VARCHAR(255),
  "city" VARCHAR(100),
  "state" VARCHAR(100),
  "postalCode" VARCHAR(20),
  "country" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_addresses_employeeId_key" ON "employee_addresses"("employeeId");

ALTER TABLE "employee_addresses"
  ADD CONSTRAINT "employee_addresses_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
