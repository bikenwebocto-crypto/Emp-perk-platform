import { NextResponse } from 'next/server'
import { getUserRecoveryActor, handleRecoveryError } from '@/lib/mfa-recovery/http'
import { completeRecoveryEnrollment } from '@/services/mfa-recovery.service'

// POST /api/mfa/recovery/complete — called after a new authenticator is verified.
// The server checks Supabase for a new verified factor; the client's word is not enough.
export async function POST(request: Request) {
  const auth = await getUserRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ success: true, data: await completeRecoveryEnrollment(auth.actor) })
  } catch (error) {
    return handleRecoveryError(error, 'complete')
  }
}
