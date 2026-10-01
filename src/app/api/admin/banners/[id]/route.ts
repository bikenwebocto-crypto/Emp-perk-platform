import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'

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
  console.error('Admin banner update API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'admin') return unauthorized()

    const { id } = await params
    const existing = await prisma.banner.findUnique({ where: { id } })
    if (!existing) return notFound('Banner')

    const body = await request.json()
    const allowedFields: string[] = ['name', 'description', 'position', 'displayOrder', 'pricePerDay', 'minDays', 'maxDays', 'isActive', 'expiresAt']
    const updates: Record<string, unknown> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = field === 'pricePerDay' ? parseFloat(body[field]) : field === 'displayOrder' ? parseInt(body[field]) : field === 'expiresAt' ? (body[field] ? new Date(body[field]) : null) : body[field]
      }
    }

    if (updates.pricePerDay !== undefined) {
      const otherSlotsPrice = await prisma.banner.findFirst({
        where: { position: existing.position, id: { not: id }, isActive: true },
        select: { pricePerDay: true },
      })
      if (otherSlotsPrice && Number(otherSlotsPrice.pricePerDay) !== Number(updates.pricePerDay)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'PRICE_MISMATCH',
              message: `This would create a price mismatch with other slots in "${existing.position}". Update all slots together, or contact support.`,
            },
          },
          { status: 422 },
        )
      }
    }

    if (updates.expiresAt !== undefined && updates.expiresAt !== null) {
      const conflictingBooking = await prisma.bannerBooking.findFirst({
        where: {
          bannerId: id,
          status: 'APPROVED',
          endDate: { gt: updates.expiresAt as Date },
        },
        select: { id: true, merchantId: true, endDate: true },
      })
      if (conflictingBooking) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'EXPIRY_CONFLICT',
              message: `This slot has an approved booking running until ${new Date(conflictingBooking.endDate).toLocaleDateString()}, which is after the requested expiry date. Choose a later expiry date, or wait until the booking ends.`,
            },
          },
          { status: 422 },
        )
      }
    }

    const effectiveMinDays = updates.minDays !== undefined ? Number(updates.minDays) : existing.minDays
    const effectiveMaxDays = updates.maxDays !== undefined ? Number(updates.maxDays) : existing.maxDays
    if (effectiveMaxDays < effectiveMinDays) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION',
            message: `Max days (${effectiveMaxDays}) cannot be less than min days (${effectiveMinDays}).`,
          },
        },
        { status: 400 },
      )
    }

    const banner = await prisma.banner.update({
      where: { id },
      data: updates,
    })

    return NextResponse.json({ success: true, data: banner })
  } catch (error) {
    return internalError(error)
  }
}
