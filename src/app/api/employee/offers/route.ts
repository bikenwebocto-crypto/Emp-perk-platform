import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getEmployeeFromSession, unauthorized, internalError, companyInactive, notFound, badRequest } from '@/lib/employee-session'
import { mapOfferRow } from '@/services/offer-mapper.service'
import { safeQuery } from '@/lib/prisma/safe-query'

export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession()
    if (!employee) return unauthorized()
    if ('inactive' in employee) return companyInactive(employee.companyStatus)

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? undefined
    const categoryId = searchParams.get('categoryId') ?? undefined
    const featured = searchParams.get('featured') === 'true'
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')))

    const now = new Date()
    const where: any = {
      status: 'LIVE',
      startDate: { lte: now },
      endDate: { gt: now },
      merchant: {
        status: 'ACTIVE',
        deletedAt: null,
        branches: { some: { isActive: true, status: 'ACTIVE', deletedAt: null } },
      },
    }
    if (categoryId) where.categoryId = categoryId
    if (featured) where.isFeatured = true
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
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
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
            select: {
              configuration: true,
            },
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
      prisma.merchantOffer.count({ where }),
    ])

    const offerIds = rows.map((o) => o.id)
    const bannerRows = await safeQuery(
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
      { context: 'BannerBooking.findMany:employee-offers' },
    )
    const banners = bannerRows.map((row) => ({
      id: row.id,
      image_url: row.content?.imageUrl,
      alt_text: row.content?.altText,
      redirect_url: row.content?.redirectUrl,
      business_name: row.merchant?.businessName,
      banner_name: row.banner?.name,
      position: row.banner?.position,
    }))
    const [saved, redeemed] = await Promise.all([
      offerIds.length
        ? prisma.notificationEvent.findMany({
            where: {
              employeeId: employee.id,
              referenceType: 'saved_offer',
              referenceId: { in: offerIds },
            },
            select: { referenceId: true },
          })
        : Promise.resolve([]),
      offerIds.length
        ? prisma.redemption.findMany({
            where: { employeeId: employee.id, offerId: { in: offerIds } },
            select: { offerId: true },
          })
        : Promise.resolve([]),
    ])
    const savedSet = new Set(saved.map((s) => s.referenceId).filter(Boolean) as string[])
    const redeemedSet = new Set(redeemed.map((r) => r.offerId).filter(Boolean) as string[])

    const data = rows.map((o) => mapOfferRow(o as any, now, savedSet, redeemedSet))

    return NextResponse.json({
      success: true,
      data,
      banners,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    return internalError(error)
  }
}
