// Voucher verification types and error codes

export type VoucherVerificationErrorCode =
  | 'VOUCHER_NOT_FOUND'
  | 'VOUCHER_INACTIVE'
  | 'VOUCHER_EXPIRED'
  | 'VOUCHER_NOT_STARTED'
  | 'VOUCHER_USAGE_LIMIT_REACHED'
  | 'USER_NOT_ELIGIBLE'
  | 'COMPANY_NOT_ELIGIBLE'
  | 'MERCHANT_NOT_ELIGIBLE'
  | 'ALREADY_REDEEMED'
  | 'SUSPICIOUS_ACTIVITY'
  | 'BRUTE_FORCE_ATTEMPT'
  | 'CODE_ENUMERATION_DETECTED'
  | 'INVALID_COMPANY_ACCESS'
  | 'RATE_LIMIT_EXCEEDED'
  | 'OFFER_REFERENCE_MISSING'
  | 'MERCHANT_ACCESS_DENIED'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'

export type FraudFlagType =
  | 'DUPLICATE_ATTEMPT'
  | 'RAPID_ATTEMPTS'
  | 'MULTIPLE_FAILED_CODES'
  | 'BRUTE_FORCE_ATTEMPT'
  | 'CODE_ENUMERATION'
  | 'EXCESSIVE_IP_REQUESTS'
  | 'SUSPICIOUS_DEVICE'
  | 'CROSS_COMPANY_ABUSE'

export interface VoucherVerificationRequest {
  code: string
  userId: string
  merchantId?: string
  companyId?: string
  ipAddress?: string
  deviceId?: string
  userAgent?: string
  /** Authenticated caller performing the verification (audit actor). */
  actorType?: 'admin' | 'merchant' | 'company_admin' | 'employee'
  /** Internal profile id of the caller (never the Supabase auth id). */
  actorProfileId?: string
}

export interface VoucherVerificationResponse {
  success: boolean
  valid: boolean
  voucher?: {
    id: string
    title: string
    merchant: string
    merchantId: string
    discountValue: number
    discountType: string
    expiresAt: string | null
  }
  error?: {
    code: VoucherVerificationErrorCode
    message: string
  }
  fraudFlags?: FraudFlagType[]
}

export interface VerificationAttempt {
  id: string
  code: string
  userId: string
  merchantId?: string
  companyId?: string
  ipAddress?: string
  deviceId?: string
  result: 'SUCCESS' | 'FAILED' | 'FRAUD_DETECTED'
  errorCode?: VoucherVerificationErrorCode
  fraudFlags?: FraudFlagType[]
  timestamp: Date
}

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

export interface FraudDetectionResult {
  isFraudulent: boolean
  flags: FraudFlagType[]
  riskScore: number // 0-100
  reason?: string
}
