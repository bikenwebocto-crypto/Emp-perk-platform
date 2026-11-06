import { emailService } from '@/lib/email/email'
import { OTP_TTL_MS } from './constants'

// Recovery emails. The OTP is only ever placed in sendRecoveryOtp, which is
// only ever addressed to the account's registered email. Approvers and
// reviewers get status notices without codes.

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function appUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${path}`
}

function layout(title: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
<h2 style="font-size:20px">${esc(title)}</h2>${body}
<p style="color:#64748b;font-size:12px;margin-top:24px">Perks &amp; More security. If you did not expect this email, contact support immediately.</p>
</div>`
}

async function send(to: string | string[], subject: string, html: string): Promise<boolean> {
  if (Array.isArray(to) && to.length === 0) return true
  const result = await emailService.sendEmail({ to, subject, html })
  if (!result.success) console.error('[MFA_RECOVERY] email failed', subject, result.error)
  return result.success
}

export function sendRequestReceived(to: string, emergency: boolean) {
  const next = emergency
    ? 'We have emailed you a one-time code. Enter it on the recovery page, then your designated recovery approver must approve the request.'
    : 'A Super Admin will review your request and may call your registered phone number. You will then receive a one-time code by email.'
  return send(to, 'Authenticator recovery request received', layout(
    'We received your authenticator recovery request',
    `<p>${next}</p><p>Your authenticator stays active until the request is approved.</p>`,
  ))
}

export function sendRecoveryOtp(to: string, code: string, isResend: boolean) {
  const minutes = Math.round(OTP_TTL_MS / 60000)
  return send(to, isResend ? 'Your new authenticator recovery code' : 'Your authenticator recovery code', layout(
    'Authenticator recovery code',
    `<p>Enter this code on the recovery page:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:bold">${esc(code)}</p>
<p>It expires in ${minutes} minutes and can be used once. Never share this code with anyone, including Perks &amp; More staff or administrators.</p>
<p><a href="${esc(appUrl('/mfa/recovery'))}">Open the recovery page</a></p>`,
  ))
}

export function sendStandardRequestToReviewers(to: string[], requesterName: string, role: string) {
  return send(to, 'New authenticator recovery request', layout(
    'New authenticator recovery request',
    `<p>${esc(requesterName)} (${esc(role)}) asked to recover access to their authenticator.</p>
<p>Review it in the admin console. Verify the person by phone before sending the email code.</p>`,
  ))
}

export function sendApproverNotified(to: string, requesterName: string) {
  return send(to, 'Action needed: emergency authenticator recovery', layout(
    'Emergency authenticator recovery awaiting your approval',
    `<p>${esc(requesterName)} lost access to their authenticator and has verified their registered email.</p>
<p>You are their designated recovery approver. Sign in with your own account and MFA, confirm the request with them through a trusted channel, then approve or reject it.</p>`,
  ))
}

export function sendRequestDecision(to: string, approved: boolean, reason?: string | null) {
  return approved
    ? send(to, 'Authenticator recovery approved', layout(
      'Your authenticator recovery was approved',
      `<p>Your old authenticator has been removed and you have been signed out everywhere.</p>
<p>Sign in with your email and password, then scan the new QR code with Google Authenticator or Microsoft Authenticator.</p>
<p><a href="${esc(appUrl('/login'))}">Sign in</a></p>`,
    ))
    : send(to, 'Authenticator recovery rejected', layout(
      'Your authenticator recovery was rejected',
      `<p>Reason: ${esc(reason ?? 'Not provided')}</p><p>Your existing authenticator is unchanged. Contact support if you need help.</p>`,
    ))
}

export function sendRecoveryCompleted(to: string) {
  return send(to, 'New authenticator registered', layout(
    'New authenticator registered',
    '<p>A new authenticator app was registered on your account, completing your recovery request.</p>',
  ))
}

export function sendApproverAssignmentNotice(params: {
  ownerEmail: string
  ownerName: string
  newApproverEmail: string
  newApproverName: string
  previousApproverEmail: string | null
}) {
  const { ownerEmail, ownerName, newApproverEmail, newApproverName, previousApproverEmail } = params
  return Promise.all([
    send(ownerEmail, 'Your MFA recovery approver changed', layout(
      'Recovery approver updated',
      `<p>${esc(newApproverName)} is now your designated MFA recovery approver.</p>`,
    )),
    send(newApproverEmail, 'You are now an MFA recovery approver', layout(
      'You were designated as a recovery approver',
      `<p>${esc(ownerName)} designated you to approve their emergency authenticator recovery. You can only approve requests they submit and verify by email; you never see their codes or password.</p>`,
    )),
    previousApproverEmail
      ? send(previousApproverEmail, 'You are no longer an MFA recovery approver', layout(
        'Recovery approver role removed',
        `<p>You are no longer the recovery approver for ${esc(ownerName)}.</p>`,
      ))
      : Promise.resolve(true),
  ])
}
