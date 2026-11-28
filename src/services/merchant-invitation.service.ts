import { getAppUrl } from '@/lib/app-url'
import { emailService } from '@/lib/email/email'
import { createInviteToken } from '@/lib/auth/invite-token'
import { createAuditLog } from '@/services/audit-log.service'
import { firstName as firstWord, m01Welcome } from '@/emails/templates/merchant'

export const MERCHANT_INVITE_SENT_ACTION = 'MERCHANT_INVITE_SENT'
export const MERCHANT_INVITE_FAILED_ACTION = 'MERCHANT_INVITE_FAILED'

/**
 * Send the merchant's single Welcome email (M-01): login email + one
 * single-use, 72h set-password link via /auth/invite. Same flow as company
 * admins. Never throws.
 */
export async function sendMerchantInvitation(params: {
  merchantId: string
  email: string
  contactName?: string | null
  businessName: string
  actorId?: string | null
}): Promise<{ success: boolean; error?: string }> {
  let result: { success: boolean; error?: string }
  try {
    const token = createInviteToken(params.merchantId, params.email, 'merchant')
    const setPasswordUrl = `${getAppUrl()}/auth/invite?t=${encodeURIComponent(token)}`
    const { subject, html } = m01Welcome({
      firstName: firstWord(params.contactName),
      businessName: params.businessName,
      loginEmail: params.email,
      setPasswordUrl,
    })
    const sent = await emailService.sendEmail({ to: params.email, subject, html })
    result = sent.success
      ? { success: true }
      : { success: false, error: String(sent.error ?? 'Email provider rejected the message') }
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (!result.success) console.error('[MERCHANT_INVITE] email failed', params.email, result.error)

  await createAuditLog({
    actorType: params.actorId ? 'admin' : 'system',
    actorId: params.actorId ?? null,
    action: result.success ? MERCHANT_INVITE_SENT_ACTION : MERCHANT_INVITE_FAILED_ACTION,
    entityType: 'merchant',
    entityId: params.merchantId,
    metadata: { email: params.email, error: result.error ?? null },
  })

  return result
}
