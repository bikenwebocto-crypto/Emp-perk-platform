import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { requireRole } from '@/lib/api-auth'
import { createAuditLog } from '@/services/audit-log.service'
import { assignFreeSlot } from '@/lib/banner-slots'
import { getBannerAvailability } from '@/features/banners/utils/banner-availability'
import { formatBannerDate } from '@/features/banners/utils/format-date'

function badRequest(message: string, status = 400) {
  return NextResponse.json(
    { success: false, error: { code: status === 409 ? 'CONFLICT' : 'VALIDATION', message } },
    { status }
  )
}

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}

function internalError(error: unknown) {
  console.error('Admin bookings list API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20')))
    const status = searchParams.get('status') ?? undefined

    const where: Record<string, unknown> = {}
    if (status) where.status = status

    const [bookings, total] = await Promise.all([
      prisma.bannerBooking.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          banner: { select: { id: true, name: true, position: true } },
          merchant: { select: { id: true, businessName: true } },
          content: { select: { imageUrl: true, altText: true, redirectUrl: true } },
        },
      }),
      prisma.bannerBooking.count({ where: where as any }),
    ])

    return NextResponse.json({
      success: true,
      data: bookings,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}

/**
 * POST /api/admin/banners/bookings
 *
 * Admin places a banner for a merchant. Merchants cannot book banners in V1,
 * so there is no approval step: the booking is created APPROVED (live).
 * Body (JSON): bannerId, merchantId, startDate, endDate, imageUrl,
 * altText?, redirectUrl?, totalPrice?
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(['admin'])
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult
    if (!user.profileId) return badRequest('Admin profile not found')

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return badRequest('Invalid request body')

    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const bannerId = str(body.bannerId)
    const merchantId = str(body.merchantId)
    const imageUrl = str(body.imageUrl)
    const altText = str(body.altText) || null
    const redirectUrl = str(body.redirectUrl) || null
    const totalPrice =
      body.totalPrice != null && body.totalPrice !== '' ? Number(body.totalPrice) : 0

    if (!bannerId || !merchantId || !body.startDate || !body.endDate) {
      return badRequest('bannerId, merchantId, startDate and endDate are required')
    }
    if (!imageUrl) return badRequest('Banner image is required')
    if (!Number.isFinite(totalPrice) || totalPrice < 0) return badRequest('Invalid price')
    if (redirectUrl && !/^https?:\/\//i.test(redirectUrl) && !redirectUrl.startsWith('/')) {
      return badRequest('Redirect URL must start with http(s):// or /')
    }

    const start = new Date(body.startDate)
    const end = new Date(body.endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return badRequest('Invalid date format')
    if (start >= end) return badRequest('End date must be after start date')

    const [banner, merchant] = await Promise.all([
      prisma.banner.findUnique({ where: { id: bannerId } }),
      prisma.merchant.findFirst({
        where: { id: merchantId, deletedAt: null },
        select: { id: true, status: true },
      }),
    ])
    if (!banner) return badRequest('Banner slot not found')
    if (!merchant) return badRequest('Merchant not found')
    if (merchant.status !== 'ACTIVE') return badRequest('Merchant must be active to place a banner')

    // Admin may schedule ahead, so SCHEDULED positions are allowed too.
    const availability = getBannerAvailability(banner, new Date())
    if (availability === 'EXPIRED') return badRequest('Banner slot has expired')
    if (availability !== 'ACTIVE' && availability !== 'SCHEDULED') {
      return badRequest('Banner slot is not active')
    }
    if (banner.startDate && start < banner.startDate) {
      return badRequest(`Banner cannot start before the slot opens (${formatBannerDate(banner.startDate)})`)
    }
    if (banner.expiresAt && end > banner.expiresAt) {
      return badRequest(`Banner cannot run past slot expiry (${formatBannerDate(banner.expiresAt)})`)
    }

    let created
    try {
      created = await prisma.$transaction(async (tx) => {
        const slotNumber = await assignFreeSlot(tx, bannerId, banner.slotCount, start, end)
        if (slotNumber === null) {
          throw new Error(
            `All ${banner.slotCount} slots for ${banner.position} are booked for the requested dates. Please choose different dates.`,
          )
        }

        const booking = await tx.bannerBooking.create({
          data: {
            bannerId,
            merchantId,
            slotNumber,
            startDate: start,
            endDate: end,
            totalPrice,
            status: 'APPROVED',
            paid: true,
            approvedBy: user.profileId,
            approvedAt: new Date(),
            content: { create: { imageUrl, altText, redirectUrl } },
          },
          include: {
            banner: { select: { id: true, name: true, position: true } },
            merchant: { select: { id: true, businessName: true } },
            content: true,
          },
        })

        await createAuditLog({
          actorType: 'admin',
          actorId: user.profileId,
          adminId: user.profileId,
          action: 'BANNER_BOOKING_CREATED',
          entityType: 'BANNER_BOOKING',
          entityId: booking.id,
          metadata: { merchantId, bannerId, slotNumber, startDate: start, endDate: end, imageUrl, redirectUrl },
        }, tx)

        return booking
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('slots for')) {
        return badRequest(error.message, 409)
      }
      throw error
    }

    return NextResponse.json({ success: true, data: created }, { status: 201 })
  } catch (error) {
    return internalError(error)
  }
}
