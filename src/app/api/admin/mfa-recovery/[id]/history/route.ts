import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError } from '@/lib/mfa-recovery/http'
import { getRequestHistory } from '@/services/mfa-recovery.service'

// GET /api/admin/mfa-recovery/:id/history — audit trail for one request.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    return NextResponse.json({ success: true, data: await getRequestHistory(auth.actor, id) })
  } catch (error) {
    return handleRecoveryError(error, 'history')
  }
}
