import { NextRequest, NextResponse } from 'next/server'
import { Prisma, type MerchantSuggestionStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { badRequest, internalError, notFound } from '@/lib/employee-helpers'
import { createAuditLog } from '@/services/audit-log.service'
import {
  ADMIN_NOTES_MAX_LENGTH,
  REASON_MAX_LENGTH,
  apiError,
  canTransition,
  getAllowedNextStatuses,
  isMerchantSuggestionStatus,
  requireAdmin,
} from '@/lib/merchant-suggestions'

const DETAIL_INCLUDE = {
  employee: { select: { id: true, firstName: true, lastName: true, phone: true } },
  company: { select: { id: true, name: true } },
  merchant: { select: { id: true, businessName: true, status: true } },
} as const

async function loadDetail(id: string) {
  const suggestion = await prisma.merchantSuggestion.findUnique({
    where: { id },
    include: DETAIL_INCLUDE,
  })
  if (!suggestion) return null

  const reviewedBy = suggestion.reviewedById
    ? await prisma.adminUser.findUnique({
        where: { id: suggestion.reviewedById },
        select: { id: true, firstName: true, lastName: true },
      })
    : null

  return {
    ...suggestion,
    reviewedBy,
    allowedNextStatuses: getAllowedNextStatuses(suggestion.status),
  }
}

// Merchants whose business name resembles the suggested name: a
// case-insensitive substring match on the full name, or on its first word
// when that word is distinctive enough (≥ 4 chars). Also matches on phone.
function similarMerchantsWhere(name: string, phone: string): Prisma.MerchantWhereInput {
  const firstWord = name.split(/\s+/)[0] ?? ''
  const or: Prisma.MerchantWhereInput[] = [
    { businessName: { contains: name, mode: 'insensitive' } },
    { contactPhone: phone },
  ]
  if (firstWord.length >= 4 && firstWord.toLowerCase() !== name.toLowerCase()) {
    or.push({ businessName: { contains: firstWord, mode: 'insensitive' } })
  }
  return { deletedAt: null, OR: or }
}

// GET /api/admin/merchant-suggestions/[id]
//
// Suggestion detail + allowedNextStatuses + possible duplicates:
//   - other suggestions with the same email or phone
//   - existing merchants with a similar business name / same phone
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    const suggestion = await loadDetail(id)
    if (!suggestion) return notFound('Merchant suggestion not found')

    const [similarSuggestions, similarMerchants] = await Promise.all([
      prisma.merchantSuggestion.findMany({
        where: {
          id: { not: id },
          OR: [
            { merchantEmail: suggestion.merchantEmail },
            { merchantPhone: suggestion.merchantPhone },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          merchantName: true,
          merchantEmail: true,
          merchantPhone: true,
          status: true,
          createdAt: true,
          employee: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
        },
      }),
      prisma.merchant.findMany({
        where: similarMerchantsWhere(suggestion.merchantName, suggestion.merchantPhone),
        orderBy: { businessName: 'asc' },
        take: 10,
        select: {
          id: true,
          businessName: true,
          contactPhone: true,
          website: true,
          status: true,
          city: true,
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        ...suggestion,
        possibleDuplicates: {
          suggestions: similarSuggestions,
          merchants: similarMerchants,
        },
      },
    })
  } catch (error) {
    return internalError(error)
  }
}

// PATCH /api/admin/merchant-suggestions/[id]
//
// Body: { status?, adminNotes?, rejectionReason?, merchantId? }
//   - status must be an allowed transition from the current status
//   - REJECTED requires rejectionReason
//   - CONVERTED requires merchantId of an existing (non-deleted) merchant
// The update is guarded on the status we read (updateMany + status in
// where), so a concurrent change by another admin returns 409 instead of
// being silently overwritten.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const { user } = auth
    const adminId = user.profileId ?? user.id

    const { id } = await params

    let body: Record<string, unknown>
    try {
      const parsed = await request.json()
      body = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return badRequest('Request body must be valid JSON')
    }

    const errors: Record<string, string> = {}
    const hasStatus = body.status !== undefined && body.status !== null
    const hasNotes = body.adminNotes !== undefined

    if (!hasStatus && !hasNotes) {
      return badRequest('Provide status and/or adminNotes to update')
    }

    let nextStatus: MerchantSuggestionStatus | null = null
    if (hasStatus) {
      if (!isMerchantSuggestionStatus(body.status)) errors.status = 'Invalid status'
      else nextStatus = body.status
    }

    let adminNotes: string | null | undefined
    if (hasNotes) {
      if (body.adminNotes !== null && typeof body.adminNotes !== 'string') {
        errors.adminNotes = 'adminNotes must be a string'
      } else if (typeof body.adminNotes === 'string' && body.adminNotes.length > ADMIN_NOTES_MAX_LENGTH) {
        errors.adminNotes = `adminNotes must be at most ${ADMIN_NOTES_MAX_LENGTH} characters`
      } else {
        adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() || null : null
      }
    }

    let rejectionReason: string | null = null
    if (nextStatus === 'REJECTED') {
      if (typeof body.rejectionReason !== 'string' || !body.rejectionReason.trim()) {
        errors.rejectionReason = 'A rejection reason is required'
      } else if (body.rejectionReason.trim().length > REASON_MAX_LENGTH) {
        errors.rejectionReason = `Rejection reason must be at most ${REASON_MAX_LENGTH} characters`
      } else {
        rejectionReason = body.rejectionReason.trim()
      }
    }

    let merchantId: string | null = null
    if (nextStatus === 'CONVERTED') {
      if (typeof body.merchantId !== 'string' || !body.merchantId.trim()) {
        errors.merchantId = 'Select the merchant this suggestion was converted into'
      } else {
        merchantId = body.merchantId.trim()
      }
    }

    if (Object.keys(errors).length > 0) return badRequest('Invalid update', errors)

    const current = await prisma.merchantSuggestion.findUnique({ where: { id } })
    if (!current) return notFound('Merchant suggestion not found')

    const statusChanging = nextStatus !== null
    if (nextStatus && !canTransition(current.status, nextStatus)) {
      return apiError(
        400,
        'INVALID_TRANSITION',
        `Cannot move a suggestion from ${current.status} to ${nextStatus}`,
        { allowedNextStatuses: getAllowedNextStatuses(current.status) },
      )
    }

    if (merchantId) {
      const merchant = await prisma.merchant.findFirst({
        where: { id: merchantId, deletedAt: null },
        select: { id: true },
      })
      if (!merchant) {
        return badRequest('Invalid update', { merchantId: 'Merchant not found' })
      }
    }

    const data: Prisma.MerchantSuggestionUncheckedUpdateManyInput = {}
    if (adminNotes !== undefined) data.adminNotes = adminNotes
    if (nextStatus) {
      data.status = nextStatus
      data.reviewedAt = new Date()
      data.reviewedById = adminId
      if (nextStatus === 'REJECTED') data.rejectionReason = rejectionReason
      // A rejection reason no longer applies once the suggestion is reopened.
      if (current.status === 'REJECTED') data.rejectionReason = null
      if (nextStatus === 'CONVERTED') data.merchantId = merchantId
    }

    try {
      if (statusChanging) {
        const { count } = await prisma.merchantSuggestion.updateMany({
          where: { id, status: current.status },
          data,
        })
        if (count === 0) {
          return apiError(
            409,
            'CONFLICT',
            'This suggestion was changed by someone else. Reload and try again.',
          )
        }
      } else {
        await prisma.merchantSuggestion.update({ where: { id }, data })
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return apiError(
          409,
          'MERCHANT_ALREADY_LINKED',
          'That merchant is already linked to another suggestion.',
        )
      }
      throw error
    }

    if (nextStatus) {
      void createAuditLog({
        actorType: 'admin',
        actorId: adminId,
        action: 'MERCHANT_SUGGESTION_STATUS_CHANGED',
        entityType: 'MERCHANT_SUGGESTION',
        entityId: id,
        changes: { status: { from: current.status, to: nextStatus } },
        metadata: {
          rejectionReason: rejectionReason ?? undefined,
          merchantId: merchantId ?? undefined,
        },
      })
    } else if (adminNotes !== undefined && adminNotes !== current.adminNotes) {
      void createAuditLog({
        actorType: 'admin',
        actorId: adminId,
        action: 'MERCHANT_SUGGESTION_NOTES_UPDATED',
        entityType: 'MERCHANT_SUGGESTION',
        entityId: id,
      })
    }

    const updated = await loadDetail(id)
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return internalError(error)
  }
}
