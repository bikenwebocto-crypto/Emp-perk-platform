import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
import { calcConversionRate } from '@/lib/analytics/conversion'

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
  console.error('Merchant analytics trends API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

function parseDays(value: string | null): number {
  const n = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(n)) return 30
  return Math.min(365, Math.max(1, n))
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const { searchParams } = new URL(request.url)
    const days = parseDays(searchParams.get('days'))

    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - days)
    dateFrom.setHours(0, 0, 0, 0)

    const offerIds = await prisma.merchantOffer.findMany({
      where: { merchantId: merchant.id },
      select: { id: true },
    })

    if (offerIds.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const trends = await prisma.dailyOfferAnalytics.groupBy({
      by: ['date'],
      where: {
        offerId: { in: offerIds.map((o) => o.id) },
        date: { gte: dateFrom },
      },
      _sum: { views: true, redemptions: true, revenueGenerated: true },
      // removed: _avg: { conversionRate: true }  ← averaging percentages is wrong
      orderBy: { date: 'asc' },
    })

    const data = trends.map((t) => {
      const views = t._sum.views ?? 0
      const redemptions = t._sum.redemptions ?? 0
      return {
        date: t.date,
        views,
        redemptions,
        revenueGenerated: Number(t._sum.revenueGenerated ?? 0),
        conversionRate: calcConversionRate(redemptions, views), // sum ÷ sum
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return internalError(error)
  }
}