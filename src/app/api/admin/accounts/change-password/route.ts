import { NextRequest, NextResponse } from 'next/server'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog } from '@/services/audit-log.service'
import { getPasswordError } from '@/lib/validation/credentials'

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

/**
 * Lets a signed-in platform admin change their OWN password. There is no id in
 * the request: the target is always the session's user, so one admin can never
 * change another admin's password through this route.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return fail(401, 'UNAUTHORIZED', 'Unauthorized')
    if (!user.profileId) return fail(403, 'NO_ADMIN_PROFILE', 'Admin profile not found')

    const { currentPassword, newPassword } = await request.json()
    if (!currentPassword || !newPassword) {
      return fail(400, 'VALIDATION', 'Current password and new password are required')
    }
    const strengthError = getPasswordError(String(newPassword))
    if (strengthError) return fail(400, 'VALIDATION', strengthError)
    if (currentPassword === newPassword) {
      return fail(400, 'VALIDATION', 'New password must be different from the current password')
    }

    // Re-authenticate so an unattended session can't be used to change the password.
    const supabase = await createClient()
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (verifyError) return fail(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect')

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return fail(400, 'VALIDATION', error.message)

    await createAuditLog({
      actorType: 'admin',
      actorId: user.profileId,
      action: 'PASSWORD_CHANGED',
      entityType: 'ADMIN',
      entityId: user.profileId,
    })

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    console.error('Admin change password error:', error)
    return fail(500, 'INTERNAL', 'Internal server error')
  }
}
