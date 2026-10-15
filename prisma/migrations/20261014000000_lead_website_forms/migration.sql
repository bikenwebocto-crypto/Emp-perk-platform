-- Website forms for the public leads API + Employee lead type.
-- Hand-written and additive only: no columns are dropped or altered.

-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that inserts the value;
-- nothing here uses it, so this is safe under `prisma migrate deploy`.
ALTER TYPE "LeadType" ADD VALUE IF NOT EXISTS 'EMPLOYEE_ACCESS';

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "formKey"           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "redemption"        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "intent"            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "shareWithEmployer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consents"          JSONB,
  ADD COLUMN IF NOT EXISTS "attribution"       JSONB;
