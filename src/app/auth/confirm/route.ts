import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Landing point for every Supabase email link (sign-up confirmation, password
// reset, invite, magic link). Email templates send
//   /auth/confirm?token_hash={{ .TokenHash }}&type=<type>
// verifyOtp works on any device/browser, unlike the PKCE ?code= exchange, which
// needs the code_verifier cookie from the browser that requested the email.

const SET_PASSWORD_TYPES: EmailOtpType[] = ['recovery', 'invite']
const VALID_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const email = searchParams.get('email')

  const loginUrl = new URL('/login', origin)
  if (email) loginUrl.searchParams.set('email', email)

  const supabase = await createClient()

  if (tokenHash && type && VALID_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      if (SET_PASSWORD_TYPES.includes(type)) {
        loginUrl.searchParams.set('mode', 'update_password')
        loginUrl.searchParams.set('flow', type)
      }
      return NextResponse.redirect(loginUrl)
    }
    console.error('[AUTH_CONFIRM] verifyOtp failed', type, error.message)
  } else if (code) {
    // Legacy PKCE links still in inboxes. Works only in the requesting browser.
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(loginUrl)
    console.error('[AUTH_CONFIRM] exchangeCodeForSession failed', error.message)
  }

  loginUrl.searchParams.set('error', 'link_invalid')
  return NextResponse.redirect(loginUrl)
}
