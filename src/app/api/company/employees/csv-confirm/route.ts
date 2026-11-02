import { NextRequest } from 'next/server'
import { getCompanyAdmin, handleApiError } from '../../helpers'
import { confirmEmployeeCsv, type ConfirmCsvBody } from '@/lib/company-detail/service'

export async function POST(request: NextRequest) {
  try {
    const { company, user } = await getCompanyAdmin()
    const body = (await request.json().catch(() => ({}))) as ConfirmCsvBody
    return confirmEmployeeCsv(user!, company.id, body)
  } catch (error) {
    return handleApiError(error)
  }
}
