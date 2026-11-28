import { createAuditLog } from '@/services/audit-log.service'
import { NotificationService } from '@/services/notification.service'
import { getCurrentUser } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { forbidden } from '@/lib/api-auth'
import {
  BILLING_AUDIT_ACTIONS,
  BILLING_AUDIT_ENTITIES,
  isValidBillingTransition,
  type BillingAuditAction,
} from './audit-events'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 },
  )
}

/**
 * Authenticated admin with an AdminUser profile. Optionally restricted to a set
 * of AdminUser roles. An admin without a profile id is rejected so audit rows
 * always name the real actor (never the Supabase auth id, never `system`).
 */
export async function requireAdmin(allowedRoles?: readonly string[]): Promise<
  | { ok: true; profileId: string; userId: string; adminRole: string | null }
  | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, response: unauthorized() }
  if (user.userType !== 'admin') return { ok: false, response: forbidden(user.userType) }
  if (!user.profileId) return { ok: false, response: forbidden(user.userType) }
  const adminRole = user.adminRole ?? null
  if (allowedRoles && !allowedRoles.includes(adminRole ?? '')) {
    return { ok: false, response: forbidden(user.userType) }
  }
  return { ok: true, profileId: user.profileId, userId: user.id, adminRole }
}

export async function writeBillingAudit(opts: {
  action: BillingAuditAction
  companyId: string
  profileId: string | null
  fromStatus?: string
  toStatus?: string
  reason?: string
  metadata?: Record<string, unknown>
  /** Transaction client, when the audited change is part of a $transaction. */
  tx?: Parameters<typeof createAuditLog>[1]
}) {
  await createAuditLog(
    {
      actorType: 'admin',
      actorId: opts.profileId,
      companyId: opts.companyId,
      action: opts.action,
      entityType: BILLING_AUDIT_ENTITIES.COMPANY,
      entityId: opts.companyId,
      changes: {
        from: opts.fromStatus ?? null,
        to: opts.toStatus ?? null,
        reason: opts.reason ?? null,
        ...(opts.metadata ?? {}),
      },
    },
    opts.tx,
  )
}

export async function writeBillingNotification(opts: {
  companyId: string
  adminId: string | null
  title: string
  body: string
  referenceType?: string
  referenceId?: string
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
}) {
  if (!opts.adminId) return

  await NotificationService.publishToCompanyAdmins(opts.companyId, {
    type: 'BILLING_DUE',
    title: opts.title,
    message: opts.body,
    priority: opts.priority ?? 'NORMAL',
    channels: ['IN_APP', 'EMAIL'],
    referenceType: opts.referenceType ?? 'company_billing',
    referenceId: opts.referenceId ?? opts.companyId,
  })
}

export { BILLING_AUDIT_ACTIONS, isValidBillingTransition }
