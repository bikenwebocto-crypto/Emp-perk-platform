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

function notFound(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
    { status: 404 }
  )
}

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message } },
    { status: 400 }
  )
}

function internalError(error: unknown) {
  console.error('Merchant booking update API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') return unauthorized()
    const merchant = await getMerchantFromSession()
    if (!merchant) return notFound('Merchant not found')

    const { id } = await params
    const booking = await prisma.bannerBooking.findUnique({
      where: { id },
      include: { content: true },
    })

    if (!booking) return notFound('Booking not found')
    if (booking.merchantId !== merchant.id) return unauthorized()
    if (booking.status !== 'PENDING') return badRequest('Only pending bookings can be edited')

    const body = await request.json()
    const { imageUrl, altText, redirectUrl } = body

    if (!booking.content) return badRequest('Booking has no content to edit')

    const updatedContent = await prisma.bannerContent.update({
      where: { bookingId: id },
      data: {
        ...(imageUrl !== undefined && { imageUrl }),
        ...(altText !== undefined && { altText: altText || null }),
        ...(redirectUrl !== undefined && { redirectUrl: redirectUrl || null }),
      },
    })

    return NextResponse.json({ success: true, data: updatedContent })
  } catch (error) {
    return internalError(error)
  }
}
