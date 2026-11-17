import { emailService } from '@/lib/email/email'
import { createAuditLog } from '@/services/audit-log.service'
import { renderCompanyAdminInvitationTemplate } from '@/emails/templates'

export interface CompanyAdminInvitationParams {
  email: string
  firstName: string
  lastName: string
  companyName: string
  companyId: string
  actorType: string
  actorId: string | null
}

export async function sendCompanyAdminInvitation(
  params: CompanyAdminInvitationParams,
): Promise<void> {
  console.log('[COMPANY_ADMIN_EMAIL][SERVICE] Entered', {
    email: params.email,
    companyId: params.companyId,
    companyName: params.companyName,
    firstName: params.firstName,
  })

  // Company admins have no Supabase auth user yet, so the email links to the
  // sign-up form (pre-filled with their email). sync-admin links the new
  // Supabase user to this account by email on first sign-in.
  const signupPath = `/login?mode=signup&email=${encodeURIComponent(params.email)}`
  const loginUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}${signupPath}`
    : signupPath

  console.log('[COMPANY_ADMIN_EMAIL][SERVICE] Login URL', { loginUrl })

  const html = renderCompanyAdminInvitationTemplate({
    firstName: params.firstName,
    companyName: params.companyName,
    email: params.email,
    loginUrl,
  })

  console.log('[COMPANY_ADMIN_EMAIL][SERVICE] Template rendered', {
    htmlLength: html.length,
  })

  console.log('[COMPANY_ADMIN_EMAIL][SERVICE] Calling emailService.sendEmail', {
    to: params.email,
    subject: 'Welcome to the Platform',
  })

  const result = await emailService.sendEmail({
    to: params.email,
    subject: 'Welcome to the Platform',
    html,
  })

  console.log('[COMPANY_ADMIN_EMAIL][SERVICE] emailService response', {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  })

  if (result.success) {
    console.log('[COMPANY_ADMIN_EMAIL][SERVICE] Email sent, creating audit log (SENT)')
   
  } else {
    console.error('[COMPANY_ADMIN_EMAIL][SERVICE] Email failed, creating audit log (FAILED)', {
      error: result.error,
    })
    console.log('[COMPANY_ADMIN_EMAIL][SERVICE] Audit log created (FAILED)')
  }

  console.log('[COMPANY_ADMIN_EMAIL][SERVICE] Complete')
}
