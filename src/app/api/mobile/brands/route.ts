import { notEndedBy } from '@/lib/offers/end-date';
import { getVisibleMerchantIds } from '@/lib/offers/visible-merchants';
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { haversineKm, branchCoordinate as pickBranchCoordinate } from '@/lib/distance'

interface Location {
  latitude: number
  longitude: number
}

// GET /api/mobile/brands
//
// Paginated list of active merchants. Supports text search, category
// filter, and optional lat/lng for distance-aware sorting.
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q') ?? undefined
    const categoryId = searchParams.get('categoryId') ?? undefined
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get('pageSize') ?? '20')))

    const lat = searchParams.get('lat')
    const lng = searchParams.get('lng')
    let location: Location | null = null
    if (lat && lng) {
      const latNum = Number(lat)
      const lngNum = Number(lng)
      if (Number.isFinite(latNum) && Number.isFinite(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
        location = { latitude: latNum, longitude: lngNum }
      }
    }

    const where: Record<string, unknown> = {
      status: 'ACTIVE',
      deletedAt: null,
      // Hidden until the merchant's Evergreen offer is approved and LIVE.
      id: { in: await getVisibleMerchantIds() },
      branches: { some: { isActive: true, status: 'ACTIVE', deletedAt: null } },
    }
    if (categoryId) where.categoryId = categoryId
    if (q) {
      where.businessName = { contains: q, mode: 'insensitive' }
    }

    const [rows, total] = await Promise.all([
      prisma.merchant.findMany({
      where,
      // Overscan 3× so we can re-sort by distance in memory when a
      // location is supplied.
      take: location ? Math.min(150, pageSize * 3) : pageSize,
      skip: location ? 0 : (page - 1) * pageSize,
      orderBy: [{ isFeatured: 'desc' }, { isTopRated: 'desc' }, { businessName: 'asc' }],
      select: {
        id: true,
        businessName: true,
        description: true,
        logoUrl: true,
        coverImageUrl: true,
        averageRating: true,
        totalRedemptions: true,
        isFeatured: true,
        isTopRated: true,
        category: { select: { id: true, name: true, icon: true } },
        branches: {
          where: { deletedAt: null, status: 'ACTIVE' },
          select: { latitude: true, longitude: true, isPrimary: true },
        },
        _count: {
          select: {
            offers: {
              where: {
                status: 'LIVE',
                startDate: { lte: new Date() },
                AND: [notEndedBy(new Date())],
              },
            },
          },
        },
      },
    }),
    prisma.merchant.count({ where }),
  ])

  const enriched = rows.map((m) => {
      const coord = pickBranchCoordinate(m.branches)
      const distance = location && coord
        ? haversineKm(location.latitude, location.longitude, coord.latitude, coord.longitude)
        : null
      const { branches: _branches, ...rest } = m
      void _branches
      return { merchant: rest, distance }
    })

    if (location) {
      enriched.sort((a, b) => {
        if (a.distance != null && b.distance != null) return a.distance - b.distance
        if (a.distance != null) return -1
        if (b.distance != null) return 1
        return 0
      })
    }

    const page2 = location ? enriched.slice(0, pageSize) : enriched

    return NextResponse.json({
      success: true,
      data: page2,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    return internalError(error)
  }
}
