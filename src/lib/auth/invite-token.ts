import { createHmac, randomUUID, timingSafeEqual } from 'crypto'

/**
 * Supabase caps email-link (OTP) expiry at 24h, so invite emails carry our own
 * signed token instead. /auth/invite checks it and only then asks Supabase for
 * a fresh one-time link, so the invite itself is valid for INVITE_TTL_HOURS.
 */
export const INVITE_TTL_HOURS = 72

export type InviteKind = 'company_admin' | 'merchant'

export interface InviteTokenPayload {
  /** Id of the invited profile (CompanyAdmin.id or Merchant.id). */
  adminId: string
  /** Who the invite is for. Missing on older tokens, which were company admins. */
  kind?: InviteKind
  email: string
  /** Expiry, unix seconds. */
  exp: number
  /** Unique id; recorded on use so the link works once. */
  jti: string
}

function secret(): string {
  const s = process.env.INVITE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('INVITE_TOKEN_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not set')
  return s
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url')
}

export function createInviteToken(adminId: string, email: string, kind: InviteKind = 'company_admin'): string {
  const payload: InviteTokenPayload = {
    adminId,
    kind,
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + INVITE_TTL_HOURS * 3600,
    jti: randomUUID(),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

/** Returns the payload, or null when the token is malformed, tampered with or expired. */
export function verifyInviteToken(token: string): InviteTokenPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as InviteTokenPayload
    if (!payload.email || !payload.adminId || !payload.jti) return null
    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
