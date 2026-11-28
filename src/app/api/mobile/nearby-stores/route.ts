import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { internalError, badRequest } from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { haversineKm } from '@/lib/distance'
import { getVisibleScope } from '@/lib/offers/visible-merchants'

const DEFAULT_RADIUS_KM = 10

interface NearbyBranch {
  merchantId: string
  merchantName: string
  merchantLogo: string | null
  category: string | null

  branchId: string
  branchName: string

  address: string
  city: string
  state: string | null
  postalCode: string
  country: string

  latitude: number
  longitude: number

  distance: number
}

// GET /api/mobile/nearby-stores
//
// Returns active merchant branches near the employee's current GPS
// coordinates, sorted by nearest distance. Accepts only latitude,
// longitude (required) and an optional radius (km, default 10).
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)

    const latRaw = searchParams.get('latitude')
    const lngRaw = searchParams.get('longitude')
    const radiusRaw = searchParams.get('radius')

    if (!latRaw || !lngRaw) {
      return badRequest('latitude and longitude are required')
    }

    const latitude = Number(latRaw)
    const longitude = Number(lngRaw)
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return badRequest('latitude must be between -90 and 90')
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return badRequest('longitude must be between -180 and 180')
    }

    let radiusKm = DEFAULT_RADIUS_KM
    if (radiusRaw) {
      radiusKm = Number(radiusRaw)
      if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
        return badRequest('radius must be greater than 0')
      }
    }

    const branches = await prisma.merchantBranch.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        status: 'ACTIVE',
        latitude: { not: null },
        longitude: { not: null },
        // Only branches covered by the merchant's LIVE Evergreen (one-perk rule).
        id: { in: (await getVisibleScope()).branchIds },
        merchant: { is: { status: 'ACTIVE', deletedAt: null } },
      },
      include: {
        merchant: {
          select: {
            businessName: true,
            logoUrl: true,
            category: { select: { name: true } },
          },
        },
      },
    })

    const nearby: NearbyBranch[] = []
    for (const b of branches) {
      const lat = Number(b.latitude)
      const lng = Number(b.longitude)
      const distance = haversineKm(latitude, longitude, lat, lng)
      if (distance > radiusKm) continue

      nearby.push({
        merchantId: b.merchantId,
        merchantName: b.merchant.businessName,
        merchantLogo: b.merchant.logoUrl ?? null,
        category: b.merchant.category?.name ?? null,

        branchId: b.id,
        branchName: b.name,

        address: [b.addressLine1, b.addressLine2].filter(Boolean).join(', '),
        city: b.city,
        state: b.state ?? null,
        postalCode: b.postalCode,
        country: b.country,

        latitude: lat,
        longitude: lng,

        distance: Math.round(distance * 100) / 100,
      })
    }

    nearby.sort((a, b) => a.distance - b.distance)

    return NextResponse.json({ success: true, data: nearby })
  } catch (error) {
    return internalError(error)
  }
}
