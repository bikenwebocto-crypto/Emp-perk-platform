import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    account: { create: vi.fn() },
    employee: { create: vi.fn() },
    company: { create: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/services/business-notification.service', () => ({
  channels: (...list: unknown[]) => list,
  publishBusinessToAdmins: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from '@/lib/prisma'
import { setRateLimiter, type RateLimiter } from '@/lib/rate-limit'
import { OPTIONS, POST } from '@/app/api/leads/route'

const db = prisma as any
const SITE = 'https://perksandmore.com'

const forms = {
  employer_enquiry: {
    form_key: 'employer_enquiry',
    first_name: 'Grace',
    last_name: 'Hopper',
    email: 'Grace@NavyLabs.cy',
    phone: '99 123456',
    company: 'Navy Labs',
    role: 'HR Manager',
    website: 'navylabs.cy',
    company_size: '50-99',
    'consent-1': 'I agree to the privacy policy',
    consent_version: '2026-10',
  },
  merchant_application: {
    form_key: 'merchant_application',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@kafeneio.cy',
    phone: '99 123456',
    company: 'Kafeneio',
    category: 'Coffee & Cafés',
    redemption: 'Both',
    instagram: 'instagram.com/kafeneio',
    'consent-1': 'I am authorised to submit',
    'consent-2': 'I agree to the privacy policy',
    consent_version: '2026-10',
  },
  employee_access: {
    form_key: 'employee_access',
    first_name: 'Alan',
    last_name: 'Turing',
    email: 'alan@navylabs.cy',
    company: 'Navy Labs',
    intent: 'Join waitlist',
    'consent-1': 'I agree to the privacy policy',
    'consent-2': '',
    consent_version: '2026-10',
  },
} as const

const expectedType = { employer_enquiry: 'EMPLOYER', merchant_application: 'MERCHANT', employee_access: 'EMPLOYEE_ACCESS' }

function fakeLimiter(): RateLimiter {
  return {
    backend: 'fake',
    consume: vi.fn().mockResolvedValue({ allowed: true, limit: 10, remaining: 9, retryAfterSeconds: 0 }),
    reset: vi.fn().mockResolvedValue(undefined),
  }
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: JSON.stringify(body),
  }) as any
}

function formRequest(body: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-forwarded-for': '203.0.113.9', ...headers },
    body: new URLSearchParams(body).toString(),
  }) as any
}

async function send(req: any) {
  const res = await POST(req)
  return { status: res.status, json: await res.json(), headers: res.headers }
}

const originalOrigins = process.env.PUBLIC_SITE_ORIGINS

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PUBLIC_SITE_ORIGINS = `${SITE},https://www.perksandmore.com`
  setRateLimiter(fakeLimiter())
  db.lead.findFirst.mockResolvedValue(null)
  db.lead.create.mockResolvedValue({ id: 'lead-1' })
  db.lead.update.mockResolvedValue({ id: 'lead-existing' })
  db.$executeRaw.mockResolvedValue(0)
})

afterEach(() => {
  process.env.PUBLIC_SITE_ORIGINS = originalOrigins
})

describe('website forms: valid submissions', () => {
  for (const [formKey, body] of Object.entries(forms)) {
    it(`creates a ${formKey} lead from JSON`, async () => {
      const { status, json } = await send(jsonRequest(body, { origin: SITE }))
      expect(status).toBe(201)
      expect(json).toMatchObject({ success: true, id: 'lead-1' })
      const data = db.lead.create.mock.calls[0][0].data
      expect(data.type).toBe(expectedType[formKey as keyof typeof expectedType])
      expect(data.formKey).toBe(formKey)
      expect(data.companyName).toBe(body.company)
      expect(data.companyId).toBeUndefined()
      expect(data.merchantId).toBeUndefined()
    })

    it(`creates a ${formKey} lead from a form-encoded body`, async () => {
      const { status, json } = await send(formRequest(body as Record<string, string>))
      expect(status).toBe(201)
      expect(json.id).toBe('lead-1')
      expect(db.lead.create.mock.calls[0][0].data.type).toBe(expectedType[formKey as keyof typeof expectedType])
    })
  }

  it('stores normalised values, consents and attribution', async () => {
    await send(formRequest({
      ...forms.merchant_application,
      utm_source: 'facebook',
      utm_campaign: 'launch',
      page_url: 'https://perksandmore.com/merchants',
      utm_term: '',
    }))
    const data = db.lead.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      email: 'ada@kafeneio.cy',
      phone: '+35799123456',
      socialUrl: '@kafeneio',
      websiteUrl: null,
      industry: 'Coffee & Cafés',
      redemption: 'Both',
      consentVersion: '2026-10',
    })
    expect(data.consentAt).toBeInstanceOf(Date)
    expect(data.consents).toMatchObject({
      'consent-1': 'I am authorised to submit',
      'consent-2': 'I agree to the privacy policy',
      version: '2026-10',
    })
    expect(typeof data.consents.acceptedAt).toBe('string')
    expect(data.attribution).toEqual({
      utm_source: 'facebook',
      utm_campaign: 'launch',
      page_url: 'https://perksandmore.com/merchants',
    })
  })

  it('accepts the old camelCase payload', async () => {
    const { status, json } = await send(jsonRequest({
      type: 'EMPLOYER',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      companyName: 'Navy Labs',
      consentVersion: '2026-01',
    }))
    expect(status).toBe(201)
    expect(json.id).toBe('lead-1')
    expect(db.lead.create.mock.calls[0][0].data).toMatchObject({ type: 'EMPLOYER', companyName: 'Navy Labs', formKey: null })
  })
})

describe('website forms: employee leads', () => {
  it('sets shareWithEmployer=false when consent-2 is empty and never creates an account or employee', async () => {
    await send(jsonRequest(forms.employee_access))
    const data = db.lead.create.mock.calls[0][0].data
    expect(data).toMatchObject({ type: 'EMPLOYEE_ACCESS', intent: 'Join waitlist', shareWithEmployer: false })
    expect(db.account.create).not.toHaveBeenCalled()
    expect(db.employee.create).not.toHaveBeenCalled()
    expect(db.company.create).not.toHaveBeenCalled()
  })

  it('sets shareWithEmployer=true when consent-2 is ticked', async () => {
    await send(jsonRequest({ ...forms.employee_access, 'consent-2': 'You may tell my employer' }))
    expect(db.lead.create.mock.calls[0][0].data.shareWithEmployer).toBe(true)
  })
})

describe('website forms: validation errors', () => {
  it('returns snake_case field errors', async () => {
    const { status, json } = await send(jsonRequest({ ...forms.merchant_application, instagram: '', email: 'nope', category: 'Coffee' }))
    expect(status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.errors).toEqual({
      email: 'Enter a valid email address',
      category: 'Choose a valid option',
      website: 'Add your website or Instagram (at least one)',
    })
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it.each(['newsletter', 'contact_message', 'unknown'])('rejects form_key %s with "Unsupported form"', async (formKey) => {
    const { status, json } = await send(jsonRequest({ ...forms.employee_access, form_key: formKey }))
    expect(status).toBe(400)
    expect(json.errors).toEqual({ form_key: 'Unsupported form' })
  })
})

describe('website forms: spam and duplicates', () => {
  it('honeypot: returns 200 { success: true } and saves nothing', async () => {
    const { status, json } = await send(formRequest({ ...forms.employer_enquiry, pm_hp: 'http://spam.example' }))
    expect(status).toBe(200)
    expect(json).toEqual({ success: true })
    expect(db.lead.create).not.toHaveBeenCalled()
    expect(db.lead.update).not.toHaveBeenCalled()
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('duplicate email + type updates the same row and merges attribution', async () => {
    db.lead.findFirst.mockResolvedValue({ id: 'lead-existing', attribution: { utm_source: 'google', page_url: 'https://old' } })

    const { status, json } = await send(jsonRequest({ ...forms.employee_access, utm_campaign: 'oct', page_url: 'https://new' }))

    expect(status).toBe(201)
    expect(json.id).toBe('lead-existing')
    expect(db.lead.create).not.toHaveBeenCalled()
    const update = db.lead.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'lead-existing' })
    expect(update.data).not.toHaveProperty('createdAt')
    expect(update.data).not.toHaveProperty('status')
    expect(update.data.attribution).toEqual({ utm_source: 'google', page_url: 'https://new', utm_campaign: 'oct' })
    expect(db.lead.findFirst.mock.calls[0][0].where).toEqual({
      email: 'alan@navylabs.cy',
      type: 'EMPLOYEE_ACCESS',
      status: { in: ['NEW', 'CONTACTED'] },
    })
  })
})

describe('website forms: endpoint safety', () => {
  it('rejects a POST from an unknown origin', async () => {
    const { status, headers } = await send(jsonRequest(forms.employee_access, { origin: 'https://evil.example' }))
    expect(status).toBe(403)
    expect(headers.get('access-control-allow-origin')).toBeNull()
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('echoes an allowed origin on POST', async () => {
    const { headers } = await send(jsonRequest(forms.employee_access, { origin: SITE }))
    expect(headers.get('access-control-allow-origin')).toBe(SITE)
  })

  it('answers preflight only for allowed origins', () => {
    const ok = OPTIONS(new Request('http://localhost/api/leads', { method: 'OPTIONS', headers: { origin: SITE } }) as any)
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(SITE)
    expect(ok.headers.get('access-control-allow-methods')).toContain('POST')

    const bad = OPTIONS(new Request('http://localhost/api/leads', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }) as any)
    expect(bad.status).toBe(403)
    expect(bad.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('rejects bodies over 20 KB', async () => {
    const { status } = await send(jsonRequest({ ...forms.employee_access, message: 'x'.repeat(21 * 1024) }))
    expect(status).toBe(413)
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rate limits per IP at 10 requests / 10 minutes', async () => {
    const limiter = fakeLimiter()
    setRateLimiter(limiter)
    await send(jsonRequest(forms.employee_access))
    expect(vi.mocked(limiter.consume)).toHaveBeenCalledWith('leads:203.0.113.9', { limit: 10, windowMs: 600_000 })
  })

  it('returns a generic 500 without internals', async () => {
    db.lead.create.mockRejectedValue(new Error('connection refused at 10.0.0.5'))
    const { status, json } = await send(jsonRequest(forms.employee_access))
    expect(status).toBe(500)
    expect(JSON.stringify(json)).not.toContain('10.0.0.5')
  })
})
