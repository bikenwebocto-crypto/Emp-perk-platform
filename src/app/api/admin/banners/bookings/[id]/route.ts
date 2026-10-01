import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/api-auth'
import { createAuditLog } from '@/services/audit-log.service'
import { deleteImage } from '@/lib/upload/image'
import { assignFreeSlot } from '@/lib/banner-slots'

function notFound(entity: string) {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message: `${entity} not found` } },
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
  console.error('Admin booking review API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

async function handleReview(
  user: { id: string },
  id: string,
  booking: { status: string },
  body: { status?: string; rejectedReason?: string },
) {
  const { status, rejectedReason } = body

  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    return badRequest('Status must be APPROVED or REJECTED')
  }

  if (booking.status !== 'PENDING') {
    return badRequest('Booking is already processed')
  }

  const updates: Record<string, unknown> = { status }

  if (status === 'APPROVED') {
    updates.approvedBy = user.id
    updates.approvedAt = new Date()
    updates.paid = true
  }

  if (status === 'REJECTED' && rejectedReason) {
    updates.rejectedReason = rejectedReason
  }

  const updated = await prisma.bannerBooking.update({
    where: { id },
    data: updates,
    include: {
      banner: { select: { id: true, name: true, position: true } },
      merchant: { select: { id: true, businessName: true } },
      content: true,
    },
  })

  return NextResponse.json({ success: true, data: updated })
}

async function handleEdit(
  user: { id: string },
  id: string,
  booking: {
    status: string
    bannerId: string
    startDate: Date
    endDate: Date
  },
  body: {
    bannerId?: string
    startDate?: string
    endDate?: string
    slotNumber?: number
    imageUrl?: string
    altText?: string
    redirectUrl?: string
  },
) {
  if (!['PENDING', 'APPROVED'].includes(booking.status)) {
    return badRequest('Only pending or approved bookings can be edited')
  }

  const existing = await prisma.bannerBooking.findUnique({
    where: { id },
    include: { content: true, banner: { select: { slotCount: true } } },
  })
  if (!existing) return notFound('Booking')

  const newBannerId = body.bannerId ?? existing.bannerId
  const newStart = body.startDate ? new Date(body.startDate) : existing.startDate
  const newEnd = body.endDate ? new Date(body.endDate) : existing.endDate

  if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
    return badRequest('Invalid date format')
  }
  if (newStart >= newEnd) return badRequest('End date must be after start date')

  const positionOrDateChanged =
    newBannerId !== existing.bannerId ||
    newStart.getTime() !== existing.startDate.getTime() ||
    newEnd.getTime() !== existing.endDate.getTime()

  const oldValues = {
    bannerId: existing.bannerId,
    slotNumber: existing.slotNumber,
    startDate: existing.startDate,
    endDate: existing.endDate,
    imageUrl: existing.content?.imageUrl ?? null,
    altText: existing.content?.altText ?? null,
    redirectUrl: existing.content?.redirectUrl ?? null,
  }

  if (positionOrDateChanged) {
    const banner = await prisma.banner.findUnique({ where: { id: newBannerId } })
    if (!banner) return badRequest('Banner slot not found')

    try {
      await prisma.$transaction(async (tx) => {
        const assignedSlot = await assignFreeSlot(
          tx,
          newBannerId,
          banner.slotCount,
          newStart,
          newEnd,
          id,
        )

        if (assignedSlot === null) {
          throw new Error(
            `All ${banner.slotCount} slots for ${banner.position} are booked for the requested dates. Please choose different dates or check back later.`,
          )
        }

        await tx.bannerBooking.update({
          where: { id },
          data: {
            bannerId: newBannerId,
            slotNumber: assignedSlot,
            startDate: newStart,
            endDate: newEnd,
          },
        })
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes('slots for')) {
        return badRequest(error.message)
      }
      throw error
    }
  }

  if (existing.content && (body.imageUrl !== undefined || body.altText !== undefined || body.redirectUrl !== undefined)) {
    await prisma.bannerContent.update({
      where: { bookingId: id },
      data: {
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl }),
        ...(body.altText !== undefined && { altText: body.altText || null }),
        ...(body.redirectUrl !== undefined && { redirectUrl: body.redirectUrl || null }),
      },
    })

    if (body.imageUrl !== undefined && existing.content.imageUrl && body.imageUrl !== existing.content.imageUrl) {
      void deleteImage(existing.content.imageUrl, { bucket: 'offer-images' }).catch(() => {})
    }
  }

  const finalBooking = await prisma.bannerBooking.findUnique({
    where: { id },
    include: {
      banner: { select: { id: true, name: true, position: true } },
      merchant: { select: { id: true, businessName: true } },
      content: true,
    },
  })

  void createAuditLog({
    actorType: 'admin',
    actorId: user.id,
    adminId: user.id,
    action: 'BANNER_BOOKING_EDITED',
    entityType: 'BANNER_BOOKING',
    entityId: id,
    metadata: {
      oldValues,
      newValues: {
        bannerId: finalBooking?.bannerId,
        slotNumber: finalBooking?.slotNumber,
        startDate: finalBooking?.startDate,
        endDate: finalBooking?.endDate,
        imageUrl: finalBooking?.content?.imageUrl ?? null,
        altText: finalBooking?.content?.altText ?? null,
        redirectUrl: finalBooking?.content?.redirectUrl ?? null,
      },
    },
  })

  return NextResponse.json({ success: true, data: finalBooking })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireRole(['admin'])
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const { id } = await params
    const booking = await prisma.bannerBooking.findUnique({ where: { id } })
    if (!booking) return notFound('Booking')

    const body = await request.json()
    const { action = 'review', ...rest } = body

    if (action === 'edit') {
      return await handleEdit(user, id, booking, rest)
    }

    return await handleReview(user, id, booking, rest)
  } catch (error) {
    return internalError(error)
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireRole(['admin'])
    if (authResult instanceof NextResponse) return authResult
    const { user } = authResult

    const body = await request.json()
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!reason) return badRequest('reason is required')

    const { id } = await params

    const booking = await prisma.bannerBooking.findFirst({
      where: { id },
      include: { content: true },
    })
    if (!booking) return notFound('Banner booking not found')

    if (booking.status !== 'APPROVED') {
      return badRequest('Only approved bookings can be deleted')
    }

    const imageUrl = booking.content?.imageUrl ?? null

    await prisma.bannerBooking.delete({ where: { id } })
    // BannerContent cascades via onDelete: Cascade — no manual child delete needed.

    void createAuditLog({
      actorType: 'admin',
      actorId: user.id,
      adminId: user.id,
      action: 'BANNER_BOOKING_DELETED',
      entityType: 'BANNER_BOOKING',
      entityId: id,
      metadata: { reason, deletedImageUrl: imageUrl },
    })

    if (imageUrl) {
      void deleteImage(imageUrl, { bucket: 'offer-images' }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return internalError(error)
  }
}
