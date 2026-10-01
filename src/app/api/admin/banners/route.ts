import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { safeQuery } from '@/lib/prisma/safe-query'

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
  console.error('Admin banners API error:', error)
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

    const [banners, total] = await Promise.all([
      safeQuery(
        () =>
          prisma.banner.findMany({
            orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { _count: { select: { bookings: true } } },
          }),
        [],
        { context: 'Banner.findMany:admin-list' },
      ),
      safeQuery(() => prisma.banner.count(), 0, { context: 'Banner.count:admin-list' }),
    ])

    const now = Date.now()
    const bannersWithExpiry = banners.map((banner) => ({
      ...banner,
      daysUntilExpiry: banner.expiresAt
        ? Math.ceil((new Date(banner.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24))
        : null,
    }))

  return NextResponse.json({
      success: true,
      data: bannersWithExpiry,
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

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()

    const body = await request.json()
    const { name, position, pricePerDay, minDays, maxDays, slotCount, expiresAt, displayOrder } = body

    if (!position || pricePerDay === undefined || !slotCount) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'position, pricePerDay, and slotCount are required' } },
        { status: 400 }
      )
    }

    const parsedSlotCount = parseInt(slotCount)
    if (!Number.isInteger(parsedSlotCount) || parsedSlotCount < 1 || parsedSlotCount > 20) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION', message: 'slotCount must be a whole number between 1 and 20' } },
        { status: 400 }
      )
    }

    const parsedMinDays = minDays !== undefined ? parseInt(minDays) : 7
    const parsedMaxDays = maxDays !== undefined ? parseInt(maxDays) : 30

    if (parsedMaxDays < parsedMinDays) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: `Max days (${parsedMaxDays}) cannot be less than min days (${parsedMinDays}).`,
          },
        },
        { status: 400 },
      )
    }

    // One Banner row now represents an entire position (its capacity lives in
    // slotCount), so a position should have at most one active row.
    const existingSamePosition = await prisma.banner.findFirst({
      where: { position, isActive: true },
      select: { id: true, pricePerDay: true },
    })

    if (existingSamePosition) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'POSITION_EXISTS',
            message: `An active banner already exists for the "${position}" position (id: ${existingSamePosition.id}). Edit its slot count instead of creating a new one.`,
          },
        },
        { status: 422 },
      )
    }

    const banner = await prisma.banner.create({
      data: {
        name: name || `${position} Slots`,
        position,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : 0,
        pricePerDay: parseFloat(pricePerDay),
        slotCount: parsedSlotCount,
        minDays: parsedMinDays,
        maxDays: parsedMaxDays,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    return NextResponse.json({ success: true, data: banner }, { status: 201 })
  } catch (error) {
    return internalError(error)
  }
}
