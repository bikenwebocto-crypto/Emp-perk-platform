import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}

function notFound(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
    { status: 404 }
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message } },
    { status: 400 }
  )
}

function internalError(error: unknown) {
  console.error('Merchant banner slots API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound('Merchant not found')

    const { searchParams } = new URL(request.url)
    const position = searchParams.get('position')
    if (!position) return badRequest('position is required')

    const now = new Date()

    const banner = await prisma.banner.findFirst({
      where: {
        position,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    })

    if (!banner) return notFound('No active banner slot for this position')

    // Only bookings with a real slotNumber matter here — legacy rows
    // created before this column existed will have slotNumber: null and
    // are intentionally excluded from availability display.
    const activeBookings = await prisma.bannerBooking.findMany({
      where: {
        bannerId: banner.id,
        status: { in: ['PENDING', 'APPROVED'] },
        endDate: { gte: now },
        slotNumber: { not: null },
      },
      orderBy: { startDate: 'asc' },
      include: {
        merchant: { select: { businessName: true } },
        content: { select: { imageUrl: true, altText: true, redirectUrl: true } },
      },
    })

    const slots = Array.from({ length: banner.slotCount }, (_, i) => {
      const slotNumber = i + 1
      const slotBookings = activeBookings.filter((b) => b.slotNumber === slotNumber)

      // "Occupied today" = a booking on this slot covering the current
      // moment, for the card's cosmetic status label only.
      const currentBooking = slotBookings.find(
        (b) => b.startDate <= now && b.endDate >= now,
      )

      const mappedBookings = slotBookings.map((b) => ({
        startDate: b.startDate,
        endDate: b.endDate,
        status: b.status as 'PENDING' | 'APPROVED',
        isOwnBooking: b.merchantId === merchant.id,
      }))

      if (!currentBooking) {
        return { slotNumber, status: 'AVAILABLE' as const, bookings: mappedBookings }
      }

      return {
        slotNumber,
        status: currentBooking.status as 'PENDING' | 'APPROVED',
        bookingId: currentBooking.id,
        startDate: currentBooking.startDate,
        bookedUntil: currentBooking.endDate,
        merchantName: currentBooking.merchant.businessName,
        isOwnBooking: currentBooking.merchantId === merchant.id,
        content: currentBooking.content,
        bookings: mappedBookings,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        bannerId: banner.id,
        position: banner.position,
        pricePerDay: banner.pricePerDay,
        minDays: banner.minDays,
        maxDays: banner.maxDays,
        slotCount: banner.slotCount,
        availableCount: slots.filter((s) => s.status === 'AVAILABLE').length,
        slots,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}