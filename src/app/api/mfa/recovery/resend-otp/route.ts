import { NextResponse } from 'next/server'
import { getUserRecoveryActor, handleRecoveryError } from '@/lib/mfa-recovery/http'
import { resendOtpForUser } from '@/services/mfa-recovery.service'

// POST /api/mfa/recovery/resend-otp — new code after the first one was sent (cooldown + cap apply).
export async function POST(request: Request) {
  const auth = await getUserRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ success: true, data: await resendOtpForUser(auth.actor) })
  } catch (error) {
    return handleRecoveryError(error, 'resend-otp')
  }
}
