import { NextRequest, NextResponse } from 'next/server'
import type { DemoBookingStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { badRequest, internalError } from '@/lib/employee-helpers'
import { parsePagination, requireAdmin } from '@/lib/merchant-suggestions'
import { DEMO_BOOKING_STATUSES, isDemoBookingStatus } from '@/lib/demo-bookings/status'

const LEAD_SELECT = {
  id: true,
  type: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  companyName: true,
} as const

// GET /api/admin/demo-bookings
//
// The admin view of incoming demo requests. Query: status, q (reference, name,
// email, company), page, pageSize (max 100). Rows are ordered by meeting time
// ascending so the list reads like the schedule. meta.counts holds per-status
// totals for the current search (ignoring the status filter) for the stage bar.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { searchParams } = new URL(request.url)
    const { page, pageSize, skip } = parsePagination(searchParams, 100)
    const rawStatus = searchParams.get('status')
    const q = searchParams.get('q')?.trim()

    if (rawStatus && rawStatus !== 'ALL' && !isDemoBookingStatus(rawStatus)) {
      return badRequest('Invalid status filter')
    }
    const status = isDemoBookingStatus(rawStatus) ? rawStatus : null

    const searchWhere: Prisma.DemoBookingWhereInput = q
      ? {
          OR: [
            { reference: { contains: q, mode: 'insensitive' } },
            { lead: { firstName: { contains: q, mode: 'insensitive' } } },
            { lead: { lastName: { contains: q, mode: 'insensitive' } } },
            { lead: { email: { contains: q, mode: 'insensitive' } } },
            { lead: { companyName: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}

    const where: Prisma.DemoBookingWhereInput = status ? { ...searchWhere, status } : searchWhere

    const [rows, total, grouped] = await Promise.all([
      prisma.demoBooking.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          reference: true,
          status: true,
          startsAt: true,
          durationMinutes: true,
          timezone: true,
          createdAt: true,
          lead: { select: LEAD_SELECT },
        },
      }),
      prisma.demoBooking.count({ where }),
      prisma.demoBooking.groupBy({
        by: ['status'],
        where: searchWhere,
        _count: { _all: true },
      }),
    ])

    const counts = Object.fromEntries(
      DEMO_BOOKING_STATUSES.map((s) => [s, 0]),
    ) as Record<DemoBookingStatus, number>
    for (const g of grouped) counts[g.status] = g._count._all

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        counts,
      },
    })
  } catch (error) {
    return internalError(error)
  }
}
