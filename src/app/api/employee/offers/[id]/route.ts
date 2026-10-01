import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession, unauthorized, internalError, companyInactive, notFound, badRequest } from '@/lib/employee-session'
import { isOfferVisibleToEmployees } from '@/lib/offer-visibility'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)
    const { id } = await params

    const offer = await prisma.merchantOffer.findFirst({
      where: { id, deletedAt: null },
      include: {
        content: { select: { description: true, shortDescription: true, termsAndConditions: true, imageUrls: true } },
        pricing: { select: { configuration: true } },
        redemption: { select: { redemptionType: true, configuration: true, daysOfWeek: true } },
        capacity: { select: { maxRedemptions: true, redeemedCount: true } },
        merchant: {
          include: {
            category: { select: { id: true, name: true, icon: true } },
            branches: { where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true, name: true, branchType: true, isActive: true, addressLine1: true, city: true, state: true } },
          },
        },
      },
    })
    if (!offer) return notFound('Offer not found')

    const pricingConfig = (offer.pricing?.configuration as Record<string, unknown>) ?? {}
    const redemptionConfig = (offer.redemption?.configuration as Record<string, unknown>) ?? {}

    const visibility = await isOfferVisibleToEmployees(id)
    const [saved, redeemed] = await Promise.all([
      prisma.notificationEvent.findFirst({
        where: { employeeId: employee.id, referenceType: 'saved_offer', referenceId: id },
        select: { id: true },
      }),
      prisma.redemption.findFirst({
        where: { employeeId: employee.id, offerId: id },
        select: { id: true },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        id: offer.id,
        title: offer.title,
        description: offer.content?.description ?? null,
        shortDescription: offer.content?.shortDescription ?? null,
        termsAndConditions: offer.content?.termsAndConditions ?? null,
        imageUrls: offer.content?.imageUrls ?? [],
        offerType: offer.offerType,
        discountValue: pricingConfig.discountValue ?? pricingConfig.amount ?? pricingConfig.percent ?? null,
        discountPercent: (pricingConfig.percent as number | null) ?? null,
        discountMax: (pricingConfig.maximumDiscount as number | null) ?? null,
        minimumSpend: (pricingConfig.minimumSpend as number | null) ?? null,
        redemptionType: offer.redemption?.redemptionType ?? null,
        redemptionInstructions: (redemptionConfig.instructions as string | null) ?? null,
        offerCode: (redemptionConfig.code as string | null) ?? null,
        bookingUrl: (redemptionConfig.bookingUrl as string | null) ?? null,
        qrCodeUrl: (redemptionConfig.qrCodeUrl as string | null) ?? null,
        daysOfWeek: offer.redemption?.daysOfWeek ?? null,
        maxRedemptions: offer.capacity?.maxRedemptions ?? null,
        currentRedemptions: offer.capacity?.redeemedCount ?? 0,
        isFeatured: offer.isFeatured,
        isExclusive: offer.isExclusive,
        startDate: offer.startDate.toISOString(),
        endDate: offer.endDate.toISOString(),
        merchant: offer.merchant,
        isVisible: visibility.visible,
        visibilityReason: visibility.reason,
        isSaved: !!saved,
        isRedeemed: !!redeemed,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
