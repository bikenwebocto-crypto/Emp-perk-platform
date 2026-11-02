import { NextResponse } from 'next/server'
import { getCompanyAdmin, handleApiError } from '../helpers'
import { getCompanyDetail } from '@/lib/company-detail/service'

/**
 * GET /api/company/detail
 * The Company Detail view for the signed-in company admin's own company.
 * Read access stays open while the company is paused / suspended so the
 * admin can see their status; every mutation route uses the strict check.
 */
export async function GET() {
  try {
    const { company, companyAdmin } = await getCompanyAdmin({ allowInactive: true })
    const data = await getCompanyDetail(company.id, 'company_admin')
    if (!data) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Company not found' } },
        { status: 404 },
      )
    }
    return NextResponse.json({ success: true, data: { ...data, viewerAdminId: companyAdmin.id } })
  } catch (error) {
    return handleApiError(error)
  }
}
