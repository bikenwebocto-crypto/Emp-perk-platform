import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/api-auth'

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
  console.error('Admin banner slots API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['admin'])
    if (authResult instanceof NextResponse) return authResult

    const { searchParams } = new URL(request.url)
    const bannerId = searchParams.get('bannerId')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const excludeBookingId = searchParams.get('excludeBookingId') ?? undefined

    if (!bannerId || !startDate || !endDate) {
      return badRequest('bannerId, startDate, and endDate are required')
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return badRequest('Invalid date format')
    }

    const banner = await prisma.banner.findUnique({ where: { id: bannerId } })
    if (!banner) return notFound('Banner slot not found')

    const conflicting = await prisma.bannerBooking.findMany({
      where: {
        bannerId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lt: end },
        endDate: { gt: start },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: { slotNumber: true },
    })

    const takenSlots = new Set(conflicting.map((b) => b.slotNumber))

    const slots = Array.from({ length: banner.slotCount }, (_, i) => {
      const slotNumber = i + 1
      return { slotNumber, available: !takenSlots.has(slotNumber) }
    })

    return NextResponse.json({
      success: true,
      data: {
        bannerId: banner.id,
        position: banner.position,
        slotCount: banner.slotCount,
        slots,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
