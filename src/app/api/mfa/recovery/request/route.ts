import { NextResponse } from 'next/server'
import { getUserRecoveryActor, handleRecoveryError, readJson } from '@/lib/mfa-recovery/http'
import { createRecoveryRequest, toUserView } from '@/services/mfa-recovery.service'

// POST /api/mfa/recovery/request { reason } — "Lost access to authenticator?"
// MERCHANT / COMPANY_ADMIN → STANDARD; SUPER_ADMIN → SUPER_ADMIN_EMERGENCY.
export async function POST(request: Request) {
  const auth = await getUserRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const body = await readJson(request)
    const created = await createRecoveryRequest(auth.actor, body.reason)
    return NextResponse.json({ success: true, data: toUserView(created) }, { status: 201 })
  } catch (error) {
    return handleRecoveryError(error, 'request')
  }
}
