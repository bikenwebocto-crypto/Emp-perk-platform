import { NextRequest } from 'next/server'
import { getCompanyAdmin, handleApiError } from '../helpers'
import { createCompanyAdmin, type AddAdminBody } from '@/lib/company-detail/service'

/**
 * POST /api/company/admins
 * Add an administrator to the signed-in admin's own company.
 */
export async function POST(request: NextRequest) {
  try {
    const { company, user } = await getCompanyAdmin()
    const body = (await request.json().catch(() => ({}))) as AddAdminBody
    return createCompanyAdmin(user!, company.id, body)
  } catch (error) {
    return handleApiError(error)
  }
}
