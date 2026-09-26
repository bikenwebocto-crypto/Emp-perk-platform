import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCompanyAdmin } from '../helpers'

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export async function GET(request: NextRequest) {
  try {
    const { company } = await getCompanyAdmin()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const dateFrom = from ? startOfDay(new Date(from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const dateTo = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date()

    const where = {
      companyId: company.id,
      redeemedAt: { gte: dateFrom, lte: dateTo },
    }

    const [redemptionAgg, totalSavings, activeEmployees, offerAgg, merchantAgg, trend] = await Promise.all([
      prisma.redemption.aggregate({
        where,
        _count: { _all: true },
        _sum: { discountAmount: true, savingsAmount: true },
      }),
      prisma.redemption.aggregate({
        where: { companyId: company.id },
        _sum: { savingsAmount: true },
      }),
      prisma.employee.count({
        where: { companyId: company.id, status: 'ACTIVE', deletedAt: null },
      }),
      prisma.redemption.groupBy({
        by: ['offerId'],
        where,
        _count: { _all: true },
        _sum: { savingsAmount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.redemption.groupBy({
        by: ['merchantId'],
        where,
        _count: { _all: true },
        _sum: { savingsAmount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.$queryRaw<{ date: string; total: number }[]>`
        SELECT DATE("redeemedAt") as date, COUNT(*)::int as total
        FROM "redemptions"
        WHERE "companyId" = ${company.id}::uuid
          AND "redeemedAt" >= ${dateFrom} AND "redeemedAt" <= ${dateTo}
        GROUP BY DATE("redeemedAt")
        ORDER BY DATE("redeemedAt") ASC
      `.catch(() => [] as { date: string; total: number }[]),
    ])

    const offerIds = offerAgg.map((o) => o.offerId)
    const merchantIds = merchantAgg.map((m) => m.merchantId)
    const [offerMeta, merchantMeta] = await Promise.all([
      offerIds.length
        ? prisma.merchantOffer.findMany({
            where: { id: { in: offerIds } },
            select: { id: true, title: true },
          })
        : [],
      merchantIds.length
        ? prisma.merchant.findMany({
            where: { id: { in: merchantIds } },
            select: { id: true, businessName: true, logoUrl: true },
          })
        : [],
    ])
    const offerMap = new Map(offerMeta.map((o) => [o.id, o]))
    const merchantMap = new Map(merchantMeta.map((m) => [m.id, m]))

    return NextResponse.json({
      success: true,
      data: {
        period: { from: dateFrom, to: dateTo },
        summary: {
          totalRedemptions: redemptionAgg._count._all,
          totalDiscount: Number(redemptionAgg._sum.discountAmount ?? 0),
          totalSavings: Number(redemptionAgg._sum.savingsAmount ?? 0),
          allTimeSavings: Number(totalSavings._sum.savingsAmount ?? 0),
          activeEmployees,
        },
        topOffers: offerAgg.map((o) => ({
          offerId: o.offerId,
          title: offerMap.get(o.offerId)?.title ?? 'Unknown',
          redemptions: o._count._all,
          totalSavings: Number(o._sum.savingsAmount ?? 0),
        })),
        topMerchants: merchantAgg.map((m) => ({
          merchantId: m.merchantId,
          businessName: merchantMap.get(m.merchantId)?.businessName ?? 'Unknown',
          logoUrl: merchantMap.get(m.merchantId)?.logoUrl ?? null,
          redemptions: m._count._all,
          totalSavings: Number(m._sum.savingsAmount ?? 0),
        })),
        usageTrend: trend,
      },
    })
  } catch (error) {
    console.error('Company analytics error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
