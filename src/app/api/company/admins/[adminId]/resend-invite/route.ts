import { NextRequest } from 'next/server'
import { getCompanyAdmin, handleApiError } from '../../../helpers'
import { resendCompanyAdminInvite } from '@/lib/company-detail/service'

/**
 * POST /api/company/admins/[adminId]/resend-invite
 *
 * Re-send the welcome / sign-up email to an administrator of the signed-in
 * admin's OWN company who has not signed in yet. The company is taken from
 * the session, never from the request.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ adminId: string }> },
) {
  try {
    const { company, user } = await getCompanyAdmin()
    const { adminId } = await params
    return resendCompanyAdminInvite(user!, company.id, adminId)
  } catch (error) {
    return handleApiError(error)
  }
}
