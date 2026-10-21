import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    demoBooking: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/email/email', () => ({
  emailService: { sendEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'm1' }) },
}))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog } from '@/services/audit-log.service'
import { emailService } from '@/lib/email/email'
import {
  addDaysToDateKey,
  businessWallClockToUtc,
  toBusinessWallClock,
} from '@/lib/demo-bookings/availability'
import { PATCH } from '@/app/api/admin/demo-bookings/[id]/route'

const db = prisma as any
const adminUser = { id: 'auth-admin', profileId: 'admin-1', userType: 'admin' }

/** The next weekday at least two days out — past the notice window. */
function nextOpenDay(): string {
  let key = addDaysToDateKey(toBusinessWallClock(new Date()).dateKey, 2)
  for (let i = 0; i < 14; i += 1) {
    const weekday = toBusinessWallClock(businessWallClockToUtc(key, 9 * 60)).weekday
    if (weekday >= 1 && weekday <= 5) return key
    key = addDaysToDateKey(key, 1)
  }
  throw new Error('could not find an open business day')
}

const DAY = nextOpenDay()
const OLD_START = businessWallClockToUtc(DAY, 10 * 60).toISOString()
const NEW_START = businessWallClockToUtc(DAY, 11 * 60).toISOString()

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    reference: 'DEMO-ABC1234567',
    status: 'PENDING',
    leadId: 'lead-1',
    startsAt: new Date(OLD_START),
    durationMinutes: 30,
    timezone: 'Europe/Nicosia',
    lead: { email: 'name@company.com', firstName: 'Eleni', companyName: 'Example Company' },
    ...overrides,
  }
}

const params = { params: Promise.resolve({ id: 'booking-1' }) }

function request(body: unknown) {
  return new Request('http://localhost/api/admin/demo-bookings/booking-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

async function patch(body: unknown, overrides: { params?: unknown } = {}) {
  const res = await PATCH(request(body), (overrides.params ?? params) as any)
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any)
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db))
  db.demoBooking.findUnique.mockResolvedValue(bookingRow())
  db.demoBooking.findMany.mockResolvedValue([])
  db.demoBooking.update.mockResolvedValue({
    id: 'booking-1',
    reference: 'DEMO-ABC1234567',
    status: 'PENDING',
    leadId: 'lead-1',
    startsAt: new Date(NEW_START),
    durationMinutes: 30,
    timezone: 'Europe/Nicosia',
  })
  db.$executeRaw.mockResolvedValue(0)
})

describe('PATCH /api/admin/demo-bookings/[id] authorization', () => {
  it('rejects an unauthenticated request', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    const { status, json } = await patch({ startsAt: NEW_START })
    expect(status).toBe(401)
    expect(json.error.code).toBe('UNAUTHORIZED')
    expect(db.demoBooking.update).not.toHaveBeenCalled()
  })

  it('rejects a non-admin user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...adminUser, userType: 'merchant' } as any)
    const { status, json } = await patch({ startsAt: NEW_START })
    expect(status).toBe(403)
    expect(json.error.code).toBe('FORBIDDEN')
    expect(db.demoBooking.update).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/demo-bookings/[id] reschedule', () => {
  it('moves the booking, audits the change and emails the requester', async () => {
    const { status, json } = await patch({ startsAt: NEW_START })

    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(new Date(json.data.startsAt).toISOString()).toBe(NEW_START)
    expect(new Date(json.data.previousStartsAt).toISOString()).toBe(OLD_START)
    expect(json.data.emailSent).toBe(true)

    // Atomic update with the new UTC instant, duration and display zone.
    expect(db.demoBooking.update).toHaveBeenCalledTimes(1)
    const updateData = db.demoBooking.update.mock.calls[0][0]
    expect(updateData.where).toEqual({ id: 'booking-1' })
    expect(updateData.data.startsAt.toISOString()).toBe(NEW_START)
    expect(updateData.data.durationMinutes).toBe(30)
    expect(updateData.data.timezone).toBe('Europe/Nicosia')

    // The audit trail records the previous and new time.
    expect(createAuditLog).toHaveBeenCalledTimes(1)
    const audit = vi.mocked(createAuditLog).mock.calls[0][0]
    expect(audit).toMatchObject({
      actorType: 'admin',
      actorId: 'admin-1',
      action: 'demo_booking.rescheduled',
      entityType: 'demo_booking',
      entityId: 'booking-1',
    })
    expect(audit.changes).toMatchObject({
      startsAt: { from: OLD_START, to: NEW_START },
    })

    // The requester is emailed.
    expect(emailService.sendEmail).toHaveBeenCalledTimes(1)
    expect(vi.mocked(emailService.sendEmail).mock.calls[0][0].to).toBe('name@company.com')
  })

  it('acquires the same per-day scheduling lock as a create', async () => {
    await patch({ startsAt: NEW_START })
    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    expect(db.$executeRaw.mock.calls[0][1]).toBe(`demo_booking_slot:${DAY}`)
  })

  it('excludes the booking being rescheduled from its own collision check', async () => {
    // The row currently occupies the target slot — it must not collide with itself.
    db.demoBooking.findMany.mockResolvedValue([
      { id: 'booking-1', startsAt: new Date(NEW_START), durationMinutes: 30, status: 'PENDING' },
    ])

    const { status } = await patch({ startsAt: NEW_START })

    expect(status).toBe(200)
    expect(db.demoBooking.update).toHaveBeenCalledTimes(1)
  })

  it('returns 409 with refreshed options when the new slot is taken', async () => {
    db.demoBooking.findMany.mockResolvedValue([
      { id: 'other', startsAt: new Date(NEW_START), durationMinutes: 30, status: 'PENDING' },
    ])

    const { status, json } = await patch({ startsAt: NEW_START })

    expect(status).toBe(409)
    expect(json.error.code).toBe('SLOT_UNAVAILABLE')
    expect(Array.isArray(json.error.availableSlots)).toBe(true)
    expect(json.error.availableSlots).not.toContain(NEW_START)
    expect(db.demoBooking.update).not.toHaveBeenCalled()
    expect(emailService.sendEmail).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown booking', async () => {
    db.demoBooking.findUnique.mockResolvedValue(null)
    const { status, json } = await patch({ startsAt: NEW_START })
    expect(status).toBe(404)
    expect(json.success).toBe(false)
  })

  it('refuses to reschedule a cancelled booking', async () => {
    db.demoBooking.findUnique.mockResolvedValue(bookingRow({ status: 'CANCELLED' }))
    const { status, json } = await patch({ startsAt: NEW_START })
    expect(status).toBe(409)
    expect(json.error.code).toBe('INVALID_STATE')
    expect(db.demoBooking.update).not.toHaveBeenCalled()
  })

  it('does not fail the reschedule when the email cannot be sent', async () => {
    vi.mocked(emailService.sendEmail).mockResolvedValueOnce({ success: false, error: 'smtp down' })

    const { status, json } = await patch({ startsAt: NEW_START })

    expect(status).toBe(200)
    expect(json.data.emailSent).toBe(false)
    expect(db.demoBooking.update).toHaveBeenCalledTimes(1)
  })
})

describe('PATCH /api/admin/demo-bookings/[id] validation', () => {
  it('requires a zone-qualified start time', async () => {
    const missing = await patch({})
    expect(missing.status).toBe(400)
    expect(missing.json.error.details).toHaveProperty('startsAt')

    const naive = await patch({ startsAt: '2026-11-16T10:00:00' })
    expect(naive.status).toBe(400)
    expect(naive.json.error.details).toHaveProperty('startsAt')
  })

  it('rejects a non-JSON body', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/admin/demo-bookings/booking-1', { method: 'PATCH', body: 'nope' }) as any,
      params as any,
    )
    expect(res.status).toBe(400)
  })

  it('rejects an unsupported duration', async () => {
    const { status, json } = await patch({ startsAt: NEW_START, durationMinutes: 45 })
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('durationMinutes')
    expect(db.demoBooking.update).not.toHaveBeenCalled()
  })

  it('rejects a time inside the notice window', async () => {
    const { status, json } = await patch({ startsAt: new Date(Date.now() + 3_600_000).toISOString() })
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('startsAt')
  })
})
