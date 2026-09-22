import { NextRequest, NextResponse } from 'next/server'
import { createAuditLog } from '@/services/audit-log.service'
import { createClient } from '@/lib/supabase/server'
import { getCompanyAdmin, handleApiError } from '../../helpers'

export async function POST(request: NextRequest) {
  try {
    const { companyAdmin, user } = await getCompanyAdmin()
    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Current password and new password are required' } },
        { status: 400 },
      )
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'New password must be at least 8 characters' } },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    if (!user?.email) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'Unable to verify current password: no session email' } },
        { status: 400 },
      )
    }

    // Re-authenticate with the provided current password before allowing
    // the change; otherwise anyone with an active session could change
    // the password without knowing the old one.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (verifyError) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect' } },
        { status: 400 },
      )
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: error.message } },
        { status: 400 },
      )
    }

    await createAuditLog({
      actorType: 'company_admin',
      actorId: companyAdmin.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'COMPANY_ADMIN',
      entityId: companyAdmin.id,
    })

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    return handleApiError(error)
  }
}
