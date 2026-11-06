import { NextResponse } from 'next/server'
import { getUserRecoveryActor, handleRecoveryError, readJson } from '@/lib/mfa-recovery/http'
import { verifyRecoveryOtp } from '@/services/mfa-recovery.service'

// POST /api/mfa/recovery/verify-otp { code } — applies to the caller's own open request.
export async function POST(request: Request) {
  const auth = await getUserRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const body = await readJson(request)
    return NextResponse.json({ success: true, data: await verifyRecoveryOtp(auth.actor, body.code) })
  } catch (error) {
    return handleRecoveryError(error, 'verify-otp')
  }
}
