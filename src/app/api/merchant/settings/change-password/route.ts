import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { createAuditLog } from '@/services/audit-log.service'
import { getPasswordError } from '@/lib/validation/credentials'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function notFound() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } },
    { status: 404 }
  )
}
function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message } },
    { status: 400 }
  )
}
function internalError(error: unknown) {
  console.error('Change password error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return badRequest('Current password and new password are required')
    }
    const strengthError = getPasswordError(String(newPassword))
    if (strengthError) return badRequest(strengthError)

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return badRequest(error.message)

    await createAuditLog({
      actorType: 'merchant',
      actorId: merchant.id,
      action: 'PASSWORD_CHANGED',
      entityType: 'merchant',
      entityId: merchant.id,
    })

    return NextResponse.json({ success: true, message: 'Password changed successfully' })
  } catch (error) {
    return internalError(error)
  }
}
