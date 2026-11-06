import type { MfaRecoveryStatus, MfaRecoveryType } from '@prisma/client'

// Pure data + functions, no server imports.

export const OTP_LENGTH = 6
export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5
/** Minimum gap between two OTP emails for one request. */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000
/** OTP emails one request may ever trigger (first send + resends). */
export const OTP_MAX_SENDS = 5
/** Per-account verify calls across all requests, on top of per-OTP attempts. */
export const OTP_VERIFY_RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 }
/** Per-account request creation. */
export const REQUEST_RATE_LIMIT = { limit: 5, windowMs: 24 * 60 * 60 * 1000 }

/** An open request that is not approved within this window becomes EXPIRED. */
export const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Approver changes need a TOTP verification this recent (AMR timestamp). */
export const FRESH_MFA_WINDOW_MS = 5 * 60 * 1000

export const MIN_REASON_LENGTH = 10
export const MAX_REASON_LENGTH = 1000
export const MIN_REJECTION_REASON_LENGTH = 5

/** Account roles that may use recovery at all. EMPLOYEE has no MFA. */
export const STANDARD_RECOVERY_ROLES = ['MERCHANT', 'COMPANY_ADMIN'] as const
export const EMERGENCY_RECOVERY_ROLES = ['SUPER_ADMIN'] as const

/** AdminUser.role values allowed to review / approve STANDARD requests. */
export const STANDARD_REVIEWER_ADMIN_ROLES = ['SUPER_ADMIN'] as const

/** AdminUser.role values that may be designated as a recovery approver. */
export const APPROVER_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const

/** Statuses in which a request still holds the account's activeKey. */
export const OPEN_STATUSES: readonly MfaRecoveryStatus[] = [
  'PENDING',
  'UNDER_REVIEW',
  'OTP_SENT',
  'OTP_VERIFIED',
  'APPROVED',
  'MFA_RESET',
  'AWAITING_NEW_MFA',
]

export const TERMINAL_STATUSES: readonly MfaRecoveryStatus[] = ['COMPLETED', 'REJECTED', 'EXPIRED', 'FAILED']

/** Open statuses that time out after REQUEST_TTL_MS (nothing irreversible done yet). */
export const EXPIRABLE_STATUSES: readonly MfaRecoveryStatus[] = ['PENDING', 'UNDER_REVIEW', 'OTP_SENT', 'OTP_VERIFIED']

/** Statuses a request can still be rejected from (before MFA is touched). */
export const REJECTABLE_STATUSES: readonly MfaRecoveryStatus[] = EXPIRABLE_STATUSES

/**
 * Allowed transitions per recovery type. Emergency requests skip admin review:
 * the OTP is emailed when the request is created.
 */
const COMMON_TAIL: Partial<Record<MfaRecoveryStatus, MfaRecoveryStatus[]>> = {
  OTP_VERIFIED: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: ['MFA_RESET', 'FAILED'],
  MFA_RESET: ['AWAITING_NEW_MFA'],
  AWAITING_NEW_MFA: ['COMPLETED'],
}

export const TRANSITIONS: Record<MfaRecoveryType, Partial<Record<MfaRecoveryStatus, MfaRecoveryStatus[]>>> = {
  STANDARD: {
    PENDING: ['UNDER_REVIEW', 'OTP_SENT', 'REJECTED', 'EXPIRED'],
    UNDER_REVIEW: ['OTP_SENT', 'REJECTED', 'EXPIRED'],
    OTP_SENT: ['OTP_SENT', 'OTP_VERIFIED', 'REJECTED', 'EXPIRED'],
    ...COMMON_TAIL,
  },
  SUPER_ADMIN_EMERGENCY: {
    PENDING: ['OTP_SENT', 'REJECTED', 'EXPIRED'],
    OTP_SENT: ['OTP_SENT', 'OTP_VERIFIED', 'REJECTED', 'EXPIRED'],
    ...COMMON_TAIL,
  },
}

export function canTransition(type: MfaRecoveryType, from: MfaRecoveryStatus, to: MfaRecoveryStatus): boolean {
  return TRANSITIONS[type][from]?.includes(to) ?? false
}

export function isOpenStatus(status: MfaRecoveryStatus): boolean {
  return OPEN_STATUSES.includes(status)
}

export function recoveryTypeForRole(role: string): MfaRecoveryType | null {
  if ((STANDARD_RECOVERY_ROLES as readonly string[]).includes(role)) return 'STANDARD'
  if ((EMERGENCY_RECOVERY_ROLES as readonly string[]).includes(role)) return 'SUPER_ADMIN_EMERGENCY'
  return null
}

export function isStandardReviewer(adminRole: string | null | undefined): boolean {
  return (STANDARD_REVIEWER_ADMIN_ROLES as readonly string[]).includes(adminRole ?? '')
}
