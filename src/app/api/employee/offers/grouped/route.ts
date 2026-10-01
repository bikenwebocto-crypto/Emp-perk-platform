import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession, unauthorized, internalError, companyInactive } from '@/lib/employee-session'
import { mapOfferRow } from '@/services/offer-mapper.service'
import { safeQuery } from '@/lib/prisma/safe-query'

export async function GET(_request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)
    console.log('** employee', employee)
    const now = new Date()

    // --- NEW: resolve a safe city filter, falling back to company city ---
    let effectiveCity = employee.city ?? null
    if (!effectiveCity && employee.companyId) {
      const company = await safeQuery(
        () =>
          prisma.company.findUnique({
            where: { id: employee.companyId },
            select: { city: true },
          }),
        null,
        { context: 'Company.findUnique:offers-grouped-city-fallback' },
      )
      effectiveCity = company?.city ?? null
    }
    // If still null, city filter is omitted below instead of passing `null`
    // into Prisma (which throws a validation error on a required String field).
    // --- END NEW ---

    const [bannerRows, categories, offerRows] = await Promise.all([
      safeQuery(
        () =>
          prisma.bannerBooking.findMany({
            where: {
              status: 'APPROVED',
              paid: true,
              startDate: { lte: now },
              endDate: { gte: now },
              banner: {
                isActive: true,
                OR: [
                  { expiresAt: null },
                  { expiresAt: { gt: now } },
                ],
              },
            },
            include: {
              content: true,
              banner: { select: { name: true, position: true } },
              merchant: { select: { businessName: true } },
            },
            orderBy: { banner: { displayOrder: 'asc' } },
          }),
        [],
        { context: 'BannerBooking.findMany:offers-grouped' },
      ),
      safeQuery(
        () =>
          prisma.category.findMany({
            where: { isActive: true },
            orderBy: { displayOrder: 'asc' },
            select: { id: true, name: true, icon: true },
          }),
        [],
        { context: 'Category.findMany:offers-grouped' },
      ),
      prisma.merchantOffer.findMany({
        where: {
          status: 'LIVE',
          startDate: { lte: now },
          endDate: { gt: now },
          merchant: {
            status: 'ACTIVE',
            deletedAt: null,
            branches: {
              some: {
                isActive: true,
                status: 'ACTIVE',
                deletedAt: null,
                // CHANGED: was `city: employee.city` (threw when null)
                ...(effectiveCity ? { city: effectiveCity } : {}),
              },
            },
          },
        },
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          offerType: true,
          isFeatured: true,
          isExclusive: true,
          endDate: true,
          startDate: true,
          status: true,
          deletedAt: true,
          content: {
            select: {
              description: true,
              shortDescription: true,
              termsAndConditions: true,
              imageUrls: true,
            },
          },
          pricing: {
            select: { configuration: true },
          },
          redemption: {
            select: {
              redemptionType: true,
              configuration: true,
              daysOfWeek: true,
            },
          },
          capacity: {
            select: {
              maxRedemptions: true,
              redeemedCount: true,
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
              status: true,
              deletedAt: true,
              description: true,
              category: { select: { id: true, name: true, icon: true } },
              branches: {
                where: { deletedAt: null, status: 'ACTIVE' },
                select: {
                  id: true,
                  name: true,
                  branchType: true,
                  isActive: true,
                  status: true,
                  addressLine1: true,
                  city: true,
                  state: true,
                },
                orderBy: { isPrimary: 'desc' },
              },
            },
          },
        },
      }),
    ])

    const banners = bannerRows.map((row) => ({
      id: row.id,
      image_url: row.content?.imageUrl,
      alt_text: row.content?.altText,
      redirect_url: row.content?.redirectUrl,
      business_name: row.merchant?.businessName,
      banner_name: row.banner?.name,
      position: row.banner?.position,
    }))

    const totalOfferIds = offerRows.map((o) => o.id)
    const [saved, redeemed] = await Promise.all([
      totalOfferIds.length
        ? prisma.notificationEvent.findMany({
            where: {
              employeeId: employee.id,
              referenceType: 'saved_offer',
              referenceId: { in: totalOfferIds },
            },
            select: { referenceId: true },
          })
        : Promise.resolve([]),
      totalOfferIds.length
        ? prisma.redemption.findMany({
            where: { employeeId: employee.id, offerId: { in: totalOfferIds } },
            select: { offerId: true },
          })
        : Promise.resolve([]),
    ])
    const savedSet = new Set(saved.map((s) => s.referenceId).filter(Boolean) as string[])
    const redeemedSet = new Set(redeemed.map((r) => r.offerId).filter(Boolean) as string[])

    const grouped = new Map<string, typeof offerRows>()
    const uncategorized: typeof offerRows = []
    for (const offer of offerRows) {
      const cat = offer.merchant.category
      if (!cat) {
        if (uncategorized.length < 6) uncategorized.push(offer)
        continue
      }
      if (!grouped.has(cat.id)) grouped.set(cat.id, [])
      const list = grouped.get(cat.id)!
      if (list.length < 6) list.push(offer)
    }

    const categorySection = [
      ...categories
        .filter((c) => grouped.has(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          offers: (grouped.get(c.id) ?? []).map((o) =>
            mapOfferRow(o as any, now, savedSet, redeemedSet),
          ),
        })),
      ...(uncategorized.length > 0
        ? [
            {
              id: 'uncategorized',
              name: 'All Offers',
              icon: null,
              offers: uncategorized.map((o) =>
                mapOfferRow(o as any, now, savedSet, redeemedSet),
              ),
            },
          ]
        : []),
    ]

    return NextResponse.json({
      success: true,
      data: { banners, categories: categorySection },
    })
  } catch (error) {
    return internalError(error)
  }
}