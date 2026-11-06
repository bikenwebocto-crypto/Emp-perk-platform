import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError } from '@/lib/mfa-recovery/http'
import { getRequestForAdmin } from '@/services/mfa-recovery.service'

// GET /api/admin/mfa-recovery/:id — reviewer (STANDARD) or assigned approver (EMERGENCY).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    return NextResponse.json({ success: true, data: await getRequestForAdmin(auth.actor, id) })
  } catch (error) {
    return handleRecoveryError(error, 'detail')
  }
}
