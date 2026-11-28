-- Phase 5 post-deploy catch-up backfill. Idempotent and read-only on audit_logs.
-- Run once after the new application version is live, to pick up audit rows the
-- previous version wrote between the migration and the deploy. Safe to re-run.

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
