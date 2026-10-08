import { getAdminClient } from '@/lib/supabase/admin'

// Employees log in through Supabase Auth, so every employee needs a Supabase
// user whose id is stored as accounts.authUserId. The invite both creates
// that user and emails a link to set a password; the link lands on
// /login?email=… which shows the set-password view and pre-fills the email
// for later sign-ins.
//
// Callers invite FIRST, then create the DB rows with the returned id, and
// call rollbackAuthUser() if the DB write fails.

export type InviteErrorCode = 'EMAIL_EXISTS' | 'INVITE_FAILED'

export type InviteResult =
  | { ok: true; authUserId: string }
  | { ok: false; code: InviteErrorCode; message: string }

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** HTTP status for an invite failure: 409 for an existing user, 502 otherwise. */
export function inviteErrorStatus(code: InviteErrorCode): 409 | 502 {
  return code === 'EMAIL_EXISTS' ? 409 : 502
}
export type InviteRole = 'EMPLOYEE' | 'MERCHANT' | 'COMPANY_ADMIN'
export async function inviteAuthUser(
  email: string,
  meta: { role: InviteRole; firstName?: string | null; companyName?: string | null; merchantName?: string | null },
): Promise<InviteResult> {
  const normalized = normalizeEmail(email)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  try {
    const { data, error } = await getAdminClient().auth.admin.inviteUserByEmail(normalized, {
      redirectTo: `${appUrl}/login?email=${encodeURIComponent(normalized)}`,
      data: {
        role: meta.role,
        first_name: meta.firstName ?? '',
        company_name: meta.companyName ?? '',
        merchant_name: meta.merchantName ?? '',
      },
    })
    if (error || !data?.user?.id) {
      const exists =
        error?.code === 'email_exists' ||
        error?.status === 422 ||
        /already (been )?registered/i.test(error?.message ?? '')
      console.error('[EMPLOYEE_INVITE] invite failed', normalized, error?.code, error?.message)
      return exists
        ? { ok: false, code: 'EMAIL_EXISTS', message: 'A user with this email already exists' }
        : { ok: false, code: 'INVITE_FAILED', message: 'Could not send the invitation email. Please try again.' }
    }
    return { ok: true, authUserId: data.user.id }
  } catch (err) {
    console.error('[EMPLOYEE_INVITE] invite failed', normalized, err)
    return { ok: false, code: 'INVITE_FAILED', message: 'Could not send the invitation email. Please try again.' }
  }
}

/** Delete the Supabase user created by inviteAuthUser (DB write failed). Never throws. */
export async function rollbackAuthUser(authUserId: string): Promise<void> {
  try {
    const { error } = await getAdminClient().auth.admin.deleteUser(authUserId)
    if (error) console.error('[EMPLOYEE_INVITE] rollback deleteUser failed', authUserId, error.message)
  } catch (err) {
    console.error('[EMPLOYEE_INVITE] rollback deleteUser failed', authUserId, err)
  }
}
