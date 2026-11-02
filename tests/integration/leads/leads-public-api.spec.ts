import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
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
  form_key: 'merchant_application',
  first_name: '  Ada  ',
  last_name: 'Lovelace',
  email: '  Founder@Example.COM ',
  phone: '99 123456',
  company: '  Acme Coffee ',
  role: 'Owner',
  website: 'acme.test',
  category: 'Food & Drinks',
  redemption: 'Both',
  'consent-1': 'I am authorised to submit this application on behalf of the business.',
  'consent-2': 'I agree to the privacy policy',
  consent_version: '2026-10-12',
}

const employerBody = {
  form_key: 'employer_enquiry',
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@example.com',
  phone: '99123456',
  company: 'Navy Labs',
  role: 'Head of People',
  website: 'navylabs.cy',
  company_size: '250+',
  'consent-1': 'I agree to the privacy policy',
  consent_version: '2026-10-12',
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
    expect(data.lastName).toBe('Lovelace')
    expect(data.companyName).toBe('Acme Coffee')
    expect(data.email).toBe('founder@example.com')
    expect(data.phone).toBe('+35799123456')
    expect(data.cities).toEqual(['Limassol'])
    expect(data.hqCountry).toBe('Cyprus')
    expect(data.consentVersion).toBe('2026-10-12')
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
      companySize: '250+',
      hqCountry: 'Cyprus',
      role: 'Head of People',
    })
    expect(data.industry).toBeUndefined()
    expect(data.redemption).toBeUndefined()
  })

  it('rejects a malformed email and an over-long field', async () => {
    const bad = await post({ ...merchantBody, email: 'not-an-email' })
    expect(bad.status).toBe(400)
    expect(bad.json.error.details).toHaveProperty('email')

    const long = await post({ ...merchantBody, company: 'x'.repeat(256) })
    expect(long.status).toBe(400)
    expect(long.json.error.details).toHaveProperty('company')

    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown form', async () => {
    const { status, json } = await post({ ...merchantBody, form_key: 'other' })

    expect(status).toBe(400)
    expect(json.error.code).toBe('VALIDATION')
    expect(json.errors).toEqual({ form_key: 'Unsupported form' })
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects a non-JSON body', async () => {
    const res = await POST(new Request('http://localhost/api/leads', { method: 'POST', body: 'nope' }) as any)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/leads dedupe', () => {
  it('updates the open lead instead of creating a row when the same email and type is NEW or CONTACTED', async () => {
    db.lead.findFirst.mockResolvedValue({ id: 'lead-existing', attribution: null })

    const { status, json } = await post(merchantBody)

    expect(status).toBe(201)
    expect(json.id).toBe('lead-existing')
    expect(json.data).toEqual({ id: 'lead-existing', deduplicated: true })
    expect(db.lead.create).not.toHaveBeenCalled()
    expect(db.lead.update).toHaveBeenCalledTimes(1)
    expect(db.lead.update.mock.calls[0][0].where).toEqual({ id: 'lead-existing' })
    expect(db.lead.update.mock.calls[0][0].data).not.toHaveProperty('createdAt')
    expect(db.lead.findFirst.mock.calls[0][0].where).toEqual({
      email: 'founder@example.com',
      type: 'MERCHANT',
      status: { in: ['NEW', 'CONTACTED'] },
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

    expect(vi.mocked(limiter.consume).mock.calls[0]?.[0]).toBe('leads:198.51.100.7')
    expect(vi.mocked(limiter.consume).mock.calls[1]?.[0]).toBe('leads:198.51.100.8')
  })

  it('counts rate-limited requests before validation runs', async () => {
    const limiter = fakeLimiter()
    setRateLimiter(limiter)

    await post({ form_key: 'merchant_application' })

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
    const payload = vi.mocked(publishBusinessToAdmins).mock.calls[0]?.[0] as any
    expect(payload.referenceType).toBe('lead')
    expect(payload.referenceId).toBe('lead-1')
    expect(payload.metadata).toMatchObject({ leadId: 'lead-1', type: 'MERCHANT' })
    expect(payload.title).toContain('Acme Coffee')
  })

  it('uses the contact name when the lead has no company', async () => {
    await post({
      form_key: 'contact_message',
      first_name: 'Kostas',
      last_name: 'Kyprianou',
      email: 'kostas@example.com',
      message: 'Hello there.',
      'consent-1': 'I agree',
    })

    const payload = vi.mocked(publishBusinessToAdmins).mock.calls[0]?.[0] as any
    expect(payload.title).toContain('Kostas Kyprianou')
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
