import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email'
import { createAuditLog, type AuditLogInput } from '@/services/audit-log.service'
import { renderCompanyAdminInvitationTemplate } from '@/emails/templates'

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

/** Audit actions that record each invite attempt. The latest one is the admin's invite status. */
export const INVITE_SENT_ACTION = 'COMPANY_ADMIN_INVITE_SENT'
export const INVITE_FAILED_ACTION = 'COMPANY_ADMIN_INVITE_FAILED'

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
  // Company admins have no Supabase auth user yet, so the email links to the
  // sign-up form (pre-filled with their email). sync-admin links the new
  // Supabase user to this account by email on first sign-in.
  const signupPath = `/login?mode=signup&email=${encodeURIComponent(params.email)}`
  const loginUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}${signupPath}`
    : signupPath

  let result: CompanyAdminInvitationResult
  try {
    const html = renderCompanyAdminInvitationTemplate({
      firstName: params.firstName,
      companyName: params.companyName,
      email: params.email,
      loginUrl,
    })
    const sent = await emailService.sendEmail({ to: params.email, subject: 'Welcome to the Platform', html })
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

  await createAuditLog({
    actorType,
    actorId: params.actorId,
    action: result.success ? INVITE_SENT_ACTION : INVITE_FAILED_ACTION,
    entityType: 'company_admin',
    entityId: params.adminId,
    metadata: { companyId: params.companyId, email: params.email, error: result.error ?? null },
  })

  return result
}

/** Latest invite outcome per admin id (admins with no recorded attempt are omitted). */
export async function getLatestInviteStatuses(
  adminIds: string[],
): Promise<Map<string, { status: CompanyAdminInviteStatus; at: Date }>> {
  const out = new Map<string, { status: CompanyAdminInviteStatus; at: Date }>()
  if (!adminIds.length) return out
  const logs = await prisma.auditLog.findMany({
    where: {
      entityType: 'company_admin',
      entityId: { in: adminIds },
      action: { in: [INVITE_SENT_ACTION, INVITE_FAILED_ACTION] },
    },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, action: true, createdAt: true },
  })
  for (const log of logs) {
    if (!log.entityId || out.has(log.entityId)) continue
    out.set(log.entityId, {
      status: log.action === INVITE_SENT_ACTION ? 'SENT' : 'FAILED',
      at: log.createdAt,
    })
  }
  return out
}
