import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'

// GET /api/mobile/notifications
//
// Paginated in-app notifications for the employee. Returns `unread` count
// alongside the page. Mirrors the web `/api/employee/notifications`
// contract (excludes `referenceType: 'saved_offer'` which is the saved-
// offers side channel).
const OFFER_REFERENCE_TYPES = new Set(['offer']) // add others if used, e.g. 'new_offer', 'offer_expiring'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize')) || 20))

    const where = {
      employeeId: auth.employee.id,
      channel: 'IN_APP' as const,
      OR: [
        { referenceType: { not: 'saved_offer' } },
        { referenceType: null },
      ],
    }

    const [rows, unread, total] = await Promise.all([
      prisma.notificationEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notificationEvent.count({ where: { ...where, isRead: false } }),
      prisma.notificationEvent.count({ where }),
    ])

    // Merchant offer IDs on this page (inline, no helper)
    const offerIds = [
      ...new Set(
        rows
          .filter((r) => r.referenceType === 'merchant_offer' && r.referenceId)
          .map((r) => r.referenceId as string)
      ),
    ]

    const contents = offerIds.length
      ? await prisma.offerContent.findMany({
          where: { offerId: { in: offerIds } },
          select: { offerId: true, imageUrls: true },
        })
      : []

    console.log('DEBUG offerIds', offerIds.length, 'contents', contents.length)

    const imageByOfferId = new Map(
      contents.map((c) => [c.offerId, c.imageUrls[0] ?? null])
    )

    const data = rows.map((r) => ({
      ...r,
      offerImageUrl:
        r.referenceType === 'merchant_offer' && r.referenceId
          ? imageByOfferId.get(r.referenceId) ?? null
          : null,
    }))

    return NextResponse.json({
      success: true,
      data,
      unread,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
