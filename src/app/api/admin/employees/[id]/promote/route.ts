import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { forbidden } from '@/lib/api-auth'
import { canAdminCallApi } from '@/lib/access/account-access'
import { promoteEmployeeToCompanyAdmin } from '@/lib/company-detail/service'

/**
 * POST /api/admin/employees/[id]/promote
 *
 * Promote an existing employee of ANY company to a Company Admin of their
 * own company. System admins only. No request body is required.
 *
 * SUPPORT_ADMIN is blocked by the middleware /api/admin API gate
 * (canAdminCallApi); the same check is repeated here for defence in depth.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 },
    )
  }
  if (user.userType !== 'admin') return forbidden(user.userType)
  if (!canAdminCallApi(user.adminRole, '/api/admin/employees')) {
    return forbidden(user.userType)
  }

  const { id } = await params
  return promoteEmployeeToCompanyAdmin({ employeeId: id, actor: user })
}
