import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantBusinessOverview } from '@/lib/merchant-performance'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 },
  )
}

function notFound() {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } },
    { status: 404 },
  )
}

function internalError(error: unknown) {
  console.error('Admin merchant business-overview API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  )
}

/**
 * GET /api/admin/merchants/[id]/business-overview
 *
 * Dedicated metrics endpoint backing the Business Overview section on the
 * admin merchant detail page. Same shared service as the merchant's own
 * overview — batched queries, cached independently on the client.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()

    const { id } = await params
    const merchant = await prisma.merchant.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    })
    if (!merchant || merchant.deletedAt) return notFound()

    const overview = await getMerchantBusinessOverview(id)
    return NextResponse.json({ success: true, data: overview })
  } catch (error) {
    return internalError(error)
  }
}
