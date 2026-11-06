import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, getFreshTotpVerifiedAt, handleRecoveryError, readJson } from '@/lib/mfa-recovery/http'
import { getApproverConfig, setRecoveryApprover } from '@/services/mfa-recovery.service'

// GET /api/admin/security/recovery-approver — the caller's approver + eligible candidates.
export async function GET(request: Request) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ success: true, data: await getApproverConfig(auth.actor) })
  } catch (error) {
    return handleRecoveryError(error, 'get-approver')
  }
}

// PUT /api/admin/security/recovery-approver { approverAccountId }
// Needs a TOTP verification in this session within the last 5 minutes: the
// client re-runs supabase.auth.mfa.challengeAndVerify right before calling.
export async function PUT(request: Request) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    const body = await readJson(request)
    const freshMfaAt = await getFreshTotpVerifiedAt()
    return NextResponse.json({ success: true, data: await setRecoveryApprover(auth.actor, body.approverAccountId, freshMfaAt) })
  } catch (error) {
    return handleRecoveryError(error, 'set-approver')
  }
}
