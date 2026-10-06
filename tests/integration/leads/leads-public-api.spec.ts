import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    lead: { findFirst: vi.fn(), create: vi.fn() },
    account: { create: vi.fn() },
    merchant: { create: vi.fn() },
    company: { create: vi.fn() },
    rateLimitCounter: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/services/business-notification.service', () => ({
  channels: (...list: unknown[]) => list,
  publishBusinessToAdmins: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { publishBusinessToAdmins } from '@/services/business-notification.service'
import { setRateLimiter, type RateLimiter } from '@/lib/rate-limit'
import { POST } from '@/app/api/leads/route'

const db = prisma as any

const IP = '203.0.113.9'

/** Always-allow limiter unless a test overrides it. */
function fakeLimiter(overrides: Partial<RateLimiter> = {}): RateLimiter {
  return {
    backend: 'fake',
    consume: vi.fn().mockResolvedValue({ allowed: true, limit: 5, remaining: 4, retryAfterSeconds: 0 }),
    reset: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const merchantBody = {
  type: 'MERCHANT',
  firstName: '  Ada  ',
  lastName: 'Lovelace',
  email: '  Founder@Example.COM ',
  companyName: '  Acme Coffee ',
  industry: 'Food',
  cities: [' London ', 'Bristol'],
  websiteUrl: 'https://acme.test',
  consentVersion: '2026-01',
}

const employerBody = {
  type: 'EMPLOYER',
  firstName: 'Grace',
  lastName: 'Hopper',
  email: 'grace@example.com',
  companyName: 'Navy Labs',
  companySize: '250-500',
  hqCountry: 'United Kingdom',
  role: 'Head of People',
  consentVersion: '2026-01',
}

function request(body: unknown, ip = IP) {
  return new Request('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    body: JSON.stringify(body),
  }) as any
}

async function post(body: unknown, ip = IP) {
  const res = await POST(request(body, ip))
  return { status: res.status, json: await res.json(), headers: res.headers }
}

beforeEach(() => {
  vi.clearAllMocks()
  setRateLimiter(fakeLimiter())
  db.lead.findFirst.mockResolvedValue(null)
  db.lead.create.mockResolvedValue({ id: 'lead-1', createdAt: new Date('2026-02-01T10:00:00Z') })
  db.$executeRaw.mockResolvedValue(0)
})

describe('POST /api/leads validation', () => {
  it('creates a merchant lead with trimmed values and a server-side consent timestamp', async () => {
    const before = Date.now()
    const { status, json } = await post(merchantBody)
    const after = Date.now()

    expect(status).toBe(201)
    expect(json.data).toMatchObject({ id: 'lead-1', deduplicated: false })

    const data = db.lead.create.mock.calls[0][0].data
    expect(data.type).toBe('MERCHANT')
    expect(data.source).toBe('PUBLIC_FORM')
    expect(data.status).toBe('NEW')
    expect(data.firstName).toBe('Ada')
    expect(data.companyName).toBe('Acme Coffee')
    expect(data.email).toBe('founder@example.com')
    expect(data.cities).toEqual(['London', 'Bristol'])
    expect(data.consentVersion).toBe('2026-01')
    expect(data.consentAt).toBeInstanceOf(Date)
    expect(data.consentAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(data.consentAt.getTime()).toBeLessThanOrEqual(after)
    expect(data.websiteUrl).toBe('https://acme.test')
  })

  it('creates an employer lead with only the employer fields', async () => {
    const { status } = await post(employerBody)

    expect(status).toBe(201)
    const data = db.lead.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      type: 'EMPLOYER',
      companySize: '250-500',
      hqCountry: 'United Kingdom',
      role: 'Head of People',
    })
    expect(data.industry).toBeUndefined()
    expect(data.cities).toBeUndefined()
  })

  it('defaults cities to an empty array and treats blank optional strings as null', async () => {
    await post({ ...merchantBody, cities: undefined, industry: '   ', message: '', websiteUrl: '' })

    const data = db.lead.create.mock.calls[0][0].data
    expect(data.cities).toEqual([])
    expect(data.industry).toBeNull()
    expect(data.message).toBeNull()
    expect(data.websiteUrl).toBeNull()
  })

  it('requires consentVersion', async () => {
    const { consentVersion: _dropped, ...withoutConsent } = merchantBody
    const { status, json } = await post(withoutConsent)

    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION')
    expect(json.error.details).toHaveProperty('consentVersion')
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown type', async () => {
    const { status, json } = await post({ ...merchantBody, type: 'OTHER' })

    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION')
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed email and an over-long field', async () => {
    const bad = await post({ ...merchantBody, email: 'not-an-email' })
    expect(bad.status).toBe(400)
    expect(bad.json.error.details).toHaveProperty('email')

    const long = await post({ ...merchantBody, companyName: 'x'.repeat(256) })
    expect(long.status).toBe(400)
    expect(long.json.error.details).toHaveProperty('companyName')

    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects employer-only fields sent on a merchant lead and vice versa', async () => {
    const { status } = await post({ ...merchantBody, companySize: '250-500' })
    expect(status).toBe(400)

    const employerWithCities = await post({ ...employerBody, cities: ['London'] })
    expect(employerWithCities.status).toBe(400)
  })

  it('rejects a non-JSON body', async () => {
    const res = await POST(new Request('http://localhost/api/leads', { method: 'POST', body: 'nope' }) as any)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/leads dedupe', () => {
  it('returns 200 without creating a row when the same email and type is already NEW', async () => {
    db.lead.findFirst.mockResolvedValue({ id: 'lead-existing', createdAt: new Date('2026-01-01') })

    const { status, json } = await post(merchantBody)

    expect(status).toBe(200)
    expect(json.data).toEqual({ id: 'lead-existing', deduplicated: true })
    expect(db.lead.create).not.toHaveBeenCalled()
    expect(db.lead.findFirst).toHaveBeenCalledWith({
      where: { email: 'founder@example.com', type: 'MERCHANT', status: 'NEW' },
      select: { id: true, createdAt: true },
    })
    expect(publishBusinessToAdmins).not.toHaveBeenCalled()
  })

  it('does not dedupe across lead types', async () => {
    await post(merchantBody)
    await post(employerBody)

    expect(db.lead.findFirst.mock.calls[0][0].where).toMatchObject({ type: 'MERCHANT' })
    expect(db.lead.findFirst.mock.calls[1][0].where).toMatchObject({ type: 'EMPLOYER' })
    expect(db.lead.create).toHaveBeenCalledTimes(2)
  })

  it('serialises the dedupe check under an advisory lock', async () => {
    await post(merchantBody)

    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/leads rate limit', () => {
  it('returns 429 with Retry-After once the limiter denies a request', async () => {
    const limiter = fakeLimiter({
      consume: vi.fn().mockResolvedValue({ allowed: false, limit: 5, remaining: 0, retryAfterSeconds: 600 }),
    })
    setRateLimiter(limiter)

    const { status, json, headers } = await post(merchantBody)

    expect(status).toBe(429)
    expect(json.error.code).toBe('RATE_LIMITED')
    expect(json.meta.retryAfterSeconds).toBe(600)
    expect(headers.get('Retry-After')).toBe('600')
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('keys the limiter by client IP', async () => {
    const limiter = fakeLimiter()
    setRateLimiter(limiter)

    await post(merchantBody, '198.51.100.7')
    await post(merchantBody, '198.51.100.8')

    expect(vi.mocked(limiter.consume).mock.calls[0][0]).toBe('leads:198.51.100.7')
    expect(vi.mocked(limiter.consume).mock.calls[1][0]).toBe('leads:198.51.100.8')
  })

  it('counts rate-limited requests before validation runs', async () => {
    const limiter = fakeLimiter()
    setRateLimiter(limiter)

    await post({ type: 'MERCHANT' })

    expect(limiter.consume).toHaveBeenCalledTimes(1)
    expect(db.lead.create).not.toHaveBeenCalled()
  })
})

describe('POST /api/leads side effects', () => {
  it('never writes an Account, Merchant, or Company', async () => {
    const { status } = await post(merchantBody)
    expect(status).toBe(201)

    expect(db.account.create).not.toHaveBeenCalled()
    expect(db.merchant.create).not.toHaveBeenCalled()
    expect(db.company.create).not.toHaveBeenCalled()
  })

  it('notifies admins with the new lead id', async () => {
    await post(merchantBody)

    expect(publishBusinessToAdmins).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(publishBusinessToAdmins).mock.calls[0][0] as any
    expect(payload.referenceType).toBe('lead')
    expect(payload.referenceId).toBe('lead-1')
    expect(payload.metadata).toMatchObject({ leadId: 'lead-1', type: 'MERCHANT' })
  })

  it('still returns 201 when the admin notification fails', async () => {
    vi.mocked(publishBusinessToAdmins).mockRejectedValueOnce(new Error('notification down'))

    const { status, json } = await post(merchantBody)

    expect(status).toBe(201)
    expect(json.data.id).toBe('lead-1')
  })

  it('returns 500 when the insert fails', async () => {
    db.lead.create.mockRejectedValue(new Error('db down'))

    const { status, json } = await post(merchantBody)

    expect(status).toBe(500)
    expect(json.error.code).toBe('INTERNAL')
  })
})