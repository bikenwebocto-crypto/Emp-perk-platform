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
//
// Offer-related notifications (live, updated, expiring, expired, replaced)
// carry an `offer` object with its details and image.
const OFFER_REFERENCE_TYPES = new Set(['offer', 'merchant_offer', 'offer_replacement'])

function isOfferNotification(r: { referenceType: string | null; referenceId: string | null }) {
  return !!r.referenceId && !!r.referenceType && OFFER_REFERENCE_TYPES.has(r.referenceType)
}

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

    // Offer IDs on this page
    const offerIds = [
      ...new Set(rows.filter(isOfferNotification).map((r) => r.referenceId as string)),
    ]

    // Deleted offers are still returned so old notifications keep their details.
    const offers = offerIds.length
      ? await prisma.merchantOffer.findMany({
          where: { id: { in: offerIds } },
          select: {
            id: true,
            title: true,
            offerType: true,
            status: true,
            startDate: true,
            endDate: true,
            isFlash: true,
            deletedAt: true,
            content: { select: { shortDescription: true, imageUrls: true } },
            merchant: { select: { id: true, businessName: true, logoUrl: true } },
          },
        })
      : []
    const offerById = new Map(offers.map((o) => [o.id, o]))
    const now = new Date()

    const data = rows.map((r) => {
      const offer = isOfferNotification(r) ? offerById.get(r.referenceId as string) : undefined
      const imageUrls = offer?.content?.imageUrls ?? []

      return {
        ...r,
        offer: offer
          ? {
              id: offer.id,
              title: offer.title,
              offerType: offer.offerType,
              status: offer.status,
              shortDescription: offer.content?.shortDescription ?? null,
              imageUrl: imageUrls[0] ?? null,
              imageUrls,
              startDate: offer.startDate,
              endDate: offer.endDate,
              isFlash: offer.isFlash,
              isExpired: offer.status === 'EXPIRED' || offer.endDate < now,
              isDeleted: !!offer.deletedAt,
              merchant: offer.merchant,
            }
          : null,
        // Flat fields kept for existing app builds.
        offerImageUrl: imageUrls[0] ?? null,
        merchantName: offer?.merchant.businessName ?? null,
        merchantLogoUrl: offer?.merchant.logoUrl ?? null,
      }
    })

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
