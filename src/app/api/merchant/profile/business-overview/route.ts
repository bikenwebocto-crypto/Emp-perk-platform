import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'
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
  console.error('Merchant business-overview API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  )
}

/**
 * GET /api/merchant/profile/business-overview
 *
 * Dedicated metrics endpoint for the merchant's own Business Overview
 * (redemptions & revenue, offer capacity, offer expiry, banner bookings).
 * Kept separate from GET /api/merchant/profile so the base profile route
 * stays lean — this call is batched (single Promise.all) and cached
 * independently on the client.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound()

    const overview = await getMerchantBusinessOverview(merchant.id)
    return NextResponse.json({ success: true, data: overview })
  } catch (error) {
    return internalError(error)
  }
}
