import { NextRequest } from 'next/server'
import { getCompanyAdmin, handleApiError } from '../../../helpers'
import { revertCompanyAdminToEmployee } from '@/lib/company-detail/service'

/**
 * POST /api/company/admins/[adminId]/revert
 *
 * Revert a deactivated administrator of the signed-in admin's OWN company
 * back to an employee. The company is taken from the session, never from
 * the request. No request body is required.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ adminId: string }> },
) {
  try {
    const { company, user } = await getCompanyAdmin()
    const { adminId } = await params
    return revertCompanyAdminToEmployee({ adminId, companyId: company.id, actor: user! })
  } catch (error) {
    return handleApiError(error)
  }
}
