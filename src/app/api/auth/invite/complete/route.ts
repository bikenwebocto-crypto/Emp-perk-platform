import { clientIpFromRequest } from '@/lib/rate-limit'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getAdminClient } from '@/lib/supabase/admin'
import { verifyInviteToken } from '@/lib/auth/invite-token'
import { getPasswordError } from '@/lib/validation/credentials'
import { buildAuditDataWithContext } from '@/services/audit-log.service'
import { ensureAuthUserId, INVITE_USED_ACTION } from '@/services/company-admin-invitation.service'

// Sets the first password from an invite link and spends the link (single
// use). The link is consumed here, not when it is opened, so a scanner or an
// abandoned tab cannot use it up. Concurrent submits of the same link are
// serialised with a transaction-scoped advisory lock on the token id.

const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_ATTEMPTS) return false
  entry.count += 1
  return true
}

const bodySchema = z.object({
  t: z.string().min(1).max(4096),
  password: z.string().min(1).max(128),
})

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

class LinkUsedError extends Error {}

export async function POST(request: NextRequest) {
  const ip =
    clientIpFromRequest(request)
  if (!checkRateLimit(ip)) return fail(429, 'RATE_LIMITED', 'Too many attempts. Please try again later.')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(400, 'VALIDATION', 'Invalid request body')
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return fail(400, 'VALIDATION', 'Invalid request body')

  const payload = verifyInviteToken(parsed.data.t)
  if (!payload) return fail(400, 'LINK_INVALID', 'This link is invalid or has expired.')

  const passwordError = getPasswordError(parsed.data.password)
  if (passwordError) return fail(400, 'VALIDATION', passwordError)

  const kind = payload.kind ?? 'company_admin'

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payload.jti}))`
        // Single-use is enforced by the invite_token_uses primary key, not by
        // the audit log. A concurrent or repeated submit inserts 0 rows.
        const claimed = await tx.inviteTokenUse.createMany({
          data: [{ jti: payload.jti, kind, subjectId: payload.adminId }],
          skipDuplicates: true,
        })
        if (claimed.count === 0) throw new LinkUsedError()

        // Evidence only; never read back to decide whether the link is spent.
        await tx.auditLog.create({
          data: await buildAuditDataWithContext({
            actorType: 'system',
            action: INVITE_USED_ACTION,
            entityType: kind,
            entityId: payload.adminId,
            metadata: { jti: payload.jti, email: payload.email },
          }),
        })

        // Last step: if Supabase fails the transaction rolls back and the
        // link stays valid.
        const userId = await ensureAuthUserId(payload.email)
        const { error } = await getAdminClient().auth.admin.updateUserById(userId, {
          password: parsed.data.password,
          email_confirm: true,
        })
        if (error) throw new Error(error.message)
      },
      { timeout: 20_000 },
    )
  } catch (err) {
    if (err instanceof LinkUsedError) return fail(409, 'LINK_USED', 'This link has already been used.')
    console.error('[INVITE_COMPLETE] failed', err instanceof Error ? err.message : err)
    return fail(502, 'SET_PASSWORD_FAILED', 'Could not set your password. Please try again.')
  }

  return NextResponse.json({ success: true, data: { email: payload.email } })
}
