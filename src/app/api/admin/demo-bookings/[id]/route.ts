import { NextRequest, NextResponse } from 'next/server'
import type { DemoBookingStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { badRequest, internalError, notFound } from '@/lib/employee-helpers'
import { requireAdmin } from '@/lib/merchant-suggestions'
import { createAuditLog } from '@/services/audit-log.service'
import { emailService } from '@/lib/email/email'
import {
  renderDemoBookingCancelledTemplate,
  renderDemoBookingConfirmedTemplate,
  renderDemoBookingRescheduledTemplate,
} from '@/emails/templates'
import { parseDemoReschedule } from '@/lib/demo-bookings/schema'
import {
  candidateOverlapWhere,
  findCollisions,
  formatBusinessLocal,
  formatInTimeZone,
} from '@/lib/demo-bookings/availability'
import { changeDemoBookingStatus, rescheduleDemoBooking } from '@/lib/demo-bookings/scheduling.service'
import { DEMO_BOOKING_STATUSES, getAllowedNextStatuses, isDemoBookingStatus } from '@/lib/demo-bookings/status'

function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error: { code, message, ...extra } }, { status })
}

const LEAD_DETAIL_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  companyName: true,
  hearAbout: true,
  message: true,
  consentAt: true,
  createdAt: true,
} as const

async function loadDetail(id: string) {
  const booking = await prisma.demoBooking.findUnique({
    where: { id },
    include: { lead: { select: LEAD_DETAIL_SELECT } },
  })
  if (!booking) return null
  // Other open bookings at the same time — the admin should reschedule one.
  const nearby = await prisma.demoBooking.findMany({
    where: candidateOverlapWhere(booking),
    select: { id: true, reference: true, status: true, startsAt: true, durationMinutes: true },
  })
  const overlaps = booking.status === 'CANCELLED' ? [] : findCollisions(booking, nearby, booking.id)
  return { ...booking, allowedNextStatuses: getAllowedNextStatuses(booking.status), overlaps }
}

// GET /api/admin/demo-bookings/[id]
//
// Booking detail plus allowedNextStatuses so the admin UI knows which actions
// to offer. Times are stored in UTC; the requester's zone is returned as-is.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response

    const { id } = await params
    const detail = await loadDetail(id)
    if (!detail) return notFound('Demo booking not found')

    return NextResponse.json({ success: true, data: detail })
  } catch (error) {
    return internalError(error)
  }
}

// PATCH /api/admin/demo-bookings/[id] — reschedule OR change status.
//
// Body (exactly one kind of change per call):
//   { startsAt, timezone?, durationMinutes? }  — move the meeting
//   { status }                                  — confirm / cancel / complete
//
// Admin-only. A reschedule validates the new time against policy, excludes this
// booking from its own collision check, re-checks availability under the same
// per-day advisory lock as a create, and updates atomically; a slot taken in the
// meantime returns 409 with the current options. A status change is guarded on
// the status we read, so a concurrent change by another admin returns 409. Both
// record the previous and new value in the audit trail, then email the requester
// (best-effort: a mail failure does not undo the change).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return auth.response
    const adminId = auth.user.profileId ?? auth.user.id

    const { id } = await params

    let body: Record<string, unknown>
    try {
      const parsedBody: unknown = await request.json()
      if (!parsedBody || typeof parsedBody !== 'object') return badRequest('Request body must be valid JSON')
      body = parsedBody as Record<string, unknown>
    } catch {
      return badRequest('Request body must be valid JSON')
    }

    const hasStart = body.startsAt !== undefined && body.startsAt !== null
    const hasStatus = body.status !== undefined && body.status !== null

    if (hasStart && hasStatus) {
      return badRequest('Provide either a new time or a new status, not both')
    }

    // Anything without an explicit status is treated as a reschedule, so a
    // missing startsAt surfaces as a field error from the request schema.
    if (hasStatus) return await changeStatus(id, body.status, adminId)
    return await reschedule(id, body, adminId)
  } catch (error) {
    return internalError(error)
  }
}

// ── Status change ────────────────────────────────────────────

async function changeStatus(id: string, rawStatus: unknown, adminId: string) {
  if (!isDemoBookingStatus(rawStatus)) {
    return badRequest('Invalid status', { status: `Status must be one of: ${DEMO_BOOKING_STATUSES.join(', ')}` })
  }
  const nextStatus: DemoBookingStatus = rawStatus

  const result = await changeDemoBookingStatus({ bookingId: id, status: nextStatus })

  if (!result.ok) {
    switch (result.kind) {
      case 'NOT_FOUND':
        return notFound('Demo booking not found')
      case 'INVALID_TRANSITION':
        return apiError(409, 'INVALID_TRANSITION', `Cannot move a booking from ${result.from} to ${nextStatus}`, {
          allowedNextStatuses: result.allowed,
        })
      case 'CONFLICT':
        return apiError(409, 'CONFLICT', 'This booking was changed by someone else. Reload and try again.')
      case 'SLOT_TAKEN':
        return apiError(
          409,
          'SLOT_TAKEN',
          `This time overlaps confirmed booking ${result.clashesWith.join(', ')}. Reschedule one of them first.`,
          { clashesWith: result.clashesWith },
        )
    }
  }

  const { previous, booking, requester } = result

  await createAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'demo_booking.status_changed',
    entityType: 'demo_booking',
    entityId: booking.id,
    changes: { status: { from: previous, to: booking.status } },
    metadata: { reference: booking.reference, leadId: booking.leadId },
  })

  // The visitor is told about confirmations and cancellations, not about the
  // internal COMPLETED state (the meeting has already happened).
  let emailSent = false
  if (requester.email && (nextStatus === 'CONFIRMED' || nextStatus === 'CANCELLED')) {
    try {
      const data = {
        firstName: requester.firstName,
        companyName: requester.companyName,
        reference: booking.reference,
        when: formatInTimeZone(booking.startsAt, booking.timezone),
        timezone: booking.timezone,
        durationMinutes: booking.durationMinutes,
      }
      const confirmed = nextStatus === 'CONFIRMED'
      const sent = await emailService.sendEmail({
        to: requester.email,
        subject: confirmed
          ? `Your demo is confirmed (${booking.reference})`
          : `Your demo has been cancelled (${booking.reference})`,
        html: confirmed
          ? renderDemoBookingConfirmedTemplate(data)
          : renderDemoBookingCancelledTemplate(data),
      })
      emailSent = sent.success
      if (!sent.success) console.error('Demo status email failed:', sent.error)
    } catch (error) {
      console.error('Demo status email failed:', error)
    }
  }

  const detail = await loadDetail(id)
  return NextResponse.json({ success: true, data: { ...detail, emailSent } })
}

// ── Reschedule ───────────────────────────────────────────────

async function reschedule(id: string, body: Record<string, unknown>, adminId: string) {
  const parsed = parseDemoReschedule(body)
  if (!parsed.ok) return badRequest('Invalid reschedule request', parsed.errors)

  const result = await rescheduleDemoBooking({
    bookingId: id,
    startsAt: parsed.input.startsAt,
    timezone: parsed.input.timezone,
    durationMinutes: parsed.input.durationMinutes,
  })

  if (!result.ok) {
    switch (result.kind) {
      case 'NOT_FOUND':
        return notFound('Demo booking not found')
      case 'INVALID_STATE':
        return apiError(409, 'INVALID_STATE', `A ${result.status.toLowerCase()} booking cannot be rescheduled.`)
      case 'POLICY':
        return badRequest('Invalid reschedule request', { [result.violation.field]: result.violation.message })
      case 'CONFLICT':
        return apiError(409, 'SLOT_UNAVAILABLE', result.message, {
          availableSlots: result.availableSlots.map((slot) => slot.toISOString()),
        })
    }
  }

  const { previous, booking, requester } = result

  await createAuditLog({
    actorType: 'admin',
    actorId: adminId,
    action: 'demo_booking.rescheduled',
    entityType: 'demo_booking',
    entityId: booking.id,
    changes: {
      startsAt: { from: previous.startsAt.toISOString(), to: booking.startsAt.toISOString() },
      durationMinutes: { from: previous.durationMinutes, to: booking.durationMinutes },
      timezone: { from: previous.timezone, to: booking.timezone },
    },
    metadata: { reference: booking.reference, leadId: booking.leadId },
  })

  let emailSent = false
  if (requester.email) {
    try {
      const html = renderDemoBookingRescheduledTemplate({
        firstName: requester.firstName,
        companyName: requester.companyName,
        reference: booking.reference,
        previous: formatInTimeZone(previous.startsAt, booking.timezone),
        next: formatInTimeZone(booking.startsAt, booking.timezone),
        timezone: booking.timezone,
        durationMinutes: booking.durationMinutes,
      })
      const sent = await emailService.sendEmail({
        to: requester.email,
        subject: `Your demo has been rescheduled (${booking.reference})`,
        html,
      })
      emailSent = sent.success
      if (!sent.success) console.error('Demo reschedule email failed:', sent.error)
    } catch (error) {
      console.error('Demo reschedule email failed:', error)
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      id: booking.id,
      reference: booking.reference,
      status: booking.status,
      startsAt: booking.startsAt,
      durationMinutes: booking.durationMinutes,
      timezone: booking.timezone,
      previousStartsAt: previous.startsAt,
      businessTime: formatBusinessLocal(booking.startsAt),
      emailSent,
    },
  })
}
