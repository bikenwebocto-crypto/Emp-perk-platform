import { NextRequest } from 'next/server'
import { getCompanyAdmin, handleApiError } from '../../../helpers'
import { promoteEmployeeToCompanyAdmin } from '@/lib/company-detail/service'

/**
 * POST /api/company/employees/[id]/promote
 *
 * Promote one of the signed-in company admin's OWN employees to a Company
 * Admin of the same company. The company is taken from the session, never
 * from the request. No request body is required.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { company, user } = await getCompanyAdmin()
    const { id } = await params
    return promoteEmployeeToCompanyAdmin({
      employeeId: id,
      actor: user!,
      scopeCompanyId: company.id,
    })
  } catch (error) {
    return handleApiError(error)
  }
}
