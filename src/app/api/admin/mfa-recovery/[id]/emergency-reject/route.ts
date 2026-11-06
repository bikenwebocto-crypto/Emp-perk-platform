import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError, readJson } from '@/lib/mfa-recovery/http'
import { rejectRecovery } from '@/services/mfa-recovery.service'

// POST /api/admin/mfa-recovery/:id/emergency-reject { reason } — assigned approver only; reason is mandatory.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    const body = await readJson(request)
    return NextResponse.json({ success: true, data: await rejectRecovery(auth.actor, id, 'SUPER_ADMIN_EMERGENCY', body.reason) })
  } catch (error) {
    return handleRecoveryError(error, 'emergency-reject')
  }
}
