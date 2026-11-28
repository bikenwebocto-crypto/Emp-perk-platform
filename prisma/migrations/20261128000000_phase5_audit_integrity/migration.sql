-- Phase 5: audit integrity and production readiness.
--
-- Additive only. No existing row is deleted or rewritten. Every statement can
-- be re-run safely (IF NOT EXISTS / ON CONFLICT / guarded DO blocks), so it also
-- applies cleanly to environments that were previously `prisma db push`ed.
--
-- Sections:
--   1. MFA recovery tables (present in schema.prisma but never migrated).
--   2. Business-state columns/tables that replace audit-log lookups.
--   3. Backfill of that state from existing audit history (read-only on audit).
--   4. Append-only guard triggers on audit_logs and mfa_recovery_audit_logs.

-- ─────────────────────────────────────────────────────────────
-- 1. MFA recovery
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "MfaRecoveryType" AS ENUM ('STANDARD', 'SUPER_ADMIN_EMERGENCY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MfaRecoveryStatus" AS ENUM (
    'PENDING', 'UNDER_REVIEW', 'OTP_SENT', 'OTP_VERIFIED', 'APPROVED', 'MFA_RESET',
    'AWAITING_NEW_MFA', 'COMPLETED', 'REJECTED', 'EXPIRED', 'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "mfa_recovery_requests" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "requestedByAccountId" UUID NOT NULL,
    "accountRole" "AccountRole" NOT NULL,
    "registeredEmail" VARCHAR(255) NOT NULL,
    "registeredPhone" VARCHAR(50),
    "reason" TEXT NOT NULL,
    "recoveryType" "MfaRecoveryType" NOT NULL,
    "status" "MfaRecoveryStatus" NOT NULL DEFAULT 'PENDING',
    "activeKey" VARCHAR(64),
    "assignedApproverAccountId" UUID,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedByAccountId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "otpSentAt" TIMESTAMP(3),
    "otpSendCount" INTEGER NOT NULL DEFAULT 0,
    "otpVerifiedAt" TIMESTAMP(3),
    "approvedByAccountId" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectedByAccountId" UUID,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "resetAt" TIMESTAMP(3),
    "resetFactorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resetError" TEXT,
    "newFactorId" VARCHAR(64),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mfa_recovery_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mfa_recovery_requests_activeKey_key" ON "mfa_recovery_requests"("activeKey");
CREATE INDEX IF NOT EXISTS "mfa_recovery_requests_accountId_idx" ON "mfa_recovery_requests"("accountId");
CREATE INDEX IF NOT EXISTS "mfa_recovery_requests_status_recoveryType_idx" ON "mfa_recovery_requests"("status", "recoveryType");
CREATE INDEX IF NOT EXISTS "mfa_recovery_requests_assignedApproverAccountId_status_idx" ON "mfa_recovery_requests"("assignedApproverAccountId", "status");
CREATE INDEX IF NOT EXISTS "mfa_recovery_requests_createdAt_idx" ON "mfa_recovery_requests"("createdAt");

CREATE TABLE IF NOT EXISTS "mfa_recovery_otps" (
    "id" UUID NOT NULL,
    "recoveryRequestId" UUID NOT NULL,
    "otpHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mfa_recovery_otps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mfa_recovery_otps_recoveryRequestId_createdAt_idx" ON "mfa_recovery_otps"("recoveryRequestId", "createdAt");

CREATE TABLE IF NOT EXISTS "mfa_recovery_approvers" (
    "id" UUID NOT NULL,
    "superAdminAccountId" UUID NOT NULL,
    "approverAccountId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByAccountId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "revokedByAccountId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mfa_recovery_approvers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mfa_recovery_approvers_superAdminAccountId_isActive_idx" ON "mfa_recovery_approvers"("superAdminAccountId", "isActive");
CREATE INDEX IF NOT EXISTS "mfa_recovery_approvers_approverAccountId_isActive_idx" ON "mfa_recovery_approvers"("approverAccountId", "isActive");
-- At most one active approver per super admin (documented in schema.prisma).
CREATE UNIQUE INDEX IF NOT EXISTS "mfa_recovery_approvers_one_active_per_super_admin"
  ON "mfa_recovery_approvers"("superAdminAccountId") WHERE "isActive" = true;

CREATE TABLE IF NOT EXISTS "mfa_recovery_audit_logs" (
    "id" UUID NOT NULL,
    "recoveryRequestId" UUID,
    "subjectAccountId" UUID,
    "actorAccountId" UUID,
    "actorRole" VARCHAR(50) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "previousStatus" "MfaRecoveryStatus",
    "newStatus" "MfaRecoveryStatus",
    "metadata" JSONB,
    "ipAddress" VARCHAR(45),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mfa_recovery_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mfa_recovery_audit_logs_recoveryRequestId_createdAt_idx" ON "mfa_recovery_audit_logs"("recoveryRequestId", "createdAt");
CREATE INDEX IF NOT EXISTS "mfa_recovery_audit_logs_subjectAccountId_createdAt_idx" ON "mfa_recovery_audit_logs"("subjectAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "mfa_recovery_audit_logs_action_idx" ON "mfa_recovery_audit_logs"("action");

DO $$ BEGIN
  ALTER TABLE "mfa_recovery_requests" ADD CONSTRAINT "mfa_recovery_requests_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("authUserId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mfa_recovery_requests" ADD CONSTRAINT "mfa_recovery_requests_assignedApproverAccountId_fkey"
    FOREIGN KEY ("assignedApproverAccountId") REFERENCES "accounts"("authUserId") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mfa_recovery_otps" ADD CONSTRAINT "mfa_recovery_otps_recoveryRequestId_fkey"
    FOREIGN KEY ("recoveryRequestId") REFERENCES "mfa_recovery_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mfa_recovery_approvers" ADD CONSTRAINT "mfa_recovery_approvers_superAdminAccountId_fkey"
    FOREIGN KEY ("superAdminAccountId") REFERENCES "accounts"("authUserId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mfa_recovery_approvers" ADD CONSTRAINT "mfa_recovery_approvers_approverAccountId_fkey"
    FOREIGN KEY ("approverAccountId") REFERENCES "accounts"("authUserId") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "mfa_recovery_audit_logs" ADD CONSTRAINT "mfa_recovery_audit_logs_recoveryRequestId_fkey"
    FOREIGN KEY ("recoveryRequestId") REFERENCES "mfa_recovery_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Business state that previously lived only in audit rows
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "invite_token_uses" (
    "jti" VARCHAR(128) NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "subjectId" UUID NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invite_token_uses_pkey" PRIMARY KEY ("jti")
);
CREATE INDEX IF NOT EXISTS "invite_token_uses_kind_subjectId_idx" ON "invite_token_uses"("kind", "subjectId");

ALTER TABLE "company_admins" ADD COLUMN IF NOT EXISTS "inviteStatus" VARCHAR(16);
ALTER TABLE "company_admins" ADD COLUMN IF NOT EXISTS "inviteStatusAt" TIMESTAMP(3);

ALTER TABLE "demo_bookings" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────
-- 3. Backfill (reads audit_logs, never writes to it). Idempotent; re-run
--    prisma/scripts/phase5-backfill.sql after the app deploy to catch rows
--    written by the old code between migration and deploy.
-- ─────────────────────────────────────────────────────────────

INSERT INTO "invite_token_uses" ("jti", "kind", "subjectId", "usedAt")
SELECT DISTINCT ON (a."metadata"->>'jti') a."metadata"->>'jti', a."entityType", a."entityId", a."createdAt"
FROM "audit_logs" a
WHERE a."action" = 'COMPANY_ADMIN_INVITE_USED' AND a."metadata"->>'jti' IS NOT NULL
ORDER BY a."metadata"->>'jti', a."createdAt" ASC
ON CONFLICT ("jti") DO NOTHING;

UPDATE "company_admins" ca
SET "inviteStatus" = CASE latest."action" WHEN 'COMPANY_ADMIN_INVITE_SENT' THEN 'SENT' ELSE 'FAILED' END,
    "inviteStatusAt" = latest."createdAt"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "action", "createdAt"
  FROM "audit_logs"
  WHERE "entityType" = 'company_admin'
    AND "action" IN ('COMPANY_ADMIN_INVITE_SENT', 'COMPANY_ADMIN_INVITE_FAILED')
  ORDER BY "entityId", "createdAt" DESC
) latest
WHERE ca."id" = latest."entityId"
  AND (ca."inviteStatusAt" IS NULL OR ca."inviteStatusAt" < latest."createdAt");

UPDATE "demo_bookings" b
SET "reminderSentAt" = r."sentAt"
FROM (
  SELECT "entityId", MIN("createdAt") AS "sentAt"
  FROM "audit_logs"
  WHERE "entityType" = 'demo_booking' AND "action" = 'demo_booking.reminder_sent'
  GROUP BY "entityId"
) r
WHERE b."id" = r."entityId" AND b."reminderSentAt" IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. Append-only guard
--
-- Blocks UPDATE, DELETE and TRUNCATE from ordinary application workflows.
-- One UPDATE shape is allowed: setting a listed FK column to NULL, which is
-- what the existing ON DELETE SET NULL foreign keys do when a referenced
-- admin/company/merchant/employee/recovery request is deleted. Identity
-- survives in metadata.actor.
--
-- Approved maintenance (for example a signed-off archival job) must opt in
-- explicitly within its own transaction:
--     SELECT set_config('app.audit_maintenance', 'on', true);
-- This is a guard against accidental or ordinary-path modification. It is NOT
-- tamper-proof: a role that owns the table can disable triggers.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_guard_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fk text;
  old_j jsonb;
  new_j jsonb;
BEGIN
  IF current_setting('app.audit_maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit history is append-only: DELETE on % is not allowed', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  old_j := to_jsonb(OLD);
  new_j := to_jsonb(NEW);
  IF TG_NARGS > 0 THEN
    FOREACH fk IN ARRAY TG_ARGV LOOP
      IF (new_j -> fk) IS DISTINCT FROM (old_j -> fk) AND (new_j ->> fk) IS NOT NULL THEN
        RAISE EXCEPTION 'audit history is append-only: % may only be cleared on %', fk, TG_TABLE_NAME
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      old_j := old_j - fk;
      new_j := new_j - fk;
    END LOOP;
  END IF;

  IF old_j IS DISTINCT FROM new_j THEN
    RAISE EXCEPTION 'audit history is append-only: UPDATE on % is not allowed', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION audit_guard_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.audit_maintenance', true) = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'audit history is append-only: TRUNCATE on % is not allowed', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS "audit_logs_append_only" ON "audit_logs";
CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_guard_append_only('adminId', 'merchantId', 'companyId', 'companyAdminId', 'employeeId');

DROP TRIGGER IF EXISTS "audit_logs_no_truncate" ON "audit_logs";
CREATE TRIGGER "audit_logs_no_truncate"
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_guard_no_truncate();

DROP TRIGGER IF EXISTS "mfa_recovery_audit_logs_append_only" ON "mfa_recovery_audit_logs";
CREATE TRIGGER "mfa_recovery_audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "mfa_recovery_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_guard_append_only('recoveryRequestId');

DROP TRIGGER IF EXISTS "mfa_recovery_audit_logs_no_truncate" ON "mfa_recovery_audit_logs";
CREATE TRIGGER "mfa_recovery_audit_logs_no_truncate"
  BEFORE TRUNCATE ON "mfa_recovery_audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_guard_no_truncate();
