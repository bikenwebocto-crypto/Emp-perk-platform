import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { statusWhere } from '@/lib/redemption-status'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function notFound() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } },
    { status: 404 }
  )
}
function internalError(error: unknown) {
  console.error('Merchant analytics summary API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'BAD_REQUEST', message } },
    { status: 400 }
  )
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 366

function startOfDayUTC(d: Date) {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

/** Parse a YYYY-MM-DD string as a UTC day boundary. Returns null if invalid. */
function parseDayUTC(value: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  if (endOfDay) d.setUTCHours(23, 59, 59, 999)
  return d
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const dateFrom = from ? parseDayUTC(from, false) : startOfDayUTC(new Date(Date.now() - 30 * DAY_MS))
    const dateTo = to ? parseDayUTC(to, true) : new Date()
    if (!dateFrom || !dateTo) return badRequest('Invalid date. Use YYYY-MM-DD.')
    if (dateFrom > dateTo) return badRequest('"From" date must be before "To" date.')
    if (dateTo.getTime() - dateFrom.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      return badRequest(`Date range cannot exceed ${MAX_RANGE_DAYS} days.`)
    }

    // Only count valid redemptions: exclude cancelled and rejected ones.
    const where = {
      merchantId: merchant.id,
      redeemedAt: { gte: dateFrom, lte: dateTo },
      rejectionReason: null,
      OR: [statusWhere('CONFIRMED')!, statusWhere('PENDING')!],
    }

    const [redemptionAgg, offers, branchList, branchRedemptionCounts, offerRedemptionCounts, redemptionDates, dailyViews] =
      await Promise.all([
        prisma.redemption.aggregate({
          where,
          _count: { _all: true },
          _sum: { discountAmount: true, savingsAmount: true },
        }),
        prisma.merchantOffer.findMany({
          where: { merchantId: merchant.id },
          select: { id: true, title: true, status: true, deletedAt: true },
        }),
        prisma.merchantBranch.findMany({
          where: { merchantId: merchant.id, deletedAt: null },
          select: { id: true, name: true, branchType: true },
        }),
        prisma.redemption.groupBy({ by: ['branchId'], where, _count: { _all: true } }),
        prisma.redemption.groupBy({ by: ['offerId'], where, _count: { _all: true } }),
        prisma.redemption.findMany({ where, select: { redeemedAt: true } }),
        // Unique employee views (OfferView) first seen within the period.
        prisma.offerView.groupBy({
          by: ['offerId'],
          where: {
            offer: { merchantId: merchant.id },
            viewedAt: { gte: dateFrom, lte: dateTo },
          },
          _count: { _all: true },
        }),
      ])

    // Views & redemptions per offer, both scoped to the selected period
    const viewMap = new Map(dailyViews.map((d) => [d.offerId, d._count._all]))
    const redemptionMap = new Map(offerRedemptionCounts.map((r) => [r.offerId, r._count._all]))

    const allOfferStats = offers.map((o) => {
      const views = viewMap.get(o.id) ?? 0
      const redemptions = redemptionMap.get(o.id) ?? 0
      return {
        id: o.id,
        title: o.title,
        status: o.status,
        views,
        redemptions,
      }
    })

    // Deleted offers keep their historical views/redemptions above,
    // but must not count toward current offer state.
    const activeOfferList = offers.filter((o) => o.deletedAt === null)
    const totalViews = allOfferStats.reduce((s, o) => s + o.views, 0)
    const liveOffers = activeOfferList.filter((o) => o.status === 'LIVE').length

    const statusCounts: Record<string, number> = {}
    for (const o of activeOfferList) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1
    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({ status, count }))

    const topOffers = allOfferStats
      .filter((o) => o.views > 0 || o.redemptions > 0)
      .sort((a, b) => b.redemptions - a.redemptions || b.views - a.views)
      .slice(0, 5)

    const branchCountMap = new Map(branchRedemptionCounts.map((b) => [b.branchId ?? 'online', b._count._all]))
    const branchPerformance: { id: string; name: string; type: string; redemptions: number }[] = branchList.map((b) => ({
      id: b.id,
      name: b.name,
      type: String(b.branchType),
      redemptions: branchCountMap.get(b.id) ?? 0,
    }))
    const onlineCount = branchCountMap.get('online') ?? 0
    if (onlineCount > 0) {
      branchPerformance.push({ id: 'online', name: 'Online / No branch', type: 'Online', redemptions: onlineCount })
    }
    // Redemptions at branches that were since deleted, so branch totals match the overall total.
    const knownBranchIds = new Set(branchList.map((b) => b.id))
    const removedCount = branchRedemptionCounts
      .filter((b) => b.branchId !== null && !knownBranchIds.has(b.branchId))
      .reduce((s, b) => s + b._count._all, 0)
    if (removedCount > 0) {
      branchPerformance.push({ id: 'removed', name: 'Other / removed branch', type: 'Removed', redemptions: removedCount })
    }
    branchPerformance.sort((a, b) => b.redemptions - a.redemptions)

    // Daily redemption trend (UTC days)
    const trendMap = new Map<string, number>()
    for (const r of redemptionDates) {
      if (!r.redeemedAt) continue
      const key = r.redeemedAt.toISOString().slice(0, 10)
      trendMap.set(key, (trendMap.get(key) ?? 0) + 1)
    }
    const trend = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total }))

    return NextResponse.json({
      success: true,
      data: {
        period: { from: dateFrom, to: dateTo },
        summary: {
          totalRedemptions: redemptionAgg._count._all,
          totalViews,
          totalDiscount: Number(redemptionAgg._sum.discountAmount ?? 0),
          totalSavings: Number(redemptionAgg._sum.savingsAmount ?? 0),
          allTimeRedemptions: merchant.totalRedemptions,
          allTimeSavings: Number(merchant.totalSavings),
          liveOffers,
        },
        topOffers,
        statusDistribution,
        branchPerformance,
        branchCount: branchList.length,
        redemptionTrend: trend,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
