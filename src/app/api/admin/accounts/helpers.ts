import { NextResponse } from 'next/server'
import { getCurrentUser, type CurrentUser } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { canAccessAccounts } from '@/lib/access/account-access'

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

/**
 * System admins are managed by an active SUPER_ADMIN only. The sidebar /
 * middleware allow '/admin/accounts' by the same rule (canAccessAccounts), and
 * per-target limits live in canManageTarget / assignableRoles.
 */
export async function requireAccountAccess(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, response: apiError(401, 'UNAUTHORIZED', 'Unauthorized') }
  const active = (user.profile as { isActive?: boolean } | null)?.isActive !== false
  if (user.userType !== 'admin' || !canAccessAccounts({ adminRole: user.adminRole, isActive: active })) {
    return { ok: false, response: apiError(403, 'FORBIDDEN', 'Only super admins and admins can manage admin accounts') }
  }
  return { ok: true, user }
}

/**
 * Re-send the "set your password" email to an admin who never logged in. The
 * Supabase user already exists, so a fresh invite would fail; a recovery link
 * goes through the same SMTP setup and lands on the same web login page.
 */
export async function resendAdminInvite(email: string): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  try {
    const { error } = await getAdminClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/login?email=${encodeURIComponent(email)}`,
    })
    if (error) console.error('[ADMIN_INVITE] resend failed', email, error.message)
    return !error
  } catch (err) {
    console.error('[ADMIN_INVITE] resend failed', email, err)
    return false
  }
}
