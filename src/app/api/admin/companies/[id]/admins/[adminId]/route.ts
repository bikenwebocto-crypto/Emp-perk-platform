import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { forbidden } from '@/lib/api-auth'
import { updateCompanyAdmin, type UpdateAdminBody } from '@/lib/company-detail/service'

/**
 * PATCH /api/admin/companies/[id]/admins/[adminId]
 *
 * Edit, disable / re-enable, or make primary a single company admin.
 * See updateCompanyAdmin for the combined-action rules.
 */
export async function PATCH(
  request: NextRequest,
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
  const body = (await request.json().catch(() => ({}))) as UpdateAdminBody
  return updateCompanyAdmin(user, id, adminId, body)
}
