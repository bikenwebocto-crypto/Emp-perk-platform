import { NextRequest, NextResponse } from 'next/server'
import { badRequest, internalError } from '@/lib/employee-helpers'
import { requireAdmin } from '@/lib/merchant-suggestions'
import { prisma } from '@/lib/prisma'
import { BUSINESS_TIMEZONE, isValidDateKey, toBusinessWallClock } from '@/lib/demo-bookings/availability'
import { getDayCalendar } from '@/lib/demo-bookings/scheduling.service'

// GET /api/admin/demo-bookings/calendar[?date=YYYY-MM-DD]
//
// Without `date`, returns the next business day that has an open booking
// (today if none); the chosen day is echoed back in `data.date`.
//
// Admin-only day view: every open (non-cancelled) booking on a business day,
// ordered by time, with `overlapsWith` listing the references of any other
// booking it clashes with. Requests for a held time are accepted as PENDING,
// so this is where the admin spots clashes and reschedules one of them.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    // No date → open on the next day that actually has a meeting (else today),
    // so the admin does not land on an empty calendar.
    let date = new URL(request.url).searchParams.get('date') ?? ''
    if (!date) {
      const next = await prisma.demoBooking.findFirst({
        where: { status: { not: 'CANCELLED' }, startsAt: { gte: new Date() } },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true },
      })
      date = toBusinessWallClock(next?.startsAt ?? new Date()).dateKey
    }
    if (!isValidDateKey(date)) {
      return badRequest('Provide a date as YYYY-MM-DD', { date: 'Provide a date as YYYY-MM-DD' })
    }

    const bookings = await getDayCalendar(date)

    return NextResponse.json({
      success: true,
      data: {
        date,
        timezone: BUSINESS_TIMEZONE,
        bookings: bookings.map((b) => ({ ...b, startsAt: b.startsAt.toISOString() })),
        conflictCount: bookings.filter((b) => b.overlapsWith.length > 0).length,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
