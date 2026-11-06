import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import { OTP_LENGTH } from './constants'

// Recovery OTPs are stored only as HMAC-SHA256(secret, requestId:code). Binding
// the request id means a hash copied to another request never matches, and the
// server-side secret means a leaked table cannot be brute-forced offline
// (a 6-digit space is otherwise trivial to enumerate).

function otpSecret(): string {
  const secret = process.env.MFA_RECOVERY_OTP_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('MFA_RECOVERY_OTP_SECRET must be set (at least 32 characters)')
  }
  return secret
}

export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0')
}

export function hashOtp(recoveryRequestId: string, code: string): string {
  return createHmac('sha256', otpSecret()).update(`${recoveryRequestId}:${code}`).digest('hex')
}

export function otpMatches(recoveryRequestId: string, code: string, storedHash: string): boolean {
  if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) return false
  const candidate = Buffer.from(hashOtp(recoveryRequestId, code), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}
