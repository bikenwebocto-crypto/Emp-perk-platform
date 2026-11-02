import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'

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

import { prisma } from '@/lib/prisma'
import { setRateLimiter, type RateLimiter } from '@/lib/rate-limit'
import {
  addDaysToDateKey,
  businessWallClockToUtc,
  toBusinessWallClock,
} from '@/lib/demo-bookings/availability'
import { GET, OPTIONS } from '@/app/api/demo-bookings/availability/route'

const db = prisma as any
const IP = '198.51.100.20'
const ALLOWED_ORIGIN = 'https://perksandmore.example'

const previousOrigins = process.env.PUBLIC_SITE_ORIGINS
process.env.PUBLIC_SITE_ORIGINS = ALLOWED_ORIGIN
afterAll(() => {
  if (previousOrigins === undefined) delete process.env.PUBLIC_SITE_ORIGINS
  else process.env.PUBLIC_SITE_ORIGINS = previousOrigins
})

/** The next weekday at least two days out — past the notice window. */
function nextOpenDateKey(): string {
  let key = addDaysToDateKey(toBusinessWallClock(new Date()).dateKey, 2)
  for (let i = 0; i < 14; i += 1) {
    const weekday = toBusinessWallClock(businessWallClockToUtc(key, 9 * 60)).weekday
    if (weekday >= 1 && weekday <= 5) return key
    key = addDaysToDateKey(key, 1)
  }
  throw new Error('could not find an open business day')
}

const OPEN_DAY = nextOpenDateKey()

function fakeLimiter(overrides: Partial<RateLimiter> = {}): RateLimiter {
  return {
    backend: 'fake',
    consume: vi.fn().mockResolvedValue({ allowed: true, limit: 60, remaining: 59, retryAfterSeconds: 0 }),
    reset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function get(query: string, { ip = IP, origin }: { ip?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': `${ip}, 10.0.0.1` }
  if (origin) headers.origin = origin
  return new NextRequest(`http://localhost/api/demo-bookings/availability${query}`, { headers })
}

async function call(query: string, opts: { ip?: string; origin?: string } = {}) {
  const res = await GET(get(query, opts))
  return { status: res.status, json: await res.json(), headers: res.headers }
}

beforeEach(() => {
  vi.clearAllMocks()
  setRateLimiter(fakeLimiter())
  db.demoBooking.findMany.mockResolvedValue([])
})

describe('GET /api/demo-bookings/availability', () => {
  it('returns the open slots for a business day without any authentication', async () => {
    const { status, json } = await call(`?date=${OPEN_DAY}`)

    expect(status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.date).toBe(OPEN_DAY)
    expect(json.timezone).toBe('Europe/Nicosia')
    expect(json.durationMinutes).toBe(30)
    expect(json.slots).toHaveLength(16)
    expect(json.slots[0]).toEqual({
      startsAt: businessWallClockToUtc(OPEN_DAY, 9 * 60).toISOString(),
      endAt: businessWallClockToUtc(OPEN_DAY, 9 * 60 + 30).toISOString(),
    })
    expect(json.slots[json.slots.length - 1].startsAt).toBe(
      businessWallClockToUtc(OPEN_DAY, 16 * 60 + 30).toISOString(),
    )
  })

  it('rejects a missing or malformed date', async () => {
    expect((await call('')).status).toBe(400)
    expect((await call('?date=2026-02-31')).status).toBe(400)
    expect((await call('?date=15-01-2026')).status).toBe(400)
  })

  it('rejects an unsupported duration', async () => {
    const { status, json } = await call(`?date=${OPEN_DAY}&durationMinutes=45`)
    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION')
  })

  it('omits slots already reserved by a booking', async () => {
    const taken = businessWallClockToUtc(OPEN_DAY, 10 * 60)
    db.demoBooking.findMany.mockResolvedValue([
      { id: 'b1', startsAt: taken, durationMinutes: 30, status: 'PENDING' },
    ])

    const { json } = await call(`?date=${OPEN_DAY}`)

    expect(json.slots).toHaveLength(15)
    expect(json.slots.map((s: { startsAt: string }) => s.startsAt)).not.toContain(taken.toISOString())
  })

  it('rejects a request from a disallowed origin', async () => {
    const { status, json } = await call(`?date=${OPEN_DAY}`, { origin: 'https://evil.example' })
    expect(status).toBe(403)
    expect(json.error.code).toBe('FORBIDDEN')
  })

  it('returns 429 once the limiter denies a request, keyed to its own namespace', async () => {
    const limiter = fakeLimiter({
      consume: vi.fn().mockResolvedValue({ allowed: false, limit: 60, remaining: 0, retryAfterSeconds: 300 }),
    })
    setRateLimiter(limiter)

    const { status, json, headers } = await call(`?date=${OPEN_DAY}`)

    expect(status).toBe(429)
    expect(json.error.code).toBe('RATE_LIMITED')
    expect(headers.get('Retry-After')).toBe('300')
    expect(vi.mocked(limiter.consume).mock.calls[0][0]).toBe(`demo-availability:${IP}`)
  })
})

describe('OPTIONS /api/demo-bookings/availability', () => {
  it('answers a preflight for an allowed origin with GET permitted', async () => {
    const res = await OPTIONS(get('', { origin: ALLOWED_ORIGIN }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET')
  })

  it('refuses a preflight without an allowed origin', async () => {
    expect((await OPTIONS(get(''))).status).toBe(403)
    expect((await OPTIONS(get('', { origin: 'https://evil.example' }))).status).toBe(403)
  })
})
