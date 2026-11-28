import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { createAuditLog } from '@/services/audit-log.service'

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
  console.error('Change email error:', error)
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
    const { newEmail, password } = body

    if (!newEmail || !password) return badRequest('New email and password are required')

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) return badRequest('Invalid email address')

    const existing = await prisma.account.findUnique({ where: { email: newEmail } })
    if (existing && existing.authUserId !== merchant.accountId) {
      return badRequest('This email is already in use')
    }

    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { authUserId: merchant.accountId! },
        data: { email: newEmail },
      })

      await createAuditLog({
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'EMAIL_CHANGED',
        entityType: 'merchant',
        entityId: merchant.id,
        metadata: { newEmail },
      }, tx)
    })

    return NextResponse.json({ success: true, message: 'Email updated successfully' })
  } catch (error) {
    return internalError(error)
  }
}
