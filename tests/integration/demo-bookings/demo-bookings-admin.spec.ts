import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    demoBooking: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
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
import { GET as listBookings } from '@/app/api/admin/demo-bookings/route'
import { GET as getBooking, PATCH as patchBooking } from '@/app/api/admin/demo-bookings/[id]/route'

const db = prisma as any
const adminUser = { id: 'auth-admin', profileId: 'admin-1', userType: 'admin' }

const LEAD = {
  id: 'lead-1',
  firstName: 'Eleni',
  lastName: 'Papadopoulou',
  email: 'name@company.com',
  phone: '+35799123456',
  companyName: 'Example Company',
  hearAbout: 'Google',
  message: 'We would like a tour.',
  consentAt: new Date('2026-10-01T09:00:00Z'),
  createdAt: new Date('2026-10-01T09:00:00Z'),
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    reference: 'DEMO-ABC1234567',
    status: 'PENDING',
    leadId: 'lead-1',
    startsAt: new Date('2026-11-16T08:00:00Z'),
    durationMinutes: 30,
    timezone: 'Europe/Nicosia',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    lead: LEAD,
    ...overrides,
  }
}

const params = { params: Promise.resolve({ id: 'booking-1' }) }

function get(url: string) {
  return new Request(url) as any
}

function patch(body: unknown) {
  return new Request('http://localhost/api/admin/demo-bookings/booking-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrentUser).mockResolvedValue(adminUser as any)
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db))
  db.demoBooking.findUnique.mockResolvedValue(bookingRow())
  db.demoBooking.findMany.mockResolvedValue([bookingRow()])
  db.demoBooking.count.mockResolvedValue(1)
  db.demoBooking.groupBy.mockResolvedValue([{ status: 'PENDING', _count: { _all: 1 } }])
  db.demoBooking.updateMany.mockResolvedValue({ count: 1 })
})

describe('GET /api/admin/demo-bookings', () => {
  it('rejects an unauthenticated request', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    const res = await listBookings(get('http://localhost/api/admin/demo-bookings'))
    expect(res.status).toBe(401)
    expect(db.demoBooking.findMany).not.toHaveBeenCalled()
  })

  it('rejects a non-admin user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...adminUser, userType: 'merchant' } as any)
    const res = await listBookings(get('http://localhost/api/admin/demo-bookings'))
    expect(res.status).toBe(403)
  })

  it('returns bookings with per-status counts', async () => {
    const res = await listBookings(get('http://localhost/api/admin/demo-bookings?page=1&pageSize=20'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].reference).toBe('DEMO-ABC1234567')
    expect(json.meta.counts).toEqual({ PENDING: 1, CONFIRMED: 0, CANCELLED: 0, COMPLETED: 0 })
    expect(json.meta.total).toBe(1)
  })

  it('filters by status and search term', async () => {
    await listBookings(get('http://localhost/api/admin/demo-bookings?status=CONFIRMED&q=eleni'))

    const where = db.demoBooking.findMany.mock.calls[0][0].where
    expect(where.status).toBe('CONFIRMED')
    expect(where.OR).toBeTruthy()
    // Counts ignore the status filter so the stage bar still shows everything.
    expect(db.demoBooking.groupBy.mock.calls[0][0].where.status).toBeUndefined()
  })

  it('rejects an unknown status filter', async () => {
    const res = await listBookings(get('http://localhost/api/admin/demo-bookings?status=NOPE'))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/admin/demo-bookings/[id]', () => {
  it('returns the booking with allowed next statuses', async () => {
    const res = await getBooking(get('http://localhost/api/admin/demo-bookings/booking-1'), params as any)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.reference).toBe('DEMO-ABC1234567')
    expect(json.data.lead.email).toBe('name@company.com')
    expect(json.data.allowedNextStatuses).toEqual(['CONFIRMED', 'CANCELLED'])
  })

  it('returns 404 for an unknown booking', async () => {
    db.demoBooking.findUnique.mockResolvedValue(null)
    const res = await getBooking(get('http://localhost/api/admin/demo-bookings/nope'), params as any)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/admin/demo-bookings/[id] status', () => {
  it('confirms a pending booking, audits it and emails the requester', async () => {
    db.demoBooking.findUnique
      .mockResolvedValueOnce(bookingRow({ status: 'PENDING' }))
      .mockResolvedValueOnce(bookingRow({ status: 'CONFIRMED' }))

    const res = await patchBooking(patch({ status: 'CONFIRMED' }), params as any)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.status).toBe('CONFIRMED')
    expect(json.data.emailSent).toBe(true)

    expect(db.demoBooking.updateMany).toHaveBeenCalledTimes(1)
    expect(db.demoBooking.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'booking-1', status: 'PENDING' },
      data: { status: 'CONFIRMED' },
    })

    const audit = vi.mocked(createAuditLog).mock.calls[0][0]
    expect(audit).toMatchObject({
      action: 'demo_booking.status_changed',
      entityType: 'demo_booking',
      changes: { status: { from: 'PENDING', to: 'CONFIRMED' } },
    })
    expect(vi.mocked(emailService.sendEmail).mock.calls[0][0].subject).toContain('confirmed')
  })

  it('cancels a confirmed booking and frees the slot (no collision check needed)', async () => {
    db.demoBooking.findUnique
      .mockResolvedValueOnce(bookingRow({ status: 'CONFIRMED' }))
      .mockResolvedValueOnce(bookingRow({ status: 'CANCELLED' }))

    const res = await patchBooking(patch({ status: 'CANCELLED' }), params as any)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data.status).toBe('CANCELLED')
    expect(vi.mocked(emailService.sendEmail).mock.calls[0][0].subject).toContain('cancelled')
    // Cancelling never needs the scheduling lock.
    expect(db.$executeRaw).not.toHaveBeenCalled()
  })

  it('does not email the visitor when a meeting is marked completed', async () => {
    db.demoBooking.findUnique
      .mockResolvedValueOnce(bookingRow({ status: 'CONFIRMED' }))
      .mockResolvedValueOnce(bookingRow({ status: 'COMPLETED' }))

    const res = await patchBooking(patch({ status: 'COMPLETED' }), params as any)

    expect(res.status).toBe(200)
    await res.json()
    expect(emailService.sendEmail).not.toHaveBeenCalled()
  })

  it('rejects an invalid status', async () => {
    const res = await patchBooking(patch({ status: 'NOPE' }), params as any)
    expect(res.status).toBe(400)
    expect(db.demoBooking.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a disallowed transition', async () => {
    db.demoBooking.findUnique.mockResolvedValueOnce(bookingRow({ status: 'PENDING' }))
    const res = await patchBooking(patch({ status: 'COMPLETED' }), params as any)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe('INVALID_TRANSITION')
    expect(json.error.allowedNextStatuses).toEqual(['CONFIRMED', 'CANCELLED'])
    expect(db.demoBooking.updateMany).not.toHaveBeenCalled()
  })

  it('returns 409 when the booking changed underneath the request', async () => {
    db.demoBooking.findUnique.mockResolvedValueOnce(bookingRow({ status: 'PENDING' }))
    db.demoBooking.updateMany.mockResolvedValue({ count: 0 })

    const res = await patchBooking(patch({ status: 'CONFIRMED' }), params as any)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe('CONFLICT')
  })

  it('refuses to confirm a booking that overlaps another confirmed booking', async () => {
    db.demoBooking.findUnique.mockResolvedValueOnce(bookingRow({ status: 'PENDING' }))
    db.demoBooking.findMany.mockResolvedValue([
      bookingRow({ id: 'booking-2', reference: 'DEMO-OTHER00001', status: 'CONFIRMED' }),
    ])

    const res = await patchBooking(patch({ status: 'CONFIRMED' }), params as any)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error.code).toBe('SLOT_TAKEN')
    expect(json.error.clashesWith).toEqual(['DEMO-OTHER00001'])
    expect(db.demoBooking.updateMany).not.toHaveBeenCalled()
  })

  it('flags overlapping bookings on the detail view', async () => {
    db.demoBooking.findMany.mockResolvedValue([
      bookingRow(),
      bookingRow({ id: 'booking-2', reference: 'DEMO-OTHER00001', status: 'PENDING' }),
    ])

    const res = await getBooking(get('http://localhost/api/admin/demo-bookings/booking-1'), params as any)
    const json = await res.json()

    expect(json.data.overlaps.map((o: any) => o.reference)).toEqual(['DEMO-OTHER00001'])
  })

  it('refuses to reschedule and change status in the same request', async () => {
    const res = await patchBooking(
      patch({ status: 'CONFIRMED', startsAt: '2026-11-16T09:00:00Z' }),
      params as any,
    )
    expect(res.status).toBe(400)
    expect(db.demoBooking.updateMany).not.toHaveBeenCalled()
  })
})
