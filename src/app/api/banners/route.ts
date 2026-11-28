import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { safeQuery } from '@/lib/prisma/safe-query'
import { getCurrentUser } from '@/lib/supabase/server'

function internalError(error: unknown) {
  console.error('Banners list API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function GET(_request: NextRequest) {
  try {
    // Banners are admin-managed in V1; the employee feed uses /api/employee/banners.
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 }
      )
    }

    const banners = await safeQuery(
      () =>
        prisma.banner.findMany({
          where: { isActive: true },
          select: { id: true, name: true, position: true, description: true },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        }),
      [],
      { context: 'Banner.findMany:public-active' },
    )

    return NextResponse.json({ success: true, data: banners })
  } catch (error) {
    return internalError(error)
  }
}
