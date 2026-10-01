import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMerchantFromSession } from '@/lib/merchant-session'
import {
  deriveStatus,
  decodeMethod,
  type RedemptionStatus,
  type RedemptionMethod,
} from '@/lib/redemption-status'
import { deriveCapacityStatus } from '@/lib/redemption-tracking'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function internalError(error: unknown) {
  console.error('Merchant redemptions API error:', error)
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

function endOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export async function GET(request: NextRequest) {
  try {
    // ─────────────────────────────────────────────
    // Authentication — single call only.
    // getMerchantFromSession() is assumed to already
    // validate userType === 'merchant' internally.
    // If it doesn't, keep the getCurrentUser() check
    // above it as before — see note below.
    // ─────────────────────────────────────────────
    const merchant = await getMerchantFromSession()

    if (!merchant) {
      return unauthorized()
    }

    // ─────────────────────────────────────────────
    // Query parameters
    // ─────────────────────────────────────────────
    const { searchParams } = new URL(request.url)

    const rawPage = Number(searchParams.get('page') ?? '1')
    const rawPageSize = Number(searchParams.get('pageSize') ?? '25')

    const page = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1

    const pageSize = Number.isFinite(rawPageSize)
      ? Math.min(100, Math.max(1, Math.floor(rawPageSize)))
      : 25

    const offerId = searchParams.get('offerId') ?? undefined
    const branchId = searchParams.get('branchId') ?? undefined
    const companyId = searchParams.get('companyId') ?? undefined
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const q = searchParams.get('q')?.trim() || undefined

    // Only run the 5 extra metric/aggregate queries when explicitly requested.
    const includeMetrics = searchParams.get('includeMetrics') === 'true'

    // ─────────────────────────────────────────────
    // Build redemption filter
    // ─────────────────────────────────────────────
    const where: any = {
      merchantId: merchant.id,
    }

    if (offerId) {
      where.offerId = offerId
    }

    if (branchId) {
      where.branchId = branchId
    }

    if (companyId) {
      where.companyId = companyId
    }

    // ─────────────────────────────────────────────
    // Date validation
    // ─────────────────────────────────────────────
    if (from || to) {
      where.redeemedAt = {}

      if (from) {
        const fromDate = new Date(from)

        if (Number.isNaN(fromDate.getTime())) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'BAD_REQUEST',
                message: 'Invalid "from" date',
              },
            },
            { status: 400 }
          )
        }

        where.redeemedAt.gte = startOfDay(fromDate)
      }

      if (to) {
        const toDate = new Date(to)

        if (Number.isNaN(toDate.getTime())) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'BAD_REQUEST',
                message: 'Invalid "to" date',
              },
            },
            { status: 400 }
          )
        }

        where.redeemedAt.lte = endOfDay(toDate)
      }
    }

    // ─────────────────────────────────────────────
    // Search
    // ─────────────────────────────────────────────
    if (q) {
      where.OR = [
        {
          redemptionCode: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          employee: {
            firstName: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },
        {
          employee: {
            lastName: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },
        {
          company: {
            name: {
              contains: q,
              mode: 'insensitive',
            },
          },
        },
      ]
    }

    // ─────────────────────────────────────────────
    // Date ranges for metrics
    // ─────────────────────────────────────────────
    const now = new Date()

    const todayStart = startOfDay(now)

    const weekStart = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    )

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    )

    // ─────────────────────────────────────────────
    // Main queries
    // ─────────────────────────────────────────────
    const [
      rows,
      total,
      todayCount,
      weekCount,
      monthCount,
      offerAgg,
      branchAgg,
    ] = await Promise.all([
      // ───────────────────────────────────────────
      // Redemption rows
      // ───────────────────────────────────────────
      prisma.redemption.findMany({
        where,
        orderBy: {
          redeemedAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,

        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },

          company: {
            select: {
              id: true,
              name: true,
            },
          },

          offer: {
            select: {
              id: true,
              title: true,
              offerType: true,

              pricing: {
                select: {
                  configuration: true,
                },
              },

              redemption: {
                select: {
                  redemptionType: true,
                },
              },

              capacity: {
                select: {
                  maxRedemptions: true,
                  redeemedCount: true,
                },
              },
            },
          },
        },
      }),

      // ───────────────────────────────────────────
      // Total matching records
      // ───────────────────────────────────────────
      prisma.redemption.count({
        where,
      }),

      // ───────────────────────────────────────────
      // Today — only if metrics requested
      // ───────────────────────────────────────────
      includeMetrics
        ? prisma.redemption.count({
            where: {
              merchantId: merchant.id,
              redeemedAt: {
                gte: todayStart,
              },
            },
          })
        : Promise.resolve(null),

      // ───────────────────────────────────────────
      // Last 7 days — only if metrics requested
      // ───────────────────────────────────────────
      includeMetrics
        ? prisma.redemption.count({
            where: {
              merchantId: merchant.id,
              redeemedAt: {
                gte: weekStart,
              },
            },
          })
        : Promise.resolve(null),

      // ───────────────────────────────────────────
      // Current month — only if metrics requested
      // ───────────────────────────────────────────
      includeMetrics
        ? prisma.redemption.count({
            where: {
              merchantId: merchant.id,
              redeemedAt: {
                gte: monthStart,
              },
            },
          })
        : Promise.resolve(null),

      // ───────────────────────────────────────────
      // Top offers — only if metrics requested
      // ───────────────────────────────────────────
      includeMetrics
        ? prisma.redemption.groupBy({
            by: ['offerId'],
            where: {
              merchantId: merchant.id,
            },
            _count: {
              _all: true,
            },
            _sum: {
              discountAmount: true,
              savingsAmount: true,
            },
            orderBy: {
              _count: {
                id: 'desc',
              },
            },
            take: 5,
          })
        : Promise.resolve([]),

      // ───────────────────────────────────────────
      // Top branches — only if metrics requested
      // ───────────────────────────────────────────
      includeMetrics
        ? prisma.redemption.groupBy({
            by: ['branchId'],
            where: {
              merchantId: merchant.id,
              branchId: {
                not: null,
              },
            },
            _count: {
              _all: true,
            },
            _sum: {
              savingsAmount: true,
            },
            orderBy: {
              _count: {
                id: 'desc',
              },
            },
            take: 5,
          })
        : Promise.resolve([]),
    ])

    // ─────────────────────────────────────────────
    // Resolve top offer / branch metadata
    // (only needed when metrics were requested)
    // ─────────────────────────────────────────────
    let topOffers: any[] = []
    let topBranches: any[] = []

    if (includeMetrics) {
      const topOfferIds = offerAgg.map((item: any) => item.offerId)

      const topBranchIds = branchAgg
        .map((item: any) => item.branchId)
        .filter((id: any): id is string => Boolean(id))

      const [topOfferMeta, topBranchMeta] = await Promise.all([
        topOfferIds.length
          ? prisma.merchantOffer.findMany({
              where: {
                id: {
                  in: topOfferIds,
                },
              },
              select: {
                id: true,
                title: true,
              },
            })
          : Promise.resolve([]),

        topBranchIds.length
          ? prisma.merchantBranch.findMany({
              where: {
                id: {
                  in: topBranchIds,
                },
              },
              select: {
                id: true,
                name: true,
              },
            })
          : Promise.resolve([]),
      ])

      const topOfferMap = new Map(
        topOfferMeta.map((offer) => [offer.id, offer.title])
      )

      topOffers = offerAgg.map((offer: any) => ({
        offerId: offer.offerId,
        title: topOfferMap.get(offer.offerId) ?? 'Unknown',
        redemptions: offer._count._all,
        totalDiscount: Number(offer._sum.discountAmount ?? 0),
        totalSavings: Number(offer._sum.savingsAmount ?? 0),
      }))

      const topBranchMap = new Map(
        topBranchMeta.map((branch) => [branch.id, branch.name])
      )

      topBranches = branchAgg.map((branch: any) => ({
        branchId: branch.branchId,
        name: branch.branchId
          ? topBranchMap.get(branch.branchId) ?? 'Unknown'
          : 'Online',
        redemptions: branch._count._all,
        totalSavings: Number(branch._sum.savingsAmount ?? 0),
      }))
    }

    const metrics = includeMetrics
      ? {
          today: todayCount,
          thisWeek: weekCount,
          thisMonth: monthCount,
          topOffer: topOffers[0] ?? null,
          topBranch: topBranches[0] ?? null,
        }
      : undefined

    // ─────────────────────────────────────────────
    // Empty redemption state
    // ─────────────────────────────────────────────
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        ...(includeMetrics ? { metrics, topOffers, topBranches } : {}),
        meta: {
          page,
          pageSize,
          total,
          totalPages: 0,
        },
      })
    }

    // ─────────────────────────────────────────────
    // Branch information
    // ─────────────────────────────────────────────
    const branchIds = Array.from(
      new Set(
        rows
          .map((row) => row.branchId)
          .filter((branchId): branchId is string => Boolean(branchId))
      )
    )

    const branchList = branchIds.length
      ? await prisma.merchantBranch.findMany({
          where: {
            id: {
              in: branchIds,
            },
          },
          select: {
            id: true,
            name: true,
            branchType: true,
          },
        })
      : []

    const branchMap = new Map(
      branchList.map((branch) => [branch.id, branch])
    )

    // ─────────────────────────────────────────────
    // Add calculated redemption/offer information
    // ─────────────────────────────────────────────
    const rowsWithBranch = rows.map((row) => {
      const offerMax = row.offer.capacity?.maxRedemptions ?? null
      const offerRedeemed = row.offer.capacity?.redeemedCount ?? 0
      const offerRemaining =
        offerMax == null ? null : Math.max(0, offerMax - offerRedeemed)

      const offerCapacityStatus = deriveCapacityStatus(row.offer.capacity ?? null)

      return {
        ...row,

        branch: row.branchId
          ? branchMap.get(row.branchId) ?? null
          : null,

        status: deriveStatus(row) as RedemptionStatus,

        method: decodeMethod(
          row.merchantNotes
        ) as RedemptionMethod | null,

        offerLimit: offerMax,

        offerRedeemed,

        offerRemaining,

        offerCapacityStatus,
      }
    })

    // ─────────────────────────────────────────────
    // Final successful response
    // ─────────────────────────────────────────────
    return NextResponse.json({
      success: true,

      data: rowsWithBranch,

      ...(includeMetrics ? { metrics, topOffers, topBranches } : {}),

      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
