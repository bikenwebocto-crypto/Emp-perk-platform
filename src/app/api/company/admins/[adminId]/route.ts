import { NextRequest } from 'next/server'
import { getCompanyAdmin, handleApiError } from '../../helpers'
import { updateCompanyAdmin, type UpdateAdminBody } from '@/lib/company-detail/service'

/**
 * PATCH /api/company/admins/[adminId]
 * Edit / disable / make primary an administrator of the signed-in admin's
 * own company. Admins of other companies return 404.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ adminId: string }> },
) {
  try {
    const { company, companyAdmin, user } = await getCompanyAdmin()
    const { adminId } = await params
    const body = (await request.json().catch(() => ({}))) as UpdateAdminBody
    return updateCompanyAdmin(user!, company.id, adminId, body, companyAdmin.id)
  } catch (error) {
    return handleApiError(error)
  }
}
