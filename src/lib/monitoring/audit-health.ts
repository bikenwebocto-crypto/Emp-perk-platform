import { prisma } from '@/lib/prisma'

/**
 * Audit / background-job health signals.
 *
 * Alerts are emitted as single-line JSON on stderr tagged `"tag":"audit_alert"`
 * so any log drain (Vercel, Supabase, Datadog, CloudWatch) can alert on them
 * without new infrastructure. `getAuditHealth()` gives a point-in-time DB view
 * for the /api/cron/audit-health probe.
 */

export type AuditAlertKind =
  | 'audit_insert_failed'
  | 'mfa_audit_insert_failed'
  | 'delivery_failed'
  | 'queue_backlog'
  | 'integrity_check_failed'

const counters = new Map<AuditAlertKind, number>()

export function reportAuditAlert(kind: AuditAlertKind, details: Record<string, unknown> = {}): void {
  counters.set(kind, (counters.get(kind) ?? 0) + 1)
  try {
    console.error(JSON.stringify({ tag: 'audit_alert', kind, at: new Date().toISOString(), ...details }))
  } catch {
    console.error('[audit_alert]', kind)
  }
}

/** Per-process counters since boot (resets on restart/cold start). */
export function getAuditAlertCounters(): Record<string, number> {
  return Object.fromEntries(counters)
}

/** Thresholds; overridable via env so ops can tune without a deploy of code. */
function threshold(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const EXPECTED_TRIGGERS = [
  { table: 'audit_logs', trigger: 'audit_logs_append_only' },
  { table: 'audit_logs', trigger: 'audit_logs_no_truncate' },
  { table: 'mfa_recovery_audit_logs', trigger: 'mfa_recovery_audit_logs_append_only' },
  { table: 'mfa_recovery_audit_logs', trigger: 'mfa_recovery_audit_logs_no_truncate' },
] as const

export interface AuditHealth {
  ok: boolean
  checks: {
    appendOnlyTriggers: { ok: boolean; missingOrDisabled: string[] }
    queueBacklog: { ok: boolean; stuckInProgress: number; failedLast24h: number }
    deliveryFailures: { ok: boolean; failedLast24h: number }
    auditWrites: { ok: boolean; lastAuditAt: string | null }
  }
  processCounters: Record<string, number>
}

export async function getAuditHealth(): Promise<AuditHealth> {
  const now = Date.now()
  const day = new Date(now - 24 * 60 * 60 * 1000)
  const stuckBefore = new Date(now - threshold('AUDIT_HEALTH_STUCK_MINUTES', 30) * 60 * 1000)

  // 1. Integrity: the append-only triggers exist and are enabled ('O' = origin/enabled).
  const triggerRows = await prisma.$queryRaw<{ table: string; trigger: string; enabled: string }[]>`
    SELECT c.relname AS "table", t.tgname AS "trigger", t.tgenabled::text AS "enabled"
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal AND c.relname IN ('audit_logs', 'mfa_recovery_audit_logs')`
  const missingOrDisabled = EXPECTED_TRIGGERS.filter(
    (e) => !triggerRows.some((r) => r.table === e.table && r.trigger === e.trigger && r.enabled === 'O'),
  ).map((e) => `${e.table}.${e.trigger}`)

  // 2. Queue: items the worker started but never finished, and recent failures.
  const [stuckInProgress, failedLast24h, deliveryFailed, lastAudit] = await Promise.all([
    prisma.actionQueueItem.count({ where: { status: 'IN_PROGRESS', updatedAt: { lt: stuckBefore } } }),
    prisma.actionQueueItem.count({ where: { status: 'FAILED', updatedAt: { gte: day } } }),
    prisma.notificationDelivery.count({ where: { status: 'FAILED', createdAt: { gte: day } } }),
    prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ])

  const maxQueueFailures = threshold('AUDIT_HEALTH_MAX_QUEUE_FAILURES_24H', 10)
  const maxDeliveryFailures = threshold('AUDIT_HEALTH_MAX_DELIVERY_FAILURES_24H', 50)
  const maxSilenceHours = threshold('AUDIT_HEALTH_MAX_SILENCE_HOURS', 24)

  const checks: AuditHealth['checks'] = {
    appendOnlyTriggers: { ok: missingOrDisabled.length === 0, missingOrDisabled },
    queueBacklog: {
      ok: stuckInProgress === 0 && failedLast24h <= maxQueueFailures,
      stuckInProgress,
      failedLast24h,
    },
    deliveryFailures: { ok: deliveryFailed <= maxDeliveryFailures, failedLast24h: deliveryFailed },
    auditWrites: {
      // A platform in use writes audit rows continuously; long silence means writes are failing.
      ok: !!lastAudit && now - lastAudit.createdAt.getTime() <= maxSilenceHours * 60 * 60 * 1000,
      lastAuditAt: lastAudit?.createdAt.toISOString() ?? null,
    },
  }

  if (!checks.appendOnlyTriggers.ok) reportAuditAlert('integrity_check_failed', { missingOrDisabled })
  if (!checks.queueBacklog.ok) reportAuditAlert('queue_backlog', { stuckInProgress, failedLast24h })
  if (!checks.deliveryFailures.ok) reportAuditAlert('delivery_failed', { failedLast24h: deliveryFailed })
  if (!checks.auditWrites.ok) reportAuditAlert('audit_insert_failed', { reason: 'no_recent_rows', lastAuditAt: checks.auditWrites.lastAuditAt })

  return {
    ok: Object.values(checks).every((c) => c.ok),
    checks,
    processCounters: getAuditAlertCounters(),
  }
}
