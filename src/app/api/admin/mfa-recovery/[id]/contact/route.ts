import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError, readJson } from '@/lib/mfa-recovery/http'
import { logContactAttempt } from '@/services/mfa-recovery.service'

// POST /api/admin/mfa-recovery/:id/contact { note? } — audit a phone verification call.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    const body = await readJson(request)
    return NextResponse.json({ success: true, data: await logContactAttempt(auth.actor, id, body.note) })
  } catch (error) {
    return handleRecoveryError(error, 'contact')
  }
}
