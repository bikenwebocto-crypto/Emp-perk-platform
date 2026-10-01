import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function internalError(error: unknown) {
  console.error('Admin analytics error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const dateFrom = from ? startOfDay(new Date(from)) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const dateTo = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : new Date()

    const where: Prisma.RedemptionWhereInput = {
      redeemedAt: { gte: dateFrom, lte: dateTo },
    }

    const [totalAgg, merchantAgg, companyAgg, trend] = await Promise.all([
      prisma.redemption.aggregate({
        where,
        _count: { _all: true },
        _sum: { discountAmount: true, savingsAmount: true },
      }),
      prisma.redemption.groupBy({
        by: ['merchantId'],
        where,
        _count: { _all: true },
        _sum: { savingsAmount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.redemption.groupBy({
        by: ['companyId'],
        where,
        _count: { _all: true },
        _sum: { savingsAmount: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.$queryRaw<{ date: string; total: number }[]>`
        SELECT DATE("redeemedAt") as date, COUNT(*)::int as total
        FROM "redemptions"
        WHERE "redeemedAt" >= ${dateFrom} AND "redeemedAt" <= ${dateTo}
        GROUP BY DATE("redeemedAt")
        ORDER BY DATE("redeemedAt") ASC
      `.catch(() => [] as { date: string; total: number }[]),
    ])

    const merchantIds = merchantAgg.map((m) => m.merchantId)
    const merchantMeta = merchantIds.length
      ? await prisma.merchant.findMany({
          where: { id: { in: merchantIds } },
          select: { id: true, businessName: true, city: true, state: true, logoUrl: true },
        })
      : []
    const merchantMap = new Map(merchantMeta.map((m) => [m.id, m]))

    const companyIds = companyAgg.map((c) => c.companyId)
    const companyMeta = companyIds.length
      ? await prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: { id: true, name: true },
        })
      : []
    const companyMap = new Map(companyMeta.map((c) => [c.id, c]))

    const byCity = new Map<string, number>()
    for (const m of merchantMeta) {
      const key = [m.city, m.state].filter(Boolean).join(', ') || 'Unknown'
      byCity.set(key, (byCity.get(key) ?? 0) + (merchantAgg.find((x) => x.merchantId === m.id)?._count._all ?? 0))
    }

    const offerAgg = await prisma.redemption.groupBy({
      by: ['offerId'],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take: 50,
    })
    const offerIds = offerAgg.map((o) => o.offerId)
    const offerMeta = offerIds.length
      ? await prisma.merchantOffer.findMany({
          where: { id: { in: offerIds } },
          select: { id: true, title: true, categoryId: true },
        })
      : []
    const offerMap = new Map(offerMeta.map((o) => [o.id, o]))

    const categoryIds = Array.from(
      new Set(offerMeta.map((o) => o.categoryId).filter((c): c is string => !!c))
    )
    const categoryMeta = categoryIds.length
      ? await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : []
    const categoryMap = new Map(categoryMeta.map((c) => [c.id, c.name]))

    const byCategory = new Map<string, { name: string; redemptions: number }>()
    for (const o of offerAgg) {
      const meta = offerMap.get(o.offerId)
      const key = meta?.categoryId ?? 'uncategorized'
      const name = (meta?.categoryId ? categoryMap.get(meta.categoryId) : null) ?? 'Uncategorized'
      const cur = byCategory.get(key) ?? { name, redemptions: 0 }
      cur.redemptions += o._count._all
      byCategory.set(key, cur)
    }

    return NextResponse.json({
      success: true,
      data: {
        period: { from: dateFrom, to: dateTo },
        summary: {
          totalRedemptions: totalAgg._count._all,
          totalDiscount: Number(totalAgg._sum.discountAmount ?? 0),
          totalSavings: Number(totalAgg._sum.savingsAmount ?? 0),
        },
        byMerchant: merchantAgg.map((m) => ({
          merchantId: m.merchantId,
          businessName: merchantMap.get(m.merchantId)?.businessName ?? 'Unknown',
          city: merchantMap.get(m.merchantId)?.city ?? null,
          state: merchantMap.get(m.merchantId)?.state ?? null,
          logoUrl: merchantMap.get(m.merchantId)?.logoUrl ?? null,
          redemptions: m._count._all,
          totalSavings: Number(m._sum.savingsAmount ?? 0),
        })),
        byCompany: companyAgg.map((c) => ({
          companyId: c.companyId,
          name: companyMap.get(c.companyId)?.name ?? 'Unknown',
          redemptions: c._count._all,
          totalSavings: Number(c._sum.savingsAmount ?? 0),
        })),
        byCity: Array.from(byCity.entries())
          .map(([city, redemptions]) => ({ city, redemptions }))
          .sort((a, b) => b.redemptions - a.redemptions),
        byCategory: Array.from(byCategory.values()).sort((a, b) => b.redemptions - a.redemptions),
        redemptionTrend: trend,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
