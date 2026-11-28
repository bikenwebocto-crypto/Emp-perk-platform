export const COMPANY_ACCESS_PENDING_MESSAGE =
  'Your account is set up. Your dashboard opens once payment is confirmed.'

const PENDING_COMPANY_STATUSES = ['PENDING', 'APPROVED_PENDING_PAYMENT'] as const

export function isCompanyAccessPending(status: string | null | undefined): boolean {
  return (PENDING_COMPANY_STATUSES as readonly string[]).includes(status ?? '')
}

export function canActivatePendingCompany(
  status: string | null | undefined,
  adminRole: string | null | undefined,
): boolean {
  if (status === 'PENDING') return false
  return status !== 'APPROVED_PENDING_PAYMENT' || adminRole === 'SUPER_ADMIN'
}
