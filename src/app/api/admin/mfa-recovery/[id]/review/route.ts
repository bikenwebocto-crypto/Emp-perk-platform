import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError } from '@/lib/mfa-recovery/http'
import { markUnderReview } from '@/services/mfa-recovery.service'

// PATCH /api/admin/mfa-recovery/:id/review — PENDING → UNDER_REVIEW (STANDARD only).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    return NextResponse.json({ success: true, data: await markUnderReview(auth.actor, id) })
  } catch (error) {
    return handleRecoveryError(error, 'review')
  }
}
