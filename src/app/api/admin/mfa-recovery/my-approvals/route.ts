import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError, listParamsFrom } from '@/lib/mfa-recovery/http'
import { listMyApprovals } from '@/services/mfa-recovery.service'

// GET /api/admin/mfa-recovery/my-approvals — emergency requests assigned to the caller.
export async function GET(request: Request) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ success: true, data: await listMyApprovals(auth.actor, listParamsFrom(request)) })
  } catch (error) {
    return handleRecoveryError(error, 'my-approvals')
  }
}
