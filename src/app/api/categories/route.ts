import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { safeQuery } from '@/lib/prisma/safe-query'
import { MERCHANT_APPLICATION_OTHER_OPTION, selectableCategoryWhere } from '@/lib/categories'
import { corsHeaders, isOriginAllowed } from '@/lib/leads/cors'

export function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin || !isOriginAllowed(origin)) return new NextResponse(null, { status: 403 })
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  const headers = { ...corsHeaders(origin), 'Cache-Control': 'no-store' }
  try {
    const categories = await safeQuery(
      () =>
        prisma.category.findMany({
          where: selectableCategoryWhere,
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            icon: true,
          },
        }),
      [],
      { context: 'Category.findMany:public-active' },
    )

    return NextResponse.json(
      { success: true, data: categories, merchantApplicationOtherOption: MERCHANT_APPLICATION_OTHER_OPTION },
      { headers },
    )
  } catch (error) {
    console.error('Categories fetch error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Failed to fetch categories' } },
      { status: 500, headers },
    )
  }
}
