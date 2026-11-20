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

function notFound() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } },
    { status: 404 }
  )
}

function internalError(error: unknown) {
  console.error('Merchant banners API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

// Whitelisted sort fields for merchant banner bookings.
function bookingOrderBy(sortBy: string | null, sortDir: string | null): any {
  const dir = sortDir === 'asc' ? 'asc' : 'desc'
  switch (sortBy) {
    case 'startDate': return { startDate: dir }
    case 'endDate': return { endDate: dir }
    case 'totalPrice': return { totalPrice: dir }
    case 'status': return { status: dir }
    case 'name': return { banner: { name: dir } }
    case 'createdAt': return { createdAt: dir }
    default: return { createdAt: 'desc' }
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20')))
    const status = searchParams.get('status') ?? undefined

    const where: Record<string, unknown> = { merchantId: merchant.id }
    if (status) where.status = status

    const [bookings, total] = await Promise.all([
      prisma.bannerBooking.findMany({
        where: where as any,
        orderBy: bookingOrderBy(searchParams.get('sortBy'), searchParams.get('sortDir')),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          banner: { select: { id: true, name: true, position: true, pricePerDay: true } },
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
