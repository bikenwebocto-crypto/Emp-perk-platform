import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError, readJson } from '@/lib/mfa-recovery/http'
import { approveRecovery } from '@/services/mfa-recovery.service'

// POST /api/admin/mfa-recovery/:id/approve { confirm: true } — authorized Super Admin, STANDARD only.
// Requires OTP_VERIFIED; removes the old TOTP factor. Re-calling it after a
// failed removal retries the removal.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    const body = await readJson(request)
    return NextResponse.json({ success: true, data: await approveRecovery(auth.actor, id, 'STANDARD', body.confirm) })
  } catch (error) {
    return handleRecoveryError(error, 'approve')
  }
}
