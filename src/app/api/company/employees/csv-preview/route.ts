import { NextRequest } from 'next/server'
import { getCompanyAdmin, handleApiError } from '../../helpers'
import { previewEmployeeCsv } from '@/lib/company-detail/service'

export async function POST(request: NextRequest) {
  try {
    const { company } = await getCompanyAdmin()
    return previewEmployeeCsv(company.id, await request.formData())
  } catch (error) {
    return handleApiError(error)
  }
}
