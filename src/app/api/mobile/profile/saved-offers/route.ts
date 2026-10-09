import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { effectiveOfferStatus } from '@/lib/offer-visibility'
import { triggerOfferExpiry } from '@/lib/offer-expiry-trigger'

export async function GET(request: NextRequest) {
  try {
    triggerOfferExpiry() // background, never awaited
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20')))

    const where = { employeeId: auth.employee.id, referenceType: 'saved_offer' }

    const [saved, total] = await Promise.all([
      prisma.notificationEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, referenceId: true, createdAt: true },
      }),
      prisma.notificationEvent.count({ where }),
    ])

    const offerIds = saved.map((s) => s.referenceId).filter((id): id is string => !!id)

    const offersMap = new Map(
      offerIds.length
        ? (await prisma.merchantOffer.findMany({
            where: { id: { in: offerIds }, deletedAt: null },
            select: {
              id: true,
              title: true,
              status: true,
              endDate: true,
              content: { select: { imageUrls: true } },
              merchant: { select: { id: true, businessName: true, logoUrl: true } },
            },
          })).map((o) => [
            o.id,
            {
              id: o.id,
              title: o.title,
              status: o.status,
              endDate: o.endDate,
              image: (o.content?.imageUrls as string[] | null)?.[0] ?? null,
              merchant: o.merchant,
            },
          ])
        : [],
    )

    const now = new Date()
    const items = saved
      .map((s) => {
        const offer = s.referenceId ? offersMap.get(s.referenceId) : null
        if (!offer) return null
        const status = effectiveOfferStatus(offer.status, offer.endDate, now)
        return {
          savedAt: s.createdAt,
          offer: {
            id: offer.id,
            title: offer.title,
            image: offer.image,
            endDate: offer.endDate,
            status,
            isExpired: status === 'EXPIRED',
            merchant: offer.merchant,
          },
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    return NextResponse.json({
      success: true,
      data: items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    return internalError(error)
  }
}
