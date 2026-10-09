import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError, notFound } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { effectiveOfferStatus, isOfferVisibleToEmployees } from '@/lib/offer-visibility'
import { getRedeemState, getRepeatAfterHours } from '@/lib/redemption-tracking'
import { triggerOfferExpiry } from '@/lib/offer-expiry-trigger'

// GET /api/mobile/offers/[id]
//
// Single offer detail for the mobile app. Returns the offer with its
// merchant, branches, redemption count, visibility flag, and the calling
// employee's `isSaved` / `isRedeemed` flags.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    triggerOfferExpiry() // background, never awaited
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response
    const { id } = await params
    if (!id) return notFound('Offer not found')

    const offer = await prisma.merchantOffer.findFirst({
      where: { id, deletedAt: null },
      include: {
        content: { select: { description: true, shortDescription: true, termsAndConditions: true, imageUrls: true } },
        pricing: { select: { configuration: true } },
        redemption: { select: { redemptionType: true, configuration: true, daysOfWeek: true } },
        capacity: { select: { maxRedemptions: true, redeemedCount: true } },
        analytics: { select: { viewCount: true, clickCount: true, saveCount: true } },
        merchant: {
          select: {
            id: true,
            businessName: true,
            logoUrl: true,
            coverImageUrl: true,
            website: true,
            description: true,
            averageRating: true,
            totalRedemptions: true,
            category: { select: { id: true, name: true, icon: true } },
            branches: { where: { deletedAt: null, status: 'ACTIVE' } },
          },
        },
        _count: { select: { redemptions: true } },
      },
    })
    if (!offer) return notFound('Offer not found')

    const visibility = await isOfferVisibleToEmployees(id)
    const [saved, redemption] = await Promise.all([
      prisma.notificationEvent.findFirst({
        where: {
          employeeId: auth.employee.id,
          referenceType: 'saved_offer',
          referenceId: id,
        },
        select: { id: true },
      }),
      prisma.redemption.findFirst({
        where: { employeeId: auth.employee.id, offerId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          createdAt: true,
          redemptionCode: true,
          isRedeemed: true,
          isVerified: true,
          redeemedAt: true,
          rejectionReason: true,
        },
      }),
    ])

    const pricingConfig = (offer.pricing?.configuration as Record<string, unknown>) ?? {}
    const redemptionConfig = (offer.redemption?.configuration as Record<string, unknown>) ?? {}
    const now = new Date()
    const status = effectiveOfferStatus(offer.status, offer.endDate, now)
    const redeemState = getRedeemState(
      redemption?.createdAt,
      getRepeatAfterHours(offer.redemption?.configuration),
      now,
    )
    const remainingSeconds = redeemState.nextRedeemAt
    ? Math.max(0, Math.ceil((redeemState.nextRedeemAt.getTime() - now.getTime()) / 1000))
    : null
    console.log('$$$ Offer Data:', { pricingConfig, redemptionConfig })

    return NextResponse.json({
      success: true,
      data: {
        id: offer.id,
        title: offer.title,
        description: offer.content?.description,
        shortDescription: offer.content?.shortDescription,
        termsAndConditions: offer.content?.termsAndConditions,
        imageUrls: offer.content?.imageUrls ?? [],
        offerType: offer.offerType,
        status,
        isExpired: status === 'EXPIRED',
        discountValue: pricingConfig.discountValue ?? pricingConfig.amount ?? pricingConfig.percent ?? null,
        discountPercent: pricingConfig.percent ?? null,
        minimumSpend: pricingConfig.minimumSpend ?? null,
        discountMax: pricingConfig.maximumDiscount ?? null,
        redemptionType: offer.redemption?.redemptionType ?? null,
        maxRedemptions: offer.capacity?.maxRedemptions ?? null,
        currentRedemptions: offer.capacity?.redeemedCount ?? 0,
        daysOfWeek: offer.redemption?.daysOfWeek ?? null,
        offerCode: redemption?.redemptionCode ?? null,
        redemptionCode: redemptionConfig?.code ?? null,
        bookingUrl: redemptionConfig.bookingUrl ?? null,
        qrCodeUrl: redemptionConfig.qrCodeUrl ?? null,
        startDate: offer.startDate,
        endDate: offer.endDate,
        isFeatured: offer.isFeatured,
        isExclusive: offer.isExclusive,
        merchant: offer.merchant,
        redemptionCount: offer._count.redemptions,
        analytics: offer.analytics ?? { viewCount: 0, clickCount: 0, saveCount: 0 },
        isVisible: visibility.visible,
        visibilityReason: visibility.reason,
        isSaved: !!saved,
        isRedeemed: redeemState.isRedeemed,
        nextRedeemAt: redeemState.nextRedeemAt?.toISOString() ?? null,
        remainingSeconds,
        serverTime: now.toISOString(),
        // redemptionCode: redemption?.redemptionCode ?? null,   // <-- handy top-level field
        redemption: redemption
          ? {
              id: redemption.id,
              redemptionCode: redemption.redemptionCode,
              isRedeemed: redemption.isRedeemed,
              isVerified: redemption.isVerified,
              redeemedAt: redemption.redeemedAt,
              rejectionReason: redemption.rejectionReason,
            }
          : null,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
