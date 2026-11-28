import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import {
  validateBranchInput,
  isSignificantLocationChange,
  hasDuplicateAddress,
  isPhysicalBranch,
  PHYSICAL_BRANCH_TYPES,
} from '@/lib/branch-helpers'
import { createAuditLog } from '@/services/audit-log.service'
import {
  applyEvergreenBranchLink,
  getLiveOffersLinkedToBranch,
  linkedOffersMessage,
  parseEvergreenLinkChoice,
} from '@/lib/offers/channel.server'
import { EVERGREEN_BRANCH_LINK_CODE } from '@/lib/offers/channel'
import { getBranchCoverageStatuses } from '@/lib/offers/visible-merchants'
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

async function adjustMerchantStatusForBranchChange(
  merchantId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const hasActive = await client.merchantBranch.count({
    where: {
      merchantId,
      deletedAt: null,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  if (hasActive === 0) {
    const merchant = await client.merchant.findUnique({ where: { id: merchantId }, select: { status: true } })
    if (merchant && merchant.status === 'ACTIVE') {
      await client.merchant.update({
        where: { id: merchantId },
        data: { status: 'PAUSED' },
      })
      await client.merchantStatusHistory.create({
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
    const { evergreen, statuses } = await getBranchCoverageStatuses(merchant.id, [branch])
    return NextResponse.json({
      success: true,
      data: { ...branch, evergreenCoverage: statuses.get(branch.id), liveEvergreen: evergreen },
    })
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
      'websiteUrl',
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
        branchType: updateData.branchType as 'IN_STORE' | 'ONLINE' | 'BOTH' | undefined,
        isNationwide: updateData.isNationwide as boolean | undefined,
        deliveryRadiusKm: updateData.deliveryRadiusKm as number | null | undefined,
        websiteUrl: updateData.websiteUrl as string | null | undefined,
      },
      true
    )
    if (!validation.valid) return badRequest('Validation failed', validation.errors)

    // A branch used by a live offer can't be deactivated, closed or switched to another type.
    const deactivating =
      existing.status === 'ACTIVE' &&
      updateData.status !== undefined &&
      updateData.status !== 'ACTIVE'
    const changingType =
      updateData.branchType !== undefined && updateData.branchType !== existing.branchType
    if (deactivating || changingType) {
      const linked = await getLiveOffersLinkedToBranch(merchant.id, existing)
      if (linked.length > 0) {
        const message = linkedOffersMessage('deactivate', linked)
        return badRequest(message, deactivating ? { status: message } : { branchType: message })
      }
    }

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
      isPhysicalBranch(existing.branchType) &&
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
        where: { merchantId: merchant.id, branchType: { in: [...PHYSICAL_BRANCH_TYPES] }, deletedAt: null, NOT: { id } },
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
    if (locationCheck.changed && existing.status === 'ACTIVE' && isPhysicalBranch(existing.branchType)) {
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

    // One-perk rule: a branch that becomes an active in-store branch (reactivated,
    // or switched from Online) must be linked to the live Evergreen or stay hidden.
    const nextType = (updateData.branchType as string | undefined) ?? existing.branchType
    const nextStatus = (updateData.status as string | undefined) ?? existing.status
    const becomesActiveInStore =
      isPhysicalBranch(nextType) &&
      nextStatus === 'ACTIVE' &&
      (existing.status !== 'ACTIVE' || !isPhysicalBranch(existing.branchType))
    const evergreenLink = parseEvergreenLinkChoice(body)
    if (becomesActiveInStore) {
      const linkCheck = await applyEvergreenBranchLink(
        merchant.id,
        { id, branchType: nextType },
        evergreenLink,
        { dryRun: true },
      )
      if (linkCheck.status === 'LINK_REQUIRED') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: EVERGREEN_BRANCH_LINK_CODE,
              message: linkCheck.message,
              evergreenOffer: linkCheck.evergreen,
            },
          },
          { status: 409 },
        )
      }
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

    // The branch change, its audit rows, the approval request, the merchant
    // auto-pause and the Evergreen link are saved together or not at all.
    const { updated, link } = await prisma.$transaction(async (tx) => {
      if (updateData.isPrimary === true) {
        await tx.merchantBranch.updateMany({
          where: { merchantId: merchant.id, isPrimary: true, deletedAt: null, NOT: { id } },
          data: { isPrimary: false },
        })
      }

      const updated = await tx.merchantBranch.update({
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
      }, tx)

      if (updateData.status === 'ACTIVE' && existing.status !== 'ACTIVE') {
        await createAuditLog({
          actorType: 'merchant',
          actorId: merchant.id,
          action: 'BRANCH_ACTIVATED',
          entityType: 'merchant_branch',
          entityId: id,
          changes: { from: existing.status, to: 'ACTIVE' } as any,
        }, tx)
      }
      if (updateData.status === 'INACTIVE' && existing.status !== 'INACTIVE') {
        await createAuditLog({
          actorType: 'merchant',
          actorId: merchant.id,
          action: 'BRANCH_DEACTIVATED',
          entityType: 'merchant_branch',
          entityId: id,
          changes: { from: existing.status, to: 'INACTIVE' } as any,
        }, tx)
      }

      if (requiresApproval) {
        await tx.actionQueueItem.create({
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
        await adjustMerchantStatusForBranchChange(merchant.id, tx)
      }

      const link = becomesActiveInStore
        ? await applyEvergreenBranchLink(
            merchant.id,
            { id, branchType: updated.branchType },
            evergreenLink,
            { client: tx },
          )
        : null
      if (link?.status === 'LINKED') {
        await createAuditLog({
          actorType: 'merchant',
          actorId: merchant.id,
          action: 'BRANCH_LINKED_TO_EVERGREEN',
          entityType: 'merchant_offer',
          entityId: link.evergreen.id,
          changes: { branchId: id, branchName: updated.name } as any,
        }, tx)
      }

      return { updated, link }
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

    const baseMessage = requiresApproval
      ? 'Branch updated. Location changes require admin approval before they take effect on the public listing.'
      : 'Branch updated.'
    return NextResponse.json({
      success: true,
      data: updated,
      requiresApproval,
      message: link?.message ? `${baseMessage} ${link.message}` : baseMessage,
      ...(link ? { evergreenCoverage: link.status } : {}),
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

    const linked = await getLiveOffersLinkedToBranch(merchant.id, existing)
    if (linked.length > 0) {
      const message = linkedOffersMessage('delete', linked)
      return badRequest(message, { branch: message })
    }

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.merchantBranch.update({
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
      }, tx)

      await adjustMerchantStatusForBranchChange(merchant.id, tx)
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

    return NextResponse.json({ success: true, message: 'Branch closed' })
  } catch (error) {
    return internalError(error)
  }
}

