import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { forbidden } from '@/lib/api-auth'
import { canAdminCallApi } from '@/lib/access/account-access'
import { revertCompanyAdminToEmployee } from '@/lib/company-detail/service'

/**
 * POST /api/admin/companies/[id]/admins/[adminId]/revert
 *
 * Revert a deactivated company admin back to an employee of the same
 * company. System admins only. No request body is required.
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
  if (!canAdminCallApi(user.adminRole, `/api/admin/companies/${id}/admins/${adminId}/revert`)) {
    return forbidden(user.userType)
  }

  return revertCompanyAdminToEmployee({ adminId, companyId: id, actor: user })
}
