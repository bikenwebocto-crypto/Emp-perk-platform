-- Lead intake v2: four website forms only.
--  * LeadType drops EMPLOYEE_ACCESS (no rows used it) and gains the two new intake types.
--  * companyName becomes optional (individuals and contact messages have no company).
--  * message becomes TEXT so a contact message can hold 5000 characters.
--  * linkedin and referralSource are new columns for the website forms.
--  * intent and shareWithEmployer were employee-only and are removed.
--
-- The statements are idempotent so the migration can also run on a database that was
-- pushed with `prisma db push` instead of `prisma migrate deploy`.

-- AlterEnum: rebuild LeadType with the four intake types.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'LeadType' AND e.enumlabel = 'EMPLOYEE_ACCESS'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'LeadType' AND e.enumlabel = 'INDIVIDUAL_WAITLIST'
  ) THEN
    CREATE TYPE "LeadType_new" AS ENUM ('MERCHANT', 'EMPLOYER', 'INDIVIDUAL_WAITLIST', 'CONTACT_MESSAGE');
    ALTER TABLE "leads" ALTER COLUMN "type" TYPE "LeadType_new" USING ("type"::text::"LeadType_new");
    ALTER TYPE "LeadType" RENAME TO "LeadType_old";
    ALTER TYPE "LeadType_new" RENAME TO "LeadType";
    DROP TYPE "LeadType_old";
  END IF;
END $$;

-- AlterTable
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "linkedin" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "referralSource" VARCHAR(60),
  ALTER COLUMN "companyName" DROP NOT NULL,
  ALTER COLUMN "message" SET DATA TYPE TEXT;

-- Employee-only columns are gone.
ALTER TABLE "leads" DROP COLUMN IF EXISTS "intent";
ALTER TABLE "leads" DROP COLUMN IF EXISTS "shareWithEmployer";
