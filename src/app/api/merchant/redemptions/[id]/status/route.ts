import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { createAuditLog } from '@/services/audit-log.service'
import {
  deriveStatus,
  rejectedNote,
  REDEMPTION_METHODS,
  type RedemptionMethod,
} from '@/lib/redemption-status'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function notFound(message = 'Not found') {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
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
  console.error('Merchant redemption status API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound('Merchant not found')
    const { id } = await params

    const body = await request.json()
    const { action, rejectionReason, notes } = body

    const redemption = await prisma.redemption.findFirst({
      where: { id, merchantId: merchant.id },
    })
    if (!redemption) return notFound('Redemption not found')

    const currentStatus = deriveStatus(redemption)
    if (currentStatus === 'CANCELLED') {
      return badRequest('Redemption was cancelled by the employee and cannot be modified')
    }

    let updateData: Record<string, unknown> = {}
    let auditAction = 'REDEMPTION_STATUS_UPDATED'

    if (action === 'CONFIRM') {
      updateData = {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedBy: user.profileId,
      }
      auditAction = 'REDEMPTION_CONFIRMED'
    } else if (action === 'REJECT') {
      if (!rejectionReason || !String(rejectionReason).trim()) {
        return badRequest('A rejection reason is required')
      }
      const existingNotes = redemption.merchantNotes ?? ''
      const methodMatch = existingNotes.match(/^METHOD:\w+/)
      const methodPart = methodMatch ? methodMatch[0] : ''
      updateData = {
        isVerified: false,
        verifiedAt: null,
        verifiedBy: null,
        merchantNotes: methodPart ? `${methodPart} | ${rejectedNote(rejectionReason)}` : rejectedNote(rejectionReason),
      }
      auditAction = 'REDEMPTION_REJECTED'
    } else {
      return badRequest('action must be CONFIRM or REJECT')
    }

    if (notes) {
      updateData.merchantNotes = `${updateData.merchantNotes ?? redemption.merchantNotes ?? ''}\nMerchant note: ${notes}`
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.redemption.update({
        where: { id },
        data: updateData,
      })

      await createAuditLog({
        actorType: 'merchant',
        actorId: merchant.id,
        action: auditAction,
        entityType: 'redemption',
        entityId: id,
        metadata: { action, rejectionReason: rejectionReason ?? null, notes: notes ?? null },
      }, tx)

      return updated
    })

    return NextResponse.json({
      success: true,
      data: { id: updated.id, status: deriveStatus(updated) },
    })
  } catch (error) {
    return internalError(error)
  }
}
