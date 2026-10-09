import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession, unauthorized, internalError, companyInactive, notFound, badRequest } from '@/lib/employee-session'
import { effectiveOfferStatus } from '@/lib/offer-visibility'
import { triggerOfferExpiry } from '@/lib/offer-expiry-trigger'

export async function GET(_request: NextRequest) {
  try {
    triggerOfferExpiry() // background, never awaited
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)

    const saved = await prisma.notificationEvent.findMany({
      where: {
        employeeId: employee.id,
        referenceType: 'saved_offer',
      },
      orderBy: { createdAt: 'desc' },
    })

    const offerIds = saved
      .map((s) => s.referenceId)
      .filter((id): id is string => !!id)

    const offers = offerIds.length
      ? await prisma.merchantOffer.findMany({
          where: { id: { in: offerIds }, deletedAt: null },
          include: {
            content: { select: { description: true, shortDescription: true, imageUrls: true } },
            pricing: { select: { configuration: true } },
            redemption: { select: { redemptionType: true } },
            merchant: {
              select: {
                id: true,
                businessName: true,
                logoUrl: true,
                averageRating: true,
                city: true,
                state: true,
              },
            },
          },
        })
      : []

    const now = new Date()
    const offerMap = new Map(offers.map((o) => {
      const pricingConfig = (o.pricing?.configuration as Record<string, unknown>) ?? {}
      const status = effectiveOfferStatus(o.status, o.endDate, now)
      return [o.id, {
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
        isFeatured: o.isFeatured,
        isExclusive: o.isExclusive,
        endDate: o.endDate,
        startDate: o.startDate,
        status,
        isExpired: status === 'EXPIRED',
        // RedeemModal enables Redeem only when isVisible; the redeem route
        // still re-checks merchant/branch rules.
        isVisible: status === 'LIVE' && o.startDate <= now,
        merchant: o.merchant,
      }]
    }))
    const result = saved
      .map((s) => {
        const offer = s.referenceId ? offerMap.get(s.referenceId) : null
        if (!offer) return null
        return {
          savedAt: s.createdAt,
          notificationId: s.id,
          offer,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return internalError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)
    const body = await request.json()
    const offerId: string | undefined = body?.offerId
    if (!offerId) return badRequest('offerId is required')

    const offer = await prisma.merchantOffer.findFirst({ where: { id: offerId, deletedAt: null } })
    if (!offer) return notFound('Offer not found')

    const existing = await prisma.notificationEvent.findFirst({
      where: {
        employeeId: employee.id,
        referenceType: 'saved_offer',
        referenceId: offerId,
      },
    })
    if (existing) {
      return NextResponse.json({ success: true, data: { id: existing.id }, message: 'Already saved' })
    }

    const saved = await prisma.notificationEvent.create({
      data: {
        recipientType: 'EMPLOYEE',
        employeeId: employee.id,
        title: `Saved: ${offer.title}`,
        body: `You saved "${offer.title}".`,
        channel: 'IN_APP',
        priority: 'LOW',
        referenceType: 'saved_offer',
        referenceId: offerId,
        isRead: true,
      },
    })

    await prisma.offerAnalytics.update({
      where: { offerId },
      data: { saveCount: { increment: 1 } },
    })

    return NextResponse.json({ success: true, data: { id: saved.id } }, { status: 201 })
  } catch (error) {
    return internalError(error)
  }
}
