import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  internalError,
  notFound,
  badRequest,
} from '@/lib/employee-helpers'
import { getAuthenticatedMobileEmployee } from '@/lib/mobile-auth'
import { createAuditLog } from '@/services/audit-log.service'

// POST /api/mobile/offers/[id]/save
// DELETE /api/mobile/offers/[id]/save
//
// Save/unsave an offer for the authenticated employee. Mirrors the web
// `/api/employee/saved` contract exactly — a `NotificationEvent` with
// `referenceType: 'saved_offer'` is the source of truth, and
// `OfferAnalytics.saveCount` is incremented/decremented on the way in/out
// so the home feed's "Most Popular" section can rank by it.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response
    const { id } = await params
    if (!id) return badRequest('Offer id is required')

    const offer = await prisma.merchantOffer.findUnique({ where: { id } })
    if (!offer) return notFound('Offer not found')

    const existing = await prisma.notificationEvent.findFirst({
      where: {
        employeeId: auth.employee.id,
        referenceType: 'saved_offer',
        referenceId: id,
      },
    })
    if (existing) {
      return NextResponse.json({ success: true, data: { id: existing.id }, message: 'Already saved' })
    }

    const saved = await prisma.notificationEvent.create({
      data: {
        recipientType: 'EMPLOYEE',
        employeeId: auth.employee.id,
        title: `Saved: ${offer.title}`,
        body: `You saved "${offer.title}".`,
        channel: 'IN_APP',
        priority: 'LOW',
        referenceType: 'saved_offer',
        referenceId: id,
        isRead: true,
      },
    })

    await prisma.offerAnalytics.update({
      where: { offerId: id },
      data: { saveCount: { increment: 1 } },
    })

    await createAuditLog({
      actorType: 'employee',
      actorId: auth.employee.id,
      action: 'OFFER_SAVED',
      entityType: 'merchantOffer',
      entityId: id,
      metadata: { loginSource: 'mobile' },
    })

    return NextResponse.json({ success: true, data: { id: saved.id } }, { status: 201 })
  } catch (error) {
    return internalError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await getAuthenticatedMobileEmployee(request)
    if (!auth.ok) return auth.response
    const { id } = await params

    const existing = await prisma.notificationEvent.findFirst({
      where: {
        employeeId: auth.employee.id,
        referenceType: 'saved_offer',
        referenceId: id,
      },
    })
    if (!existing) return notFound('Saved offer not found')

    await prisma.notificationEvent.delete({ where: { id: existing.id } })

    await prisma.offerAnalytics.update({
      where: { offerId: id },
      data: { saveCount: { decrement: 1 } },
    }).catch(() => null)

    await createAuditLog({
      actorType: 'employee',
      actorId: auth.employee.id,
      action: 'OFFER_UNSAVED',
      entityType: 'merchantOffer',
      entityId: id,
      metadata: { loginSource: 'mobile' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return internalError(error)
  }
}
