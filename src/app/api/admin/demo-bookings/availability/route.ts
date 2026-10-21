import { NextRequest, NextResponse } from 'next/server'
import { badRequest, internalError } from '@/lib/employee-helpers'
import { requireAdmin } from '@/lib/merchant-suggestions'
import {
  ALLOWED_DURATIONS_MINUTES,
  BUSINESS_TIMEZONE,
  DEFAULT_DURATION_MINUTES,
  isValidDateKey,
} from '@/lib/demo-bookings/availability'
import { getAvailableSlots } from '@/lib/demo-bookings/scheduling.service'

// GET /api/admin/demo-bookings/availability?date=YYYY-MM-DD[&durationMinutes=30]
//
// Admin-only view of the open slots for a business day, used by the reschedule
// picker. Same source of truth as the public availability endpoint; this one is
// authenticated so the admin UI is not subject to the public Origin allowlist.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') ?? ''
    if (!isValidDateKey(date)) {
      return badRequest('Provide a date as YYYY-MM-DD', { date: 'Provide a date as YYYY-MM-DD' })
    }

    const durationParam = searchParams.get('durationMinutes')
    const durationMinutes = durationParam === null ? DEFAULT_DURATION_MINUTES : Number(durationParam)
    if (!(ALLOWED_DURATIONS_MINUTES as readonly number[]).includes(durationMinutes)) {
      return badRequest('Unsupported meeting duration', { durationMinutes: 'Unsupported meeting duration' })
    }

    const slots = await getAvailableSlots(date, durationMinutes)

    return NextResponse.json({
      success: true,
      data: {
        date,
        timezone: BUSINESS_TIMEZONE,
        durationMinutes,
        slots: slots.map((slot) => ({ startsAt: slot.startsAt.toISOString(), endAt: slot.endAt.toISOString() })),
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
