import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    demoBooking: { create: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    rateLimitCounter: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/services/business-notification.service', () => ({
  channels: (...list: unknown[]) => list,
  publishBusinessToAdmins: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/audit-log.service', () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { publishBusinessToAdmins } from '@/services/business-notification.service'
import { createAuditLog } from '@/services/audit-log.service'
import { setRateLimiter, type RateLimiter } from '@/lib/rate-limit'
import {
  addDaysToDateKey,
  businessWallClockToUtc,
  toBusinessWallClock,
} from '@/lib/demo-bookings/availability'
import { POST } from '@/app/api/demo-bookings/route'

const db = prisma as any

const IP = '203.0.113.9'
const REFERENCE = 'DEMO-ABC1234567'
const TZ = 'Europe/Nicosia'

/**
 * A start that satisfies every policy rule against the real clock: the next
 * weekday at 10:00 Nicosia time, at least two days out (past the notice window).
 */
function nextValidStart(): string {
  let key = addDaysToDateKey(toBusinessWallClock(new Date()).dateKey, 2)
  for (let i = 0; i < 14; i += 1) {
    const at = businessWallClockToUtc(key, 10 * 60)
    const weekday = toBusinessWallClock(at).weekday
    const lead = at.getTime() - Date.now()
    if (weekday >= 1 && weekday <= 5 && lead >= 25 * 3_600_000 && lead < 55 * 86_400_000) {
      return at.toISOString()
    }
    key = addDaysToDateKey(key, 1)
  }
  throw new Error('could not find a valid future slot')
}

const FUTURE_START = nextValidStart()

/** Always-allow limiter unless a test overrides it. */
function fakeLimiter(overrides: Partial<RateLimiter> = {}): RateLimiter {
  return {
    backend: 'fake',
    consume: vi.fn().mockResolvedValue({ allowed: true, limit: 5, remaining: 4, retryAfterSeconds: 0 }),
    reset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    type: 'EMPLOYER',
    firstName: 'Eleni',
    lastName: 'Christou',
    email: 'name@company.com',
    phone: '+35799123456',
    companyName: 'Example Company',
    startsAt: FUTURE_START,
    timezone: TZ,
    notes: 'Interested in employee benefits',
    referralSource: 'LinkedIn',
    privacyAccepted: true,
    ...overrides,
  }
}

function request(body: unknown, { ip = IP, origin }: { ip?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': `${ip}, 10.0.0.1`,
  }
  if (origin) headers.origin = origin
  return new Request('http://localhost/api/demo-bookings', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as any
}

async function post(body: unknown, opts: { ip?: string; origin?: string } = {}) {
  const res = await POST(request(body, opts))
  return { status: res.status, json: await res.json(), headers: res.headers }
}

beforeEach(() => {
  vi.clearAllMocks()
  setRateLimiter(fakeLimiter())
  db.lead.findFirst.mockResolvedValue(null)
  db.lead.create.mockResolvedValue({ id: 'lead-1' })
  db.lead.update.mockResolvedValue({ id: 'lead-existing' })
  db.demoBooking.findMany.mockResolvedValue([])
  db.demoBooking.create.mockResolvedValue({
    id: 'booking-1',
    reference: REFERENCE,
    status: 'PENDING',
    startsAt: new Date(FUTURE_START),
    durationMinutes: 30,
    timezone: TZ,
  })
  db.auditLog.create.mockResolvedValue({})
  db.$executeRaw.mockResolvedValue(0)
})

describe('POST /api/demo-bookings response', () => {
  it('creates the booking and returns only the minimum fields', async () => {
    const { status, json } = await post(validBody())

    expect(status).toBe(201)
    expect(json).toEqual({
      success: true,
      reference: REFERENCE,
      status: 'PENDING',
      message: expect.stringContaining('demo request'),
    })
    // No internal lead data, ids or database details leak to the public caller.
    expect(Object.keys(json).sort()).toEqual(['message', 'reference', 'status', 'success'])
    expect(JSON.stringify(json)).not.toContain('lead-1')
    expect(JSON.stringify(json)).not.toContain('name@company.com')
  })

  it('works without any session, bearer token or auth header', async () => {
    // The endpoint must stay public: a bare request from an unknown visitor is accepted.
    const { status } = await post(validBody())
    expect(status).toBe(201)
    expect(db.lead.create).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/demo-bookings persistence', () => {
  it('maps the contact and company details onto the existing Lead model', async () => {
    const before = Date.now()
    await post(validBody())
    const after = Date.now()

    const data = db.lead.create.mock.calls[0][0].data
    expect(data.type).toBe('EMPLOYER')
    expect(data.source).toBe('PUBLIC_FORM')
    expect(data.status).toBe('NEW')
    expect(data.formKey).toBe('demo_booking')
    expect(data.firstName).toBe('Eleni')
    expect(data.lastName).toBe('Christou')
    expect(data.email).toBe('name@company.com')
    expect(data.phone).toBe('+35799123456')
    expect(data.companyName).toBe('Example Company')
    expect(data.hearAbout).toBe('LinkedIn')
    expect(data.consents).toMatchObject({ privacyAccepted: true })
    expect(data.consentAt).toBeInstanceOf(Date)
    expect(data.consentAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(data.consentAt.getTime()).toBeLessThanOrEqual(after)
  })

  it('creates a related DemoBooking with the UTC instant, duration and timezone', async () => {
    await post(validBody())

    const data = db.demoBooking.create.mock.calls[0][0].data
    expect(data.leadId).toBe('lead-1')
    expect(data.status).toBe('PENDING')
    expect(data.reference).toMatch(/^DEMO-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/)
    expect(data.startsAt).toBeInstanceOf(Date)
    expect(data.startsAt.toISOString()).toBe(FUTURE_START)
    expect(data.durationMinutes).toBe(30)
    expect(data.timezone).toBe(TZ)
    expect(data.notes).toBe('Interested in employee benefits')
  })

  it('associates the booking with an existing open lead instead of creating a row', async () => {
    db.lead.findFirst.mockResolvedValue({ id: 'lead-existing' })

    const { status } = await post(validBody())

    expect(status).toBe(201)
    expect(db.lead.create).not.toHaveBeenCalled()
    expect(db.lead.update).toHaveBeenCalledTimes(1)
    expect(db.lead.update.mock.calls[0][0].where).toEqual({ id: 'lead-existing' })
    expect(db.lead.findFirst.mock.calls[0][0].where).toEqual({
      email: 'name@company.com',
      type: 'EMPLOYER',
      status: { in: ['NEW', 'CONTACTED'] },
    })
    expect(db.demoBooking.create.mock.calls[0][0].data.leadId).toBe('lead-existing')
  })

  it('serialises the slot and lead check-and-write under advisory locks', async () => {
    await post(validBody())

    // One lock for the business day's calendar, one for the lead de-dupe.
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('records a system audit entry for the public submission', async () => {
    await post(validBody())

    expect(createAuditLog).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createAuditLog).mock.calls[0][0]).toMatchObject({
      actorType: 'system',
      action: 'demo_booking.created',
      entityType: 'demo_booking',
      entityId: 'booking-1',
    })
  })

  it('notifies admins, and a notification failure does not fail the request', async () => {
    vi.mocked(publishBusinessToAdmins).mockRejectedValueOnce(new Error('boom'))

    const { status } = await post(validBody())

    expect(status).toBe(201)
    expect(publishBusinessToAdmins).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/demo-bookings collision handling', () => {
  it('accepts a request for an already-held slot as PENDING and flags it to admins', async () => {
    // A booking already occupies the requested slot (e.g. taken after the form loaded).
    db.demoBooking.findMany.mockResolvedValue([
      { id: 'other', startsAt: new Date(FUTURE_START), durationMinutes: 30, status: 'PENDING' },
    ])

    const { status, json } = await post(validBody())

    // The visitor still succeeds; the admin resolves the clash by rescheduling.
    expect(status).toBe(201)
    expect(json.status).toBe('PENDING')
    expect(db.demoBooking.create).toHaveBeenCalledTimes(1)
    const notification = vi.mocked(publishBusinessToAdmins).mock.calls[0][0] as any
    expect(notification.message).toContain('overlaps 1 other booking')
    expect(notification.priority).toBe('HIGH')
  })

  it('does not treat a CANCELLED booking as a collision', async () => {
    db.demoBooking.findMany.mockResolvedValue([
      { id: 'cancelled', startsAt: new Date(FUTURE_START), durationMinutes: 30, status: 'CANCELLED' },
    ])

    const { status } = await post(validBody())

    expect(status).toBe(201)
    expect(db.demoBooking.create).toHaveBeenCalledTimes(1)
  })

  it('does not flag a request that overlaps nothing', async () => {
    const { status } = await post(validBody())

    expect(status).toBe(201)
    const notification = vi.mocked(publishBusinessToAdmins).mock.calls[0][0] as any
    expect(notification.message).not.toContain('overlaps')
    expect(notification.priority).toBe('NORMAL')
  })
})

describe('POST /api/demo-bookings validation', () => {
  it('rejects missing required fields', async () => {
    const { status, json } = await post({ type: 'EMPLOYER' })

    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION')
    for (const field of ['firstName', 'lastName', 'email', 'companyName', 'startsAt', 'timezone', 'privacyAccepted']) {
      expect(json.error.details).toHaveProperty(field)
    }
    expect(db.lead.create).not.toHaveBeenCalled()
    expect(db.demoBooking.create).not.toHaveBeenCalled()
  })

  it('accepts a merchant demo and stores the lead as MERCHANT', async () => {
    const { status } = await post(validBody({ type: 'MERCHANT' }))
    expect(status).toBe(201)
    expect(db.lead.create.mock.calls[0][0].data.type).toBe('MERCHANT')
    expect(db.lead.findFirst.mock.calls[0][0].where.type).toBe('MERCHANT')
  })

  it('requires the audience type', async () => {
    const { status, json } = await post(validBody({ type: undefined }))
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('type')
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown audience', async () => {
    const { status, json } = await post(validBody({ type: 'EMPLOYEE' }))
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('type')
  })

  it('rejects a malformed email and an over-long field', async () => {
    const badEmail = await post(validBody({ email: 'not-an-email' }))
    expect(badEmail.status).toBe(400)
    expect(badEmail.json.error.details).toHaveProperty('email')

    const longNote = await post(validBody({ notes: 'x'.repeat(2001) }))
    expect(longNote.status).toBe(400)
    expect(longNote.json.error.details).toHaveProperty('notes')

    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('requires an unambiguous, zone-qualified start time', async () => {
    const naive = await post(validBody({ startsAt: '2026-11-16T10:00:00' }))
    expect(naive.status).toBe(400)
    expect(naive.json.error.details).toHaveProperty('startsAt')

    const nonsense = await post(validBody({ startsAt: 'not-a-date' }))
    expect(nonsense.status).toBe(400)
    expect(nonsense.json.error.details).toHaveProperty('startsAt')
  })

  it('requires the privacy box to be accepted', async () => {
    const { status, json } = await post(validBody({ privacyAccepted: false }))

    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('privacyAccepted')
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects a non-JSON body', async () => {
    const res = await POST(new Request('http://localhost/api/demo-bookings', { method: 'POST', body: 'nope' }) as any)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/demo-bookings scheduling policy', () => {
  it('rejects an unsupported meeting duration', async () => {
    const { status, json } = await post(validBody({ durationMinutes: 45 }))
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('durationMinutes')
    expect(db.demoBooking.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown time zone', async () => {
    const { status, json } = await post(validBody({ timezone: 'Mars/Olympus' }))
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('timezone')
  })

  it('rejects a past time', async () => {
    const { status, json } = await post(validBody({ startsAt: '2000-01-01T10:00:00Z' }))
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('startsAt')
  })

  it('rejects a time inside the notice window', async () => {
    const { status, json } = await post(validBody({ startsAt: new Date(Date.now() + 3_600_000).toISOString() }))
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('startsAt')
    expect(json.error.details.startsAt).toContain('24 hours')
  })

  it('rejects a time beyond the booking horizon', async () => {
    const { status, json } = await post(validBody({ startsAt: new Date(Date.now() + 90 * 86_400_000).toISOString() }))
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('startsAt')
    expect(json.error.details.startsAt).toContain('60 days')
  })

  it('rejects a time outside working hours', async () => {
    // 03:00 Nicosia two days out: passes notice/horizon, fails working hours.
    const key = addDaysToDateKey(toBusinessWallClock(new Date()).dateKey, 2)
    const { status, json } = await post(validBody({ startsAt: businessWallClockToUtc(key, 3 * 60).toISOString() }))
    expect(status).toBe(400)
    expect(json.error.details).toHaveProperty('startsAt')
    expect(json.error.details.startsAt).toContain('Monday to Friday')
  })
})

describe('POST /api/demo-bookings abuse controls', () => {
  it('returns 429 with Retry-After once the limiter denies a request', async () => {
    setRateLimiter(
      fakeLimiter({
        consume: vi.fn().mockResolvedValue({ allowed: false, limit: 5, remaining: 0, retryAfterSeconds: 600 }),
      }),
    )

    const { status, json, headers } = await post(validBody())

    expect(status).toBe(429)
    expect(json.error.code).toBe('RATE_LIMITED')
    expect(headers.get('Retry-After')).toBe('600')
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('keys the limiter by client IP under its own namespace', async () => {
    const limiter = fakeLimiter()
    setRateLimiter(limiter)

    await post(validBody(), { ip: '198.51.100.7' })
    await post(validBody(), { ip: '198.51.100.8' })

    expect(vi.mocked(limiter.consume).mock.calls[0][0]).toBe('demo-bookings:198.51.100.7')
    expect(vi.mocked(limiter.consume).mock.calls[1][0]).toBe('demo-bookings:198.51.100.8')
  })

  it('silently accepts and stores nothing when the honeypot is filled', async () => {
    const { status, json } = await post({ ...validBody(), pm_hp: 'bot' })

    expect(status).toBe(200)
    expect(json).toEqual({ success: true })
    expect(db.lead.create).not.toHaveBeenCalled()
    expect(db.demoBooking.create).not.toHaveBeenCalled()
  })

  it('rejects a request from a disallowed origin', async () => {
    const { status, json } = await post(validBody(), { origin: 'https://evil.example' })

    expect(status).toBe(403)
    expect(json.error.code).toBe('FORBIDDEN')
    expect(db.lead.create).not.toHaveBeenCalled()
  })
})
