import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import {
  validateBranchInput,
  isSignificantLocationChange,
  hasDuplicateAddress,
} from '@/lib/branch-helpers'
import { createAuditLog } from '@/services/audit-log.service'
import { channels, publishBusinessNotification } from '@/services/business-notification.service'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function notFound() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Branch not found' } },
    { status: 404 }
  )
}
function badRequest(message: string, details?: Record<string, string>) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message, details } },
    { status: 400 }
  )
}
function internalError(error: unknown) {
  console.error('Merchant branch [id] API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

async function loadBranch(id: string, merchantId: string) {
  return prisma.merchantBranch.findFirst({
    where: { id, merchantId, deletedAt: null },
  })
}

async function adjustMerchantStatusForBranchChange(merchantId: string) {
  const hasActive = await prisma.merchantBranch.count({
    where: {
      merchantId,
      deletedAt: null,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  if (hasActive === 0) {
    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { status: true } })
    if (merchant && merchant.status === 'ACTIVE') {
      await prisma.merchant.update({
        where: { id: merchantId },
        data: { status: 'PAUSED' },
      })
      await prisma.merchantStatusHistory.create({
        data: {
          merchantId,
          fromStatus: 'ACTIVE',
          toStatus: 'PAUSED',
          changedBy: merchantId,
          changedByType: 'system',
          reason: 'Auto-paused: no ACTIVE branches remaining',
        },
      })
    }
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const { id } = await params
    const branch = await loadBranch(id, merchant.id)
    if (!branch) return notFound()
    return NextResponse.json({ success: true, data: branch })
  } catch (error) {
    return internalError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const { id } = await params
    const existing = await loadBranch(id, merchant.id)
    if (!existing) return notFound()

    const body = await request.json()
    const allowed = [
      'name', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country',
      'phone', 'email', 'latitude', 'longitude', 'openingHours', 'isPrimary',
      'branchType', 'deliveryRadiusKm', 'isNationwide', 'storefrontImageUrl',
      'branchImages', 'parkingInfo', 'wheelchairAccess', 'landmark', 'description', 'status',
    ]
    const updateData: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updateData[key] = body[key]
    }

    const validation = validateBranchInput(
      {
        name: updateData.name as string | undefined,
        addressLine1: updateData.addressLine1 as string | undefined,
        city: updateData.city as string | undefined,
        country: updateData.country as string | undefined,
        latitude: updateData.latitude as number | null | undefined,
        longitude: updateData.longitude as number | null | undefined,
        branchType: updateData.branchType as 'IN_STORE' | 'ONLINE' | undefined,
        isNationwide: updateData.isNationwide as boolean | undefined,
        deliveryRadiusKm: updateData.deliveryRadiusKm as number | null | undefined,
      },
      true
    )
    if (!validation.valid) return badRequest('Validation failed', validation.errors)

    if (updateData.branchType === 'ONLINE' && existing.branchType !== 'ONLINE') {
      const otherOnline = await prisma.merchantBranch.findFirst({
        where: { merchantId: merchant.id, branchType: 'ONLINE', deletedAt: null, NOT: { id } },
      })
      if (otherOnline) {
        return badRequest('Maximum one ONLINE branch allowed per merchant', {
          branchType: 'You already have an ONLINE branch',
        })
      }
    }

    if (
      existing.branchType === 'IN_STORE' &&
      (updateData.addressLine1 !== undefined ||
        updateData.city !== undefined ||
        updateData.state !== undefined ||
        updateData.postalCode !== undefined ||
        updateData.country !== undefined)
    ) {
      const newAddress = {
        addressLine1: (updateData.addressLine1 as string) ?? existing.addressLine1,
        city: (updateData.city as string) ?? existing.city,
        state: (updateData.state as string) ?? existing.state,
        postalCode: (updateData.postalCode as string) ?? existing.postalCode,
        country: (updateData.country as string) ?? existing.country,
      }
      const others = await prisma.merchantBranch.findMany({
        where: { merchantId: merchant.id, branchType: 'IN_STORE', deletedAt: null, NOT: { id } },
        select: { id: true, addressLine1: true, city: true, state: true, postalCode: true, country: true },
      })
      if (hasDuplicateAddress(newAddress, others as any)) {
        return badRequest('A branch with this address already exists', {
          addressLine1: 'Duplicate address for this merchant',
        })
      }
    }

    const locationCheck = isSignificantLocationChange(existing, updateData)
    let requiresApproval = false
    if (locationCheck.changed && existing.status === 'ACTIVE' && existing.branchType === 'IN_STORE') {
      requiresApproval = true
    }

    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (const key of allowed) {
      const a = (existing as any)[key]
      const b = updateData[key]
      const aJson = a instanceof Date ? a.toISOString() : a instanceof Prisma.Decimal ? a.toString() : a
      const bJson = b instanceof Date ? b.toISOString() : b instanceof Prisma.Decimal ? b.toString() : b
      if (JSON.stringify(aJson ?? null) !== JSON.stringify(bJson ?? null)) {
        before[key] = aJson
        after[key] = bJson
      }
    }

    if (updateData.isPrimary === true) {
      await prisma.merchantBranch.updateMany({
        where: { merchantId: merchant.id, isPrimary: true, deletedAt: null, NOT: { id } },
        data: { isPrimary: false },
      })
    }

    if (updateData.status === 'ACTIVE') {
      updateData.isActive = true
    } else if (updateData.status === 'INACTIVE' || updateData.status === 'CLOSED') {
      updateData.isActive = false
    }

    const dataForPrisma: any = { ...updateData }
    if (dataForPrisma.latitude != null) {
      dataForPrisma.latitude = new Prisma.Decimal(dataForPrisma.latitude)
    }
    if (dataForPrisma.longitude != null) {
      dataForPrisma.longitude = new Prisma.Decimal(dataForPrisma.longitude)
    }

    const updated = await prisma.merchantBranch.update({
      where: { id },
      data: dataForPrisma,
    })

    await createAuditLog({
      actorType: 'merchant',
      actorId: merchant.id,
      action: 'BRANCH_UPDATED',
      entityType: 'merchant_branch',
      entityId: id,
      changes: { before, after, requiresApproval } as any,
    })

    await publishBusinessNotification({
      type: 'SYSTEM',
      title: `Branch updated: ${updated.name}`,
      message: 'A branch on your merchant account was updated.',
      priority: 'NORMAL',
      recipients: [{ role: 'merchant', id: merchant.id }],
      channels: channels('IN_APP'),
      referenceType: 'merchant_branch',
      referenceId: id,
      metadata: { merchantId: merchant.id, changedFields: Object.keys(after) },
    })

    if (updateData.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
      await createAuditLog({
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'BRANCH_ACTIVATED',
        entityType: 'merchant_branch',
        entityId: id,
        changes: { from: existing.status, to: 'ACTIVE' } as any,
      })
    }
    if (updateData.status === 'INACTIVE' && existing.status !== 'INACTIVE') {
      await createAuditLog({
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'BRANCH_DEACTIVATED',
        entityType: 'merchant_branch',
        entityId: id,
        changes: { from: existing.status, to: 'INACTIVE' } as any,
      })
    }

    if (requiresApproval) {
      await prisma.actionQueueItem.create({
        data: {
          type: 'PROFILE_EDIT_REQUEST',
          title: `Branch location update: ${existing.name}`,
          description: `Merchant ${merchant.businessName} updated branch location fields: ${locationCheck.fields.join(', ')}. Review and approve.`,
          referenceId: merchant.id,
          referenceType: 'merchant',
          merchantId: merchant.id,
          status: 'PENDING',
          priority: 2,
          metadata: {
            queueType: 'PROFILE_EDIT_REQUEST',
            branchId: id,
            branchName: existing.name,
            changedFields: locationCheck.fields,
            before,
            after,
          } as any,
        },
      })
    }

    if (updateData.status === 'INACTIVE' || updateData.status === 'CLOSED') {
      await adjustMerchantStatusForBranchChange(merchant.id)
    }

    return NextResponse.json({
      success: true,
      data: updated,
      requiresApproval,
      message: requiresApproval
        ? 'Branch updated. Location changes require admin approval before they take effect on the public listing.'
        : 'Branch updated',
    })
  } catch (error) {
    return internalError(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const { id } = await params
    const existing = await loadBranch(id, merchant.id)
    if (!existing) return notFound()

    const totalBranches = await prisma.merchantBranch.count({
      where: { merchantId: merchant.id, deletedAt: null },
    })
    if (totalBranches <= 1) {
      return badRequest('Cannot delete your only branch. Merchants must have at least one branch.', {
        branch: 'Every merchant must have at least one branch',
      })
    }

    const now = new Date()
    await prisma.merchantBranch.update({
      where: { id },
      data: { status: 'CLOSED', isActive: false, deletedAt: now, isPrimary: false },
    })

    await createAuditLog({
      actorType: 'merchant',
      actorId: merchant.id,
      action: 'BRANCH_DELETED',
      entityType: 'merchant_branch',
      entityId: id,
      changes: { branchName: existing.name, branchType: existing.branchType } as any,
    })

    await publishBusinessNotification({
      type: 'SYSTEM',
      title: `Branch deleted: ${existing.name}`,
      message: 'A branch was removed from your merchant account.',
      priority: 'NORMAL',
      recipients: [{ role: 'merchant', id: merchant.id }],
      channels: channels('IN_APP'),
      referenceType: 'merchant_branch',
      referenceId: id,
      metadata: { merchantId: merchant.id },
    })

    await adjustMerchantStatusForBranchChange(merchant.id)

    return NextResponse.json({ success: true, message: 'Branch closed' })
  } catch (error) {
    return internalError(error)
  }
}

