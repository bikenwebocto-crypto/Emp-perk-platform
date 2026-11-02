/**
 * Guard shared by every route that changes an employee's status.
 *
 * When an employee is promoted to Company Admin their Account is switched to
 * COMPANY_ADMIN and the Employee row is kept as INACTIVE history. Changing
 * that row's status (or the account's status) from an employee route would
 * either hand mobile access back to an admin or lock them out of the web
 * dashboard, so these routes refuse — the person is managed from the
 * Administrators list instead (disable / revert to employee).
 */

export const PROMOTED_EMPLOYEE_MESSAGE =
  'This user was promoted to Company Admin and cannot be reactivated as an employee. Manage them from Administrators.'

export const PROMOTED_SKIP_REASON = 'PROMOTED_TO_COMPANY_ADMIN' as const

/** True when the employee's login account is no longer an employee account. */
export function isPromotedAccount(
  account: { role?: string | null } | null | undefined,
): boolean {
  return !!account?.role && account.role !== 'EMPLOYEE'
}
