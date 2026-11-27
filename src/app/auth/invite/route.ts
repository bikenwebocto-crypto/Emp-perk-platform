import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { verifyInviteToken } from '@/lib/auth/invite-token'
import { createAuditLog } from '@/services/audit-log.service'
import {
  createSetPasswordToken,
  INVITE_USED_ACTION,
} from '@/services/company-admin-invitation.service'

// Landing point for company-admin invite emails (/auth/invite?t=<signed token>).
// The token is ours and lasts 72h; Supabase links cap at 24h, so the Supabase
// one-time token is created and verified here, at click time. Then the user is
// sent to /set-password with a session.

function publicOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : request.nextUrl.origin
}

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request)
  const fail = (email?: string) => {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'link_invalid')
    if (email) url.searchParams.set('email', email)
    return NextResponse.redirect(url)
  }

  const payload = verifyInviteToken(request.nextUrl.searchParams.get('t') ?? '')
  if (!payload) return fail()

  // Single use: a link whose jti was already recorded is spent.
  const used = await prisma.auditLog.findFirst({
    where: {
      action: INVITE_USED_ACTION,
      entityId: payload.adminId,
      metadata: { path: ['jti'], equals: payload.jti },
    },
    select: { id: true },
  })
  if (used) return fail(payload.email)

  try {
    const { tokenHash, type } = await createSetPasswordToken(payload.email)
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) throw error
  } catch (err) {
    console.error('[AUTH_INVITE] could not open invite', err instanceof Error ? err.message : err)
    return fail(payload.email)
  }

  await createAuditLog({
    actorType: 'system',
    action: INVITE_USED_ACTION,
    entityType: 'company_admin',
    entityId: payload.adminId,
    metadata: { jti: payload.jti, email: payload.email },
  })

  const url = new URL('/set-password', origin)
  url.searchParams.set('flow', 'invite')
  return NextResponse.redirect(url)
}
