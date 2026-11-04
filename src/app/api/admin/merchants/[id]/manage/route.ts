import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import { channels, publishBusinessNotification, publishBusinessToAdmins } from '@/services/business-notification.service'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 },
  )
}

function notFound(entity: string) {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: `${entity} not found` } },
    { status: 404 },
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message } },
    { status: 400 },
  )
}

function internalError(error: unknown) {
  console.error('Merchant manage error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  )
}

// PATCH /api/admin/merchants/[id]/manage
// Quick-action body: { action: 'priority' | 'feature' | 'homepage' | 'suspend' | 'activate' | 'pause', value?: any }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()

    const { id } = await params
    const body = await request.json()
    const action = body?.action as string | undefined

    if (!action) return badRequest('action is required')

    const existing = await prisma.merchant.findUnique({ where: { id } })
    if (!existing || existing.deletedAt) return notFound('Merchant')

    const data: Record<string, unknown> = {}
    let auditLabel = ''
    let auditChanges: Record<string, unknown> = {}

    switch (action) {
      case 'priority': {
        const value = body?.value
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return badRequest('value must be a number for priority')
        }
        data.displayPriority = Math.max(0, Math.floor(value))
        auditLabel = 'MERCHANT_PRIORITY_CHANGED'
        auditChanges = { from: existing.displayPriority ?? 0, to: data.displayPriority }
        break
      }
      case 'feature': {
        const value = body?.value
        if (typeof value !== 'boolean') return badRequest('value must be a boolean for feature')
        data.isFeatured = value
        auditLabel = value ? 'MERCHANT_FEATURED' : 'MERCHANT_UNFEATURED'
        auditChanges = { isFeatured: value }
        break
      }
      case 'homepage': {
        const value = body?.value
        if (typeof value !== 'boolean') return badRequest('value must be a boolean for homepage')
        data.isHomepageMerchant = value
        auditLabel = value ? 'MERCHANT_HOMEPAGE_ENABLED' : 'MERCHANT_HOMEPAGE_DISABLED'
        auditChanges = { isHomepageMerchant: value }
        break
      }
      case 'suspend': {
        const reason = typeof body?.reason === 'string' ? body.reason.trim() : null
        data.status = 'SUSPENDED'
        data.rejectionReason = reason ?? existing.rejectionReason
        auditLabel = 'MERCHANT_SUSPENDED'
        auditChanges = { reason: reason ?? 'No reason provided' }
        break
      }
      case 'activate': {
        data.status = 'ACTIVE'
        data.approvedAt = existing.approvedAt ?? new Date()
        data.liveAt = existing.liveAt ?? new Date()
        data.onboardingStep = 'COMPLETE'
        auditLabel = 'MERCHANT_ACTIVATED'
        auditChanges = { status: 'ACTIVE' }
        break
      }
      case 'pause': {
        data.status = 'PAUSED'
        auditLabel = 'MERCHANT_PAUSED'
        auditChanges = { status: 'PAUSED' }
        break
      }
      default:
        return badRequest(`Unknown action: ${action}`)
    }

    if (data.status && data.status !== existing.status) {
      await prisma.merchantStatusHistory.create({
        data: {
          merchantId: id,
          fromStatus: existing.status,
          toStatus: data.status as any,
          changedBy: user.id,
          changedByType: 'admin',
          reason: typeof body?.reason === 'string' ? body.reason : null,
        },
      })
    }

    const updated = await prisma.merchant.update({
      where: { id },
      data: data as any,
      select: {
        id: true,
        businessName: true,
        status: true,
        isFeatured: true,
        isHomepageMerchant: true,
        displayPriority: true,
        accountId: true,
      },
    })

    const nextAccountStatus =
      updated.status === 'ACTIVE'
        ? 'ACTIVE'
        : updated.status === 'PAUSED'
          ? 'INACTIVE'
          : updated.status === 'SUSPENDED' || updated.status === 'ARCHIVED' || updated.status === 'REJECTED'
            ? 'SUSPENDED'
            : updated.status === 'PENDING'
              ? 'PENDING'
              : undefined

    if (updated.accountId && nextAccountStatus) {
      await prisma.account.update({
        where: { authUserId: updated.accountId },
        data: { status: nextAccountStatus },
      })
    }

    await createAuditLog(
      fromCurrentUser(user, auditLabel, 'merchant', id, {
        changes: auditChanges,
      }),
    )

    if (action === 'suspend' || action === 'activate') {
      const suspended = action === 'suspend'
      await publishBusinessNotification({
        type: suspended ? 'COMPANY_DISABLED' : 'MERCHANT_APPROVED',
        title: suspended ? `Merchant suspended: ${existing.businessName}` : `Merchant reactivated: ${existing.businessName}`,
        message: suspended
          ? 'Your merchant account has been suspended. Contact support for details.'
          : 'Your merchant account has been reactivated.',
        priority: suspended ? 'URGENT' : 'HIGH',
        recipients: [{ role: 'merchant', id }],
        channels: channels('IN_APP', 'PUSH', 'EMAIL'),
        referenceType: 'merchant',
        referenceId: id,
        metadata: { previousStatus: existing.status, status: updated.status, reason: body?.reason ?? null },
      })
      if (suspended) {
        await publishBusinessToAdmins({
          type: 'COMPANY_DISABLED',
          title: `Merchant suspended: ${existing.businessName}`,
          message: 'A merchant account was suspended.',
          priority: 'URGENT',
          channels: channels('IN_APP', 'PUSH', 'EMAIL'),
          referenceType: 'merchant',
          referenceId: id,
          metadata: { previousStatus: existing.status, reason: body?.reason ?? null },
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Merchant ${action} updated successfully`,
    })
  } catch (error) {
    return internalError(error)
  }
}
