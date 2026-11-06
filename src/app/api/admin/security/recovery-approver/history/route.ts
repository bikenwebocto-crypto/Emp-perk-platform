import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError } from '@/lib/mfa-recovery/http'
import { getApproverHistory } from '@/services/mfa-recovery.service'

// GET /api/admin/security/recovery-approver/history — the caller's assignment history.
export async function GET(request: Request) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ success: true, data: await getApproverHistory(auth.actor) })
  } catch (error) {
    return handleRecoveryError(error, 'approver-history')
  }
}
