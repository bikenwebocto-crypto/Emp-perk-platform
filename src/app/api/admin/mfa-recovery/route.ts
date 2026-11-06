import { NextResponse } from 'next/server'
import { getAdminRecoveryActor, handleRecoveryError, listParamsFrom } from '@/lib/mfa-recovery/http'
import { listStandardRequests } from '@/services/mfa-recovery.service'

// GET /api/admin/mfa-recovery?status=&q=&page=&pageSize=&sort=requestedAt|updatedAt|status&order=asc|desc
// STANDARD requests only. Emergency requests are visible to their assigned approver (my-approvals).
export async function GET(request: Request) {
  const auth = await getAdminRecoveryActor(request)
  if (!auth.ok) return auth.response
  try {
    return NextResponse.json({ success: true, data: await listStandardRequests(auth.actor, listParamsFrom(request)) })
  } catch (error) {
    return handleRecoveryError(error, 'list')
  }
}
