import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { listTotpFactors } from '@/lib/mfa-recovery/factors'
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service'

/**
 * POST /api/mfa/factor-events
 *
 * Body: { event: 'ENROLLED' | 'REMOVED', factorId: string }
 *
 * TOTP enrollment and removal happen client-side against Supabase Auth, so the
 * server never sees them. The client reports each one here. The claim is not
 * trusted as-is: the factor state is re-read with the service-role Admin API,
 * and only a state that matches the claimed event is recorded.
 */
const EVENTS = {
  ENROLLED: 'MFA_FACTOR_ENROLLED',
  REMOVED: 'MFA_FACTOR_REMOVED',
} as const

type FactorEvent = keyof typeof EVENTS

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return fail(401, 'UNAUTHORIZED', 'Unauthorized')
  if (!user.profileId) return fail(403, 'NO_PROFILE', 'Profile not found')

  const body = (await request.json().catch(() => ({}))) as { event?: string; factorId?: string }
  const event = body.event as FactorEvent | undefined
  const factorId = typeof body.factorId === 'string' ? body.factorId.trim() : ''
  if (!event || !(event in EVENTS) || !factorId) {
    return fail(400, 'VALIDATION', 'event (ENROLLED|REMOVED) and factorId are required')
  }

  const account = await prisma.account.findFirst({
    where: { email: user.email.trim().toLowerCase() },
    select: { authUserId: true },
  })
  if (!account) return fail(403, 'ACCOUNT_NOT_MAPPED', 'Account not found')

  try {
    const factors = await listTotpFactors(account.authUserId)
    const factor = factors.find((f) => f.id === factorId)

    // Only record what the server can confirm.
    if (event === 'ENROLLED' && factor?.status !== 'verified') {
      return fail(409, 'NOT_CONFIRMED', 'Factor is not verified')
    }
    if (event === 'REMOVED' && factor) {
      return fail(409, 'NOT_CONFIRMED', 'Factor still exists')
    }

    await createAuditLog(
      fromCurrentUser(user, EVENTS[event], 'mfa_factor', factorId, {
        metadata: {
          accountId: account.authUserId,
          factorType: 'totp',
          remainingVerifiedFactors: factors.filter((f) => f.status === 'verified').length,
          userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
        },
      }),
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[mfa factor-events] failed', error)
    return fail(500, 'INTERNAL', 'Internal server error')
  }
}
