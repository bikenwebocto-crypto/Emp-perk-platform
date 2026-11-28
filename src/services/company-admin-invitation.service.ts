import { getAppUrl } from '@/lib/app-url'
import { prisma } from '@/lib/prisma'
import { getAdminClient } from '@/lib/supabase/admin'
import { emailService } from '@/lib/email/email'
import { createAuditLog, type AuditLogInput } from '@/services/audit-log.service'
import { renderCompanyAdminInvitationTemplate } from '@/emails/templates'
import { createInviteToken } from '@/lib/auth/invite-token'
import { reportAuditAlert } from '@/lib/monitoring/audit-health'

export interface CompanyAdminInvitationParams {
  /** CompanyAdmin.id — the invite outcome is recorded against this admin. */
  adminId: string
  email: string
  firstName: string
  lastName: string
  companyName: string
  companyId: string
  actorType: string
  actorId: string | null
}

export interface CompanyAdminInvitationResult {
  success: boolean
  error?: string
}

/** Audit actions that record each invite attempt (history only; state is CompanyAdmin.inviteStatus). */
export const INVITE_SENT_ACTION = 'COMPANY_ADMIN_INVITE_SENT'
export const INVITE_FAILED_ACTION = 'COMPANY_ADMIN_INVITE_FAILED'
/** Recorded when an invite link is spent. Evidence only: single-use is enforced by invite_token_uses. */
export const INVITE_USED_ACTION = 'COMPANY_ADMIN_INVITE_USED'

export type CompanyAdminInviteStatus = 'SENT' | 'FAILED'

const AUDIT_ACTOR_TYPES: AuditLogInput['actorType'][] = ['admin', 'merchant', 'company_admin', 'employee', 'system']

/**
 * Email a company admin their sign-up link and record the outcome in the
 * audit log. Never throws: callers decide what to tell the user from the
 * returned result.
 */
export async function sendCompanyAdminInvitation(
  params: CompanyAdminInvitationParams,
): Promise<CompanyAdminInvitationResult> {
  let result: CompanyAdminInvitationResult
  try {
    // Public sign-up is disabled, so the email carries a one-time set-password
    // link. sync-admin still links the Supabase user to this account by email.
    const loginUrl = `${getAppUrl()}/auth/invite?t=${encodeURIComponent(createInviteToken(params.adminId, params.email))}`
    const html = renderCompanyAdminInvitationTemplate({
      firstName: params.firstName,
      companyName: params.companyName,
      email: params.email,
      loginUrl,
    })
    const sent = await emailService.sendEmail({ to: params.email, subject: 'Welcome to Perks & More', html })
    result = sent.success
      ? { success: true }
      : { success: false, error: String(sent.error ?? 'Email provider rejected the message') }
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!result.success) {
    console.error('[COMPANY_ADMIN_INVITE] email failed', params.email, result.error)
  }

  const actorType = AUDIT_ACTOR_TYPES.includes(params.actorType as AuditLogInput['actorType'])
    ? (params.actorType as AuditLogInput['actorType'])
    : 'system'

  const status: CompanyAdminInviteStatus = result.success ? 'SENT' : 'FAILED'
  // State and evidence commit together; the column is what the app reads.
  await prisma.$transaction(async (tx) => {
    await tx.companyAdmin.updateMany({
      where: { id: params.adminId },
      data: { inviteStatus: status, inviteStatusAt: new Date() },
    })
    await createAuditLog(
      {
        actorType,
        actorId: params.actorId,
        action: result.success ? INVITE_SENT_ACTION : INVITE_FAILED_ACTION,
        entityType: 'company_admin',
        entityId: params.adminId,
        metadata: { companyId: params.companyId, email: params.email, error: result.error ?? null },
      },
      tx,
    )
  })

  if (!result.success) {
    reportAuditAlert('delivery_failed', { channel: 'email', purpose: 'company_admin_invite', adminId: params.adminId })
  }

  return result
}

/**
 * Get a fresh Supabase one-time token for the set-password form. Creates the
 * Supabase user id for an invited email, creating the user if it does not
 * exist yet. Uses generateLink (which sends no email): `invite` creates the
 * user; if it already exists, `recovery` returns it. Throws on failure.
 */
export async function ensureAuthUserId(rawEmail: string): Promise<string> {
  const email = rawEmail.trim().toLowerCase()
  const admin = getAdminClient()

  let { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email })
  if (error) {
    const exists =
      error.code === 'email_exists' || error.status === 422 || /already (been )?registered/i.test(error.message)
    if (!exists) throw new Error(error.message)
    ;({ data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email }))
    if (error) throw new Error(error.message)
  }
  const id = data?.user?.id
  if (!id) throw new Error('Supabase did not return the user')
  return id
}

/** True when this invite token (jti) was already used to set a password. */
export async function isInviteTokenUsed(kind: string, adminId: string, jti: string): Promise<boolean> {
  const used = await prisma.inviteTokenUse.findUnique({ where: { jti }, select: { kind: true, subjectId: true } })
  return !!used && used.kind === kind && used.subjectId === adminId
}

/** Latest invite outcome per admin id (admins with no recorded attempt are omitted). */
export async function getLatestInviteStatuses(
  adminIds: string[],
): Promise<Map<string, { status: CompanyAdminInviteStatus; at: Date }>> {
  const out = new Map<string, { status: CompanyAdminInviteStatus; at: Date }>()
  if (!adminIds.length) return out
  const admins = await prisma.companyAdmin.findMany({
    where: { id: { in: adminIds }, inviteStatus: { not: null }, inviteStatusAt: { not: null } },
    select: { id: true, inviteStatus: true, inviteStatusAt: true },
  })
  for (const a of admins) {
    if (a.inviteStatus !== 'SENT' && a.inviteStatus !== 'FAILED') continue
    out.set(a.id, { status: a.inviteStatus, at: a.inviteStatusAt! })
  }
  return out
}
