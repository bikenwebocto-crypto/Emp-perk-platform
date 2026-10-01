import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { createAuditLog } from '@/services/audit-log.service'
import { createPerfTimer } from '@/lib/perf'
import { deleteImage } from '@/lib/upload/image'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function notFound(message = 'Merchant not found') {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
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
  console.error('Merchant profile API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

const IMMEDIATE_FIELDS = [
  'contactName',
  'contactPhone',
  'description',
  'website',
  'coverImageUrl',
  'socialLinks',
  'businessHours',
  'tags',
] as const

const APPROVAL_FIELDS = ['businessName', 'categoryId', 'logoUrl'] as const

type ImmediateField = (typeof IMMEDIATE_FIELDS)[number]
type ApprovalField = (typeof APPROVAL_FIELDS)[number]

export async function GET() {
  const timer = createPerfTimer('GET /api/merchant/profile')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer)
    timer.point('getCurrentUser done, check role')
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    timer.point('getMerchantFromSession done')
    if (!merchant) return notFound()

    timer.section('Database Queries')
    timer.point('merchant.findUnique + include + _count')
    const profile = await prisma.merchant.findUnique({
      where: { id: merchant.id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { offers: true, branches: true, redemptions: true } },
      },
    })
    if (!profile) return notFound()

    // averageRating intentionally removed from this response (deferred decision).
    // Business metrics live in the dedicated /business-overview endpoint.
    const { averageRating: _removedRating, ...profileData } = profile

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({ success: true, data: profileData })
  } catch (error) {
    timer.end()
    return internalError(error)
  }
}

export async function PATCH(request: NextRequest) {
  const timer = createPerfTimer('PATCH /api/merchant/profile')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer)
    timer.point('getCurrentUser done, check role')
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    timer.point('getMerchantFromSession done')
    if (!merchant) return notFound()

    const body = await request.json()
    const {
      businessName, categoryId, logoUrl, contactName, contactPhone,
      description, website, coverImageUrl, socialLinks, businessHours, tags, changeReason,
    } = body

    const errors: Record<string, string> = {}
    if (contactName !== undefined && (!contactName || contactName.trim().length < 2)) {
      errors.contactName = 'Contact name is required (min 2 characters)'
    }
    if (website !== undefined && website && !/^https?:\/\//i.test(website)) {
      errors.website = 'Website must be a valid URL (http/https)'
    }
    if (logoUrl !== undefined && logoUrl && !/^https?:\/\//i.test(logoUrl)) {
      errors.logoUrl = 'Logo URL must be a valid URL (http/https)'
    }
    if (Object.keys(errors).length > 0) return badRequest('Validation failed', errors)

    timer.section('Database Queries')
    timer.point('merchant.findUnique (before snapshot)')
    const before = await prisma.merchant.findUnique({ where: { id: merchant.id } })
    if (!before) return notFound()

    const beforeSnapshot: Record<string, unknown> = {}
    const afterSnapshot: Record<string, unknown> = {}

    for (const f of [...IMMEDIATE_FIELDS, ...APPROVAL_FIELDS]) {
      const newVal = (body as any)[f]
      if (newVal === undefined) continue
      const oldVal = (before as any)[f]
      const a = oldVal === null || oldVal === undefined ? null : oldVal
      const b = newVal === null || newVal === undefined ? null : newVal
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        beforeSnapshot[f] = a
        afterSnapshot[f] = b
      }
    }

    const hasImmediateChanges = IMMEDIATE_FIELDS.some((f) => f in afterSnapshot)
    const hasApprovalChanges = APPROVAL_FIELDS.some((f) => f in afterSnapshot)

    if (!hasImmediateChanges && !hasApprovalChanges) {
      timer.end()
      return NextResponse.json({ success: true, data: before, message: 'No changes' })
    }

    if (hasApprovalChanges && !changeReason) {
      return badRequest('A reason is required when changing business name, category, or logo', {
        changeReason: 'Please provide a reason for the requested change',
      })
    }

    // Track old cover image for cleanup after successful DB update
    const oldCoverUrl = before.coverImageUrl

    await prisma.$transaction(async (tx) => {
      if (hasImmediateChanges) {
        timer.point('merchant.update (immediate fields)')
        const immediateUpdate: Record<string, unknown> = {}
        for (const f of IMMEDIATE_FIELDS) {
          if (f in afterSnapshot) immediateUpdate[f] = afterSnapshot[f]
        }
        await tx.merchant.update({ where: { id: merchant.id }, data: immediateUpdate })
      }

      timer.point('createAuditLog (PROFILE_UPDATED)')
      await createAuditLog({
        actorType: 'merchant',
        actorId: merchant.id,
        action: 'PROFILE_UPDATED',
        entityType: 'merchant',
        entityId: merchant.id,
        changes: { before: beforeSnapshot, after: afterSnapshot } as any,
        metadata: { hasApprovalChanges },
      })

      if (hasApprovalChanges) {
        timer.point('actionQueueItem.findFirst')
        const existing = await tx.actionQueueItem.findFirst({
          where: { referenceId: merchant.id, referenceType: 'merchant', type: 'PROFILE_EDIT_REQUEST', status: 'PENDING' },
        })
        if (!existing) {
          timer.point('actionQueueItem.create')
          await tx.actionQueueItem.create({
            data: {
              type: 'PROFILE_EDIT_REQUEST',
              title: `Profile change request: ${merchant.businessName}`,
              description: `Merchant ${merchant.businessName} requested changes to: ${(APPROVAL_FIELDS as readonly string[]).filter((f) => f in afterSnapshot).join(', ')}. Reason: ${changeReason}`,
              referenceId: merchant.id, referenceType: 'merchant', status: 'PENDING', priority: 2,
              metadata: {
                queueType: 'PROFILE_EDIT_REQUEST', requestedFields: afterSnapshot, originalValues: beforeSnapshot,
                reason: changeReason, approvalFields: (APPROVAL_FIELDS as readonly string[]).filter((f) => f in afterSnapshot),
              } as any,
            },
          })

          timer.point('createAuditLog (PROFILE_CHANGE_REQUESTED)')
          await createAuditLog({
            actorType: 'merchant', actorId: merchant.id, action: 'PROFILE_CHANGE_REQUESTED',
            entityType: 'merchant', entityId: merchant.id,
            changes: { before: beforeSnapshot, after: afterSnapshot } as any,
            metadata: { changeReason },
          })
        }
      }
    })

    // Clean up old images after successful DB update (immediate fields only)
    if (hasImmediateChanges && coverImageUrl !== undefined && oldCoverUrl && coverImageUrl !== oldCoverUrl) {
      deleteImage(oldCoverUrl, { bucket: 'offer-images' }).catch(() => {})
    }

    timer.point('merchant.findUnique (updated)')
    const updated = await prisma.merchant.findUnique({
      where: { id: merchant.id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { offers: true, branches: true, redemptions: true } },
      },
    })

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    if (!updated) return notFound()
    const { averageRating: _patchRemovedRating, ...updatedData } = updated
    return NextResponse.json({
      success: true, data: updatedData, requiresApproval: hasApprovalChanges,
      message: hasApprovalChanges
        ? 'Profile updated. Sensitive changes are pending admin approval.'
        : 'Profile updated successfully.',
    })
  } catch (error) {
    timer.end()
    return internalError(error)
  }
}
