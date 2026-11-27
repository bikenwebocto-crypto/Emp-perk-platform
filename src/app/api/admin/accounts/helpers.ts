import { getAppUrl } from '@/lib/app-url'
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

type SuperAdminDb = Pick<typeof import('@/lib/prisma').prisma, 'adminUser' | 'account'>

/**
 * Number of active SUPER_ADMINs (active AdminUser + ACTIVE Account), optionally
 * excluding one AdminUser.id. The system allows exactly one super admin.
 */
export async function countActiveSuperAdmins(db: SuperAdminDb, excludeAdminId?: string): Promise<number> {
  const supers = await db.adminUser.findMany({
    where: {
      role: 'SUPER_ADMIN',
      isActive: true,
      accountId: { not: null },
      ...(excludeAdminId && { id: { not: excludeAdminId } }),
    },
    select: { accountId: true },
  })
  if (supers.length === 0) return 0
  return db.account.count({
    where: { authUserId: { in: supers.map((a) => a.accountId!) }, status: 'ACTIVE' },
  })
}

type TransferDb = Pick<typeof import('@/lib/prisma').prisma, 'adminUser' | 'loginSession'>

/**
 * Super admin transfer: there is exactly one super admin, so when another
 * admin becomes SUPER_ADMIN every other super admin (normally the actor) is
 * demoted to ADMIN and their login sessions are ended. Returns the demoted
 * Account ids so the caller can sign them out of Supabase after commit.
 */
export async function demoteOtherSuperAdmins(db: TransferDb, keepAdminId: string): Promise<string[]> {
  const others = await db.adminUser.findMany({
    where: { role: 'SUPER_ADMIN', id: { not: keepAdminId } },
    select: { id: true, accountId: true },
  })
  if (others.length === 0) return []
  const ids = others.map((o) => o.id)
  await db.adminUser.updateMany({ where: { id: { in: ids } }, data: { role: 'ADMIN' } })
  await db.loginSession.updateMany({ where: { adminId: { in: ids }, isActive: true }, data: { isActive: false } })
  return others.map((o) => o.accountId).filter((a): a is string => !!a)
}

/** End Supabase sessions (all devices) for these auth users; best effort. */
export async function signOutAuthUsers(authUserIds: string[]) {
  for (const id of authUserIds) {
    try {
      await getAdminClient().auth.admin.signOut(id)
    } catch (e) {
      console.error('[ADMIN_ACCOUNTS] signOut failed', id, e)
    }
  }
}

/**
 * Re-send the "set your password" email to an admin who never logged in. The
 * Supabase user already exists, so a fresh invite would fail; a recovery link
 * goes through the same SMTP setup and lands on the same web login page.
 */
export async function resendAdminInvite(email: string): Promise<boolean> {
  const appUrl = getAppUrl()
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
