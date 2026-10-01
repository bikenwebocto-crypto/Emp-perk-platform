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

function internalError(error: unknown) {
  console.error('Banner positions API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()

    const positions = await safeQuery(
      () =>
        prisma.banner.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            position: true,
            pricePerDay: true,
            minDays: true,
            maxDays: true,
            description: true,
          },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        }),
      [],
      { context: 'Banner.findMany:positions-active' },
    )

    return NextResponse.json({ success: true, data: positions })
  } catch (error) {
    return internalError(error)
  }
}
