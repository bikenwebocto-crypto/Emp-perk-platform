import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import {
  toMerchantDashboardRow,
  type MerchantOfferStats,
  type MerchantEngagement,
  type MerchantRelations,
} from '@/features/merchants/lib/merchant-dashboard'
import type {
  MerchantDashboardResponse,
  MerchantDashboardSummary,
  MerchantHealth,
  MerchantStatus,
} from '@/types'
import { createPerfTimer } from '@/lib/perf'

// ============================================================================
// Helpers
// ============================================================================

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 },
  )
}

function internalError(error: unknown) {
  console.error('Merchant dashboard error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  )
}

const VALID_STATUSES: MerchantStatus[] = [
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'SUSPENDED',
  'ARCHIVED',
  'REJECTED',
]

const VALID_HEALTH: MerchantHealth[] = ['HEALTHY', 'WARNING', 'CRITICAL']

const VALID_SORTS = [
  'priority',
  'createdAt',
  'status',
  'redemptions',
  'views',
  'lastActivity',
] as const

// ============================================================================
// GET /api/admin/merchants/dashboard
// ============================================================================

export async function GET(request: NextRequest) {
  const timer = createPerfTimer('GET /api/admin/merchants/dashboard')
  timer.section('Authentication')
  try {
    const user = await getCurrentUser(timer)
    timer.point('user auth check')
    if (!user || user.userType !== 'admin') return unauthorized()

    const sp = new URL(request.url).searchParams
    const status = sp.get('status')
    const categoryId = sp.get('categoryId') || undefined
    const city = sp.get('city') || undefined
    const featuredParam = sp.get('featured')
    const homepageParam = sp.get('homepage')
    const healthParam = sp.get('health')
    const hasLiveOffersParam = sp.get('hasLiveOffers')
    const hasPendingOffersParam = sp.get('hasPendingOffers')
    const priorityMinParam = sp.get('priorityMin')
    const q = sp.get('q') || undefined
    const sortBy = sp.get('sortBy') ?? 'priority'
    const sortDir = (sp.get('sortDir') ?? 'desc') as 'asc' | 'desc'
    const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '20')))

    const where: any = { deletedAt: null }
    if (status && status !== 'ALL' && VALID_STATUSES.includes(status as MerchantStatus)) where.status = status
    if (categoryId && categoryId !== 'ALL') where.categoryId = categoryId
    if (city) where.city = { equals: city, mode: 'insensitive' }
    if (featuredParam === 'true') where.isFeatured = true
    if (featuredParam === 'false') where.isFeatured = false
    if (homepageParam === 'true') where.isHomepageMerchant = true
    if (homepageParam === 'false') where.isHomepageMerchant = false
    if (priorityMinParam) { const min = parseInt(priorityMinParam); if (!Number.isNaN(min)) where.displayPriority = { gte: min } }
    if (hasLiveOffersParam === 'true') where.offers = { some: { status: 'LIVE', deletedAt: null } }
    if (hasPendingOffersParam === 'true') where.offers = { some: { status: { in: ['AWAITING_APPROVAL', 'PENDING_APPROVAL', 'VALIDATION_IN_PROGRESS'] }, deletedAt: null } }
    if (q) {
      const matchingAccounts = await prisma.account.findMany({
        where: { email: { contains: q, mode: 'insensitive' }, profileType: 'MERCHANT' },
        select: { authUserId: true },
      })
      const accountAuthUserIds = matchingAccounts.map((a) => a.authUserId).filter(Boolean)
      where.OR = [{ businessName: { contains: q, mode: 'insensitive' } }, { contactName: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }]
      if (accountAuthUserIds.length > 0) where.OR.push({ accountId: { in: accountAuthUserIds } })
    }

    const orderBy: any[] = []
    if (sortBy === 'priority' || (VALID_SORTS as readonly string[]).includes(sortBy) === false) orderBy.push({ displayPriority: sortDir })
    else if (sortBy === 'createdAt') orderBy.push({ createdAt: sortDir })
    else if (sortBy === 'redemptions') orderBy.push({ totalRedemptions: sortDir })
    else if (sortBy === 'status') orderBy.push({ status: sortDir })
    else if (sortBy === 'lastActivity') orderBy.push({ updatedAt: sortDir })
    orderBy.push({ createdAt: 'desc' })

    timer.section('Database Queries')
    timer.point('merchant.findMany + count')
    const [merchantsRaw, total] = await Promise.all([
      prisma.merchant.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: {
        category: { select: { id: true, name: true, slug: true } },
        account: { select: { email: true } },
        _count: { select: { offers: true, branches: true, redemptions: true, issues: true } },
      } }),
      prisma.merchant.count({ where }),
    ])

    const merchantIds = merchantsRaw.map((m) => m.id)
    if (merchantIds.length === 0) {
      timer.section('Serialization')
      timer.point('NextResponse.json')
      timer.end()
      return NextResponse.json({
        success: true, data: [], summary: { totalMerchants: 0, pendingApproval: 0, featured: 0, homepageMerchants: 0, liveOffers: 0, pendingOffers: 0, todaysRedemptions: 0, thisMonthRedemptions: 0 },
        meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasNextPage: page * pageSize < total, hasPreviousPage: page > 1 },
      } satisfies MerchantDashboardResponse)
    }

    timer.point('offerStats: merchantOffer.groupBy')
    const offerGroups = await prisma.merchantOffer.groupBy({
      by: ['merchantId', 'status'],
      where: { merchantId: { in: merchantIds }, deletedAt: null },
      _count: { _all: true },
    })
    const offerStatsByMerchant: Record<string, MerchantOfferStats> = {}
    for (const id of merchantIds) offerStatsByMerchant[id] = { live: 0, pending: 0, archived: 0, rejected: 0, draft: 0, total: 0 }
    for (const row of offerGroups) {
      const stats = offerStatsByMerchant[row.merchantId]; if (!stats) continue
      const count = row._count._all; stats.total += count
      if (row.status === 'LIVE') stats.live += count
      else if (['AWAITING_APPROVAL', 'PENDING_APPROVAL', 'VALIDATION_IN_PROGRESS', 'CHANGES_REQUESTED'].includes(row.status)) stats.pending += count
      else if (['ARCHIVED', 'REPLACED', 'EXPIRED'].includes(row.status)) stats.archived += count
      else if (['REJECTED', 'VALIDATION_FAILED'].includes(row.status)) stats.rejected += count
      else if (row.status === 'DRAFT') stats.draft += count
    }

    timer.point('engagement: offerAnalytics.groupBy + offer.findMany')
    const analyticsAgg = await prisma.offerAnalytics.groupBy({
      by: ['offerId'],
      _sum: { viewCount: true, saveCount: true },
      where: { offer: { merchantId: { in: merchantIds }, deletedAt: null } },
    })
    const engagementByMerchant: Record<string, { views: number; saved: number }> = {}
    for (const id of merchantIds) engagementByMerchant[id] = { views: 0, saved: 0 }
    if (analyticsAgg.length > 0) {
      const offerIds = analyticsAgg.map((a) => a.offerId)
      const offers = await prisma.merchantOffer.findMany({ where: { id: { in: offerIds } }, select: { id: true, merchantId: true } })
      const offerToMerchant = new Map(offers.map((o) => [o.id, o.merchantId]))
      for (const row of analyticsAgg) {
        const mId = offerToMerchant.get(row.offerId); if (!mId) continue
        const cur = engagementByMerchant[mId]; if (!cur) continue
        cur.views += Number(row._sum.viewCount ?? 0); cur.saved += Number(row._sum.saveCount ?? 0)
      }
    }

    timer.point('openIssues: issueReport.groupBy')
    const openIssueGroups = await prisma.issueReport.groupBy({
      by: ['merchantId'],
      where: { merchantId: { in: merchantIds }, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      _count: { _all: true },
    })
    const openIssuesByMerchant: Record<string, number> = {}
    for (const id of merchantIds) openIssuesByMerchant[id] = 0
    for (const row of openIssueGroups) openIssuesByMerchant[row.merchantId] = (row._count as any)._all ?? 0

    timer.point('redemptionGroups: redemption.groupBy')
    const redemptionGroups = await prisma.redemption.groupBy({
      by: ['merchantId', 'companyId', 'employeeId'],
      where: { merchantId: { in: merchantIds } },
      _count: { _all: true },
    })
    const companiesByMerchant: Record<string, Set<string>> = {}
    const employeesByMerchant: Record<string, Set<string>> = {}
    for (const id of merchantIds) { companiesByMerchant[id] = new Set(); employeesByMerchant[id] = new Set() }
    for (const row of redemptionGroups) {
      if (row.companyId) companiesByMerchant[row.merchantId]?.add(row.companyId)
      if (row.employeeId) employeesByMerchant[row.merchantId]?.add(row.employeeId)
    }

    timer.point('lastActivity: offer.findMany + redemption.findMany')
    const lastOfferPerMerchant = await prisma.merchantOffer.findMany({
      where: { merchantId: { in: merchantIds }, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: { merchantId: true, updatedAt: true },
    })
    const lastOfferAtByMerchant: Record<string, Date | null> = {}
    for (const id of merchantIds) lastOfferAtByMerchant[id] = null
    for (const o of lastOfferPerMerchant) {
      if (!lastOfferAtByMerchant[o.merchantId] || o.updatedAt > lastOfferAtByMerchant[o.merchantId]!) lastOfferAtByMerchant[o.merchantId] = o.updatedAt
    }
    const lastRedemptions = await prisma.redemption.findMany({
      where: { merchantId: { in: merchantIds } },
      orderBy: { redeemedAt: 'desc' },
      select: { merchantId: true, redeemedAt: true },
      take: merchantIds.length * 3,
    })
    const lastRedemptionAtByMerchant: Record<string, Date | null> = {}
    for (const id of merchantIds) lastRedemptionAtByMerchant[id] = null
    for (const r of lastRedemptions) {
      if (!r.redeemedAt) continue
      if (!lastRedemptionAtByMerchant[r.merchantId] || r.redeemedAt > lastRedemptionAtByMerchant[r.merchantId]!) lastRedemptionAtByMerchant[r.merchantId] = r.redeemedAt
    }

    timer.point('row assembly + health filter')
    const rows = merchantsRaw.map((m) => {
      const views = engagementByMerchant[m.id]?.views ?? 0
      const saved = engagementByMerchant[m.id]?.saved ?? 0
      const redeemed = m._count.redemptions
      const conversion = views > 0 ? (redeemed / views) * 100 : null
      const offerStats: MerchantOfferStats = offerStatsByMerchant[m.id] ?? { live: 0, pending: 0, archived: 0, rejected: 0, draft: 0, total: 0 }
      const engagement: MerchantEngagement = { views, saved, redeemed, conversion }
      const relations: MerchantRelations = { companies: companiesByMerchant[m.id]?.size ?? 0, employees: employeesByMerchant[m.id]?.size ?? 0, branches: m._count.branches, issueReports: m._count.issues, openIssues: openIssuesByMerchant[m.id] ?? 0 }
      const candidates: Date[] = []
      if (lastOfferAtByMerchant[m.id]) candidates.push(lastOfferAtByMerchant[m.id]!)
      if (lastRedemptionAtByMerchant[m.id]) candidates.push(lastRedemptionAtByMerchant[m.id]!)
      candidates.push(m.updatedAt)
      return toMerchantDashboardRow({ ...m, offerStats, engagement, relations, lastActivityAt: candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : m.updatedAt })
    })
    let filteredRows = rows
    if (healthParam && healthParam !== 'ALL' && VALID_HEALTH.includes(healthParam as MerchantHealth)) filteredRows = filteredRows.filter((r) => r.health === healthParam)

    timer.point('summary counts (6 parallel queries + 1 sequential)')
    const todayStartDate = new Date(new Date().setHours(0, 0, 0, 0))
    const monthStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const [pendingApprovalCount, featuredCount, homepageCount, globalOfferStats, todayCount, monthCount] = await Promise.all([
      prisma.merchant.count({ where: { deletedAt: null, status: 'PENDING' } }),
      prisma.merchant.count({ where: { deletedAt: null, isFeatured: true } }),
      prisma.merchant.count({ where: { deletedAt: null, isHomepageMerchant: true } }),
      prisma.merchantOffer.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.redemption.count({ where: { redeemedAt: { gte: todayStartDate } } }),
      prisma.redemption.count({ where: { redeemedAt: { gte: monthStartDate } } }),
    ])
    const liveOffers = globalOfferStats.filter((g) => g.status === 'LIVE').reduce((sum, g) => sum + g._count._all, 0)
    const pendingOffers = globalOfferStats.filter((g) => ['AWAITING_APPROVAL', 'PENDING_APPROVAL', 'VALIDATION_IN_PROGRESS', 'CHANGES_REQUESTED'].includes(g.status)).reduce((sum, g) => sum + g._count._all, 0)
    timer.point('merchant.count (totalMerchants)')
    const summary: MerchantDashboardSummary = {
      totalMerchants: await prisma.merchant.count({ where: { deletedAt: null } }),
      pendingApproval: pendingApprovalCount, featured: featuredCount, homepageMerchants: homepageCount,
      liveOffers, pendingOffers, todaysRedemptions: todayCount, thisMonthRedemptions: monthCount,
    }

    timer.section('Serialization')
    timer.point('NextResponse.json')
    timer.end()
    return NextResponse.json({
      success: true, data: filteredRows, summary,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize), hasNextPage: page * pageSize < total, hasPreviousPage: page > 1 },
    } satisfies MerchantDashboardResponse)
  } catch (error) {
    timer.end()
    return internalError(error)
  }
}
