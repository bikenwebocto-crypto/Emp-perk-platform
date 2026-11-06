import { NextResponse } from 'next/server'
import { getUserRecoveryActor, handleRecoveryError } from '@/lib/mfa-recovery/http'
import { getMyRecoveryRequest } from '@/services/mfa-recovery.service'

// GET /api/mfa/recovery/me — the caller's open (or most recent) request.
export async function GET(request: Request) {
  const auth = await getUserRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ success: true, data: await getMyRecoveryRequest(auth.actor) })
  } catch (error) {
    return handleRecoveryError(error, 'me')
  }
}
