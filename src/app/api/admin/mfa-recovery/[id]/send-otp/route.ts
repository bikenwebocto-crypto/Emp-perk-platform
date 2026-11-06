import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError } from '@/lib/mfa-recovery/http'
import { adminSendOtp } from '@/services/mfa-recovery.service'

// POST /api/admin/mfa-recovery/:id/send-otp — emails a code to the user's registered
// email. The response never contains the code.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    return NextResponse.json({ success: true, data: await adminSendOtp(auth.actor, id) })
  } catch (error) {
    return handleRecoveryError(error, 'send-otp')
  }
}
