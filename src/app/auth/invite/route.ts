import { NextResponse, type NextRequest } from 'next/server'
import { verifyInviteToken } from '@/lib/auth/invite-token'
import { isInviteTokenUsed } from '@/services/company-admin-invitation.service'

// Landing point for invite emails (/auth/invite?t=<signed token>), company
// admins and merchants. Opening the link does NOT use it up: email scanners
// and an abandoned tab must not kill it. The link is spent only when the
// password is saved (POST /api/auth/invite/complete).

function publicOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : request.nextUrl.origin
}

export async function GET(request: NextRequest) {
  const origin = publicOrigin(request)
  const token = request.nextUrl.searchParams.get('t') ?? ''
  const payload = verifyInviteToken(token)

  const fail = (email?: string) => {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'link_invalid')
    if (email) url.searchParams.set('email', email)
    return NextResponse.redirect(url)
  }

  if (!payload) return fail()
  if (await isInviteTokenUsed(payload.kind ?? 'company_admin', payload.adminId, payload.jti)) {
    return fail(payload.email)
  }

  const url = new URL('/set-password', origin)
  url.searchParams.set('flow', 'invite')
  url.searchParams.set('t', token)
  return NextResponse.redirect(url)
}
