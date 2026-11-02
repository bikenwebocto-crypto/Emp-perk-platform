import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { getRedeemState, getRepeatAfterHours } from '@/lib/redemption-tracking'
import { triggerOfferExpiry } from '@/lib/offer-expiry-trigger'
import { isEvergreenRange, offerRank } from '@/lib/offers/evergreen'

// GET /api/mobile/flash
//
// Paginated list of currently active flash offers (isFlash = true). Flash
// offers are excluded from every other offer listing, so this is the only
// mobile endpoint that returns them. Soonest-ending first.
export async function GET(request: NextRequest) {
  try {
    triggerOfferExpiry() // background, never awaited
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? undefined
    const categoryId = searchParams.get('categoryId') ?? undefined
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')))
    const now = new Date()
    const where: Record<string, unknown> = {
      status: 'LIVE',
      isFlash: true,
      startDate: { lte: now },
      endDate: { gt: now },
      merchant: {
        status: 'ACTIVE',
        deletedAt: null,
        branches: { some: { isActive: true, status: 'ACTIVE', deletedAt: null } },
      },
    }
    if (categoryId) where.categoryId = categoryId
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { description: { contains: q, mode: 'insensitive' } } },
        { merchant: { businessName: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.merchantOffer.findMany({
        where,
        orderBy: [{ endDate: 'asc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          offerType: true,
          startDate: true,
          endDate: true,
          isFeatured: true,
          isExclusive: true,
          isFlash: true,
          createdAt: true,
          content: {
            select: {
              description: true,
              shortDescription: true,
              imageUrls: true,
            },
          },
          pricing: { select: { configuration: true } },
          redemption: {
            select: {
              redemptionType: true,
              configuration: true,
            },
          },
          merchant: {
            select: {
              id: true,
              businessName: true,
              logoUrl: true,
              averageRating: true,
              city: true,
              state: true,
              category: { select: { id: true, name: true, icon: true } },
            },
          },
          _count: { select: { redemptions: true } },
        },
      }),
      prisma.merchantOffer.count({ where }),
    ])

    const sortedRows = [...rows].sort((a, b) => {
      const aRank = offerRank({ evergreen: isEvergreenRange(a.startDate, a.endDate), isFlash: a.isFlash })
      const bRank = offerRank({ evergreen: isEvergreenRange(b.startDate, b.endDate), isFlash: b.isFlash })
      return aRank - bRank
    })
    const pageRows = sortedRows.slice((page - 1) * pageSize, page * pageSize)

    const offerIds = pageRows.map((o) => o.id)
    const [saved, redeemed] = await Promise.all([
      offerIds.length
        ? prisma.notificationEvent.findMany({
            where: {
              employeeId: auth.employee.id,
              referenceType: 'saved_offer',
              referenceId: { in: offerIds },
            },
            select: { referenceId: true },
          })
        : Promise.resolve([] as { referenceId: string }[]),
      offerIds.length
        ? prisma.redemption.findMany({
            where: { employeeId: auth.employee.id, offerId: { in: offerIds } },
            select: { offerId: true, createdAt: true },
          })
        : Promise.resolve([] as { offerId: string; createdAt: Date }[]),
    ])
    const savedSet = new Set(saved.map((s) => s.referenceId))
    const lastRedeemedAt = new Map<string, Date>()
    for (const r of redeemed) {
      const prev = lastRedeemedAt.get(r.offerId)
      if (!prev || r.createdAt > prev) lastRedeemedAt.set(r.offerId, r.createdAt)
    }

    const data = pageRows.map((o) => {
      const pricingConfig = (o.pricing?.configuration as Record<string, unknown>) ?? {}
      const redemptionConfig = (o.redemption?.configuration as Record<string, unknown>) ?? {}
      const redeemState = getRedeemState(
        lastRedeemedAt.get(o.id),
        getRepeatAfterHours(o.redemption?.configuration),
      )
      return {
        id: o.id,
        title: o.title,
        description: o.content?.description,
        shortDescription: o.content?.shortDescription,
        imageUrls: o.content?.imageUrls ?? [],
        offerType: o.offerType,
        discountValue: pricingConfig.discountValue ?? pricingConfig.amount ?? pricingConfig.percent,
        discountPercent: pricingConfig.percent,
        minimumSpend: pricingConfig.minimumSpend,
        discountMax: pricingConfig.maximumDiscount,
        redemptionType: o.redemption?.redemptionType,
        offerCode: redemptionConfig.code,
        bookingUrl: redemptionConfig.bookingUrl,
        qrCodeUrl: redemptionConfig.qrCodeUrl,
        startDate: o.startDate,
        endDate: o.endDate,
        // Seconds left in the flash window, so the app can run a countdown.
        secondsLeft: Math.max(0, Math.floor((o.endDate.getTime() - now.getTime()) / 1000)),
        isFeatured: o.isFeatured,
        isExclusive: o.isExclusive,
        isFlash: o.isFlash,
        evergreen: isEvergreenRange(o.startDate, o.endDate),
        createdAt: o.createdAt,
        merchant: o.merchant,
        redemptionCount: o._count.redemptions,
        isSaved: savedSet.has(o.id),
        isRedeemed: redeemState.isRedeemed,
        nextRedeemAt: redeemState.nextRedeemAt?.toISOString() ?? null,
      }
    })

    return NextResponse.json({
      success: true,
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    return internalError(error)
  }
}
