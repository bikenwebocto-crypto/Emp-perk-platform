import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { forbidden } from '@/lib/api-auth'
import { canAdminCallApi } from '@/lib/access/account-access'
import { resendCompanyAdminInvite } from '@/lib/company-detail/service'

/**
 * POST /api/admin/companies/[id]/admins/[adminId]/resend-invite
 *
 * Re-send the welcome / sign-up email to a company admin who has not
 * signed in yet. System admins only. No request body is required.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; adminId: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 },
    )
  }
  if (user.userType !== 'admin') return forbidden(user.userType)
  const { id, adminId } = await params
  if (!canAdminCallApi(user.adminRole, `/api/admin/companies/${id}/admins/${adminId}/resend-invite`)) {
    return forbidden(user.userType)
  }

  return resendCompanyAdminInvite(user, id, adminId)
}
