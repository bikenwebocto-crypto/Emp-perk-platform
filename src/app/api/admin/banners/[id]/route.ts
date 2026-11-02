import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import {
  daysUntilBannerExpiry,
  daysUntilBannerStart,
  getBannerAvailability,
} from '@/features/banners/utils/banner-availability'
import { formatBannerDate } from '@/features/banners/utils/format-date'
import type { BannerSlotOccupancy } from '@/features/banners/types/banner'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}

function notFound(entity: string) {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: `${entity} not found` } },
    { status: 404 }
  )
}

function internalError(error: unknown) {
  console.error('Admin banner API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

/**
 * GET /api/admin/banners/:id
 *
 * Returns the banner plus the derived availability status and per-slot
 * occupancy, so the details UI does not have to reconstruct any of it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()

    const { id } = await params
    const banner = await prisma.banner.findUnique({ where: { id } })

    if (!banner) return notFound('Banner')

    const liveBookings = await prisma.bannerBooking.findMany({
      where: {
        bannerId: id,
        status: { in: ['PENDING', 'APPROVED'] },
        endDate: { gte: new Date() },
        slotNumber: { not: null },
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        slotNumber: true,
        startDate: true,
        endDate: true,
        status: true,
        merchant: { select: { businessName: true } },
      },
    })

    const now = new Date()

    const slots: BannerSlotOccupancy[] = Array.from(
      { length: banner.slotCount },
      (_, i) => {
        const slotNumber = i + 1
        // There is no BannerSlot table — slots are the virtual numbers
        // 1..slotCount, and "booked" simply means a live booking uses this number.
        const bookings = liveBookings.filter((b) => b.slotNumber === slotNumber)
        const bookedUntil = bookings.reduce<Date | null>(
          (latest, b) => (!latest || b.endDate > latest ? b.endDate : latest),
          null,
        )

        return {
          slotNumber,
          status: bookings.length > 0 ? 'BOOKED' : 'AVAILABLE',
          bookedUntil: bookedUntil ? bookedUntil.toISOString() : null,
          bookings: bookings.map((b) => ({
            id: b.id,
            merchantName: b.merchant.businessName,
            startDate: b.startDate.toISOString(),
            endDate: b.endDate.toISOString(),
            status: b.status,
          })),
        }
      },
    )

    return NextResponse.json({
      success: true,
      data: {
        ...banner,
        availabilityStatus: getBannerAvailability(banner, now),
        daysUntilStart: daysUntilBannerStart(banner, now),
        daysUntilExpiry: daysUntilBannerExpiry(banner, now),
        slots,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()

    const { id } = await params
    const existing = await prisma.banner.findUnique({ where: { id } })
    if (!existing) return notFound('Banner')

    const body = await request.json()
    const allowedFields: string[] = ['name', 'description', 'position', 'displayOrder', 'pricePerDay', 'minDays', 'maxDays', 'isActive', 'startDate', 'expiresAt']
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = field === 'pricePerDay'
          ? parseFloat(body[field])
          : field === 'displayOrder'
            ? parseInt(body[field])
            : (field === 'expiresAt' || field === 'startDate')
              ? (body[field] ? new Date(body[field]) : null)
              : body[field]
      }
    }

    for (const field of ['startDate', 'expiresAt'] as const) {
      if (updates[field] && Number.isNaN((updates[field] as Date).getTime())) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION', message: `${field} must be a valid date (YYYY-MM-DD)` } },
          { status: 400 }
        )
      }
    }

    const effectiveStartDate =
      updates.startDate !== undefined ? (updates.startDate as Date | null) : existing.startDate
    const effectiveExpiresAt =
      updates.expiresAt !== undefined ? (updates.expiresAt as Date | null) : existing.expiresAt

    if (effectiveStartDate && effectiveExpiresAt && effectiveStartDate > effectiveExpiresAt) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: `Start date (${formatBannerDate(effectiveStartDate)}) must be on or before the expiry date (${formatBannerDate(effectiveExpiresAt)}).`,
          },
        },
        { status: 400 },
      )
    }

    if (updates.pricePerDay !== undefined) {
      const otherSlotsPrice = await prisma.banner.findFirst({
        where: { position: existing.position, id: { not: id }, isActive: true },
        select: { pricePerDay: true },
      })
      if (otherSlotsPrice && Number(otherSlotsPrice.pricePerDay) !== Number(updates.pricePerDay)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'PRICE_MISMATCH',
              message: `This would create a price mismatch with other slots in "${existing.position}". Update all slots together, or contact support.`,
            },
          },
          { status: 422 },
        )
      }
    }

    if (updates.expiresAt !== undefined && updates.expiresAt !== null) {
      const conflictingBooking = await prisma.bannerBooking.findFirst({
        where: {
          bannerId: id,
          status: 'APPROVED',
          endDate: { gt: updates.expiresAt as Date },
        },
        select: { id: true, merchantId: true, endDate: true },
      })
      if (conflictingBooking) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXPIRY_CONFLICT',
              message: `This slot has an approved booking running until ${new Date(conflictingBooking.endDate).toLocaleDateString()}, which is after the requested expiry date. Choose a later expiry date, or wait until the booking ends.`,
            },
          },
          { status: 422 },
        )
      }
    }

    // Moving the campaign start later would strand bookings that begin before
    // the banner is even available. Mirrors the expiry conflict rule above.
    if (updates.startDate !== undefined && updates.startDate !== null) {
      const conflictingBooking = await prisma.bannerBooking.findFirst({
        where: {
          bannerId: id,
          status: 'APPROVED',
          startDate: { lt: updates.startDate as Date },
        },
        select: { id: true, merchantId: true, startDate: true },
      })
      if (conflictingBooking) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'START_CONFLICT',
              message: `This banner has an approved booking starting on ${formatBannerDate(conflictingBooking.startDate)}, which is before the requested start date. Choose an earlier start date, or cancel that booking first.`,
            },
          },
          { status: 422 },
        )
      }
    }

    const effectiveMinDays = updates.minDays !== undefined ? Number(updates.minDays) : existing.minDays
    const effectiveMaxDays = updates.maxDays !== undefined ? Number(updates.maxDays) : existing.maxDays
    if (effectiveMaxDays < effectiveMinDays) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: `Max days (${effectiveMaxDays}) cannot be less than min days (${effectiveMinDays}).`,
          },
        },
        { status: 400 },
      )
    }

    const banner = await prisma.banner.update({
      where: { id },
      data: updates,
    })

    return NextResponse.json({ success: true, data: banner })
  } catch (error) {
    return internalError(error)
  }
}
