import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: any = {
    $executeRaw: vi.fn(),
    lead: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    account: { create: vi.fn() },
    employee: { create: vi.fn() },
    merchant: { create: vi.fn() },
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
    linkedin: 'linkedin.com/company/navy-labs',
    company_size: '50-99',
    source: 'Google Search',
    'consent-1': 'I have read the Privacy Policy and understand how my details will be used.',
    consent_version: '2026-10-12',
  },
  merchant_application: {
    form_key: 'merchant_application',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@kafeneio.cy',
    phone: '0035799123456',
    company: 'Kafeneio',
    role: 'Owner',
    instagram: 'instagram.com/kafeneio',
    category: 'Food & Drinks',
    redemption: 'Both',
    source: 'Friend Referral',
    'consent-1': 'I confirm that I am authorised to submit this application on behalf of the business.',
    'consent-2': 'I have read the Privacy Policy and understand how my details will be used.',
    consent_version: '2026-10-12',
  },
  individual_waitlist: {
    form_key: 'individual_waitlist',
    first_name: 'Alan',
    last_name: 'Turing',
    email: 'alan@example.com',
    source: 'Social Media',
    'consent-1': 'I have read the Privacy Policy and understand how my details will be used.',
    consent_version: '2026-10-12',
  },
  contact_message: {
    form_key: 'contact_message',
    first_name: 'Kostas',
    last_name: 'Kyprianou',
    email: 'kostas@example.com',
    phone: '+357 99 123456',
    message: 'Hello, I would like to know more about Perks & More.',
    'consent-1': 'I have read the Privacy Policy and understand how my details will be used.',
    consent_version: '2026-10-12',
  },
} as const

const expectedType = {
  employer_enquiry: 'EMPLOYER',
  merchant_application: 'MERCHANT',
  individual_waitlist: 'INDIVIDUAL_WAITLIST',
  contact_message: 'CONTACT_MESSAGE',
} as const

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

  it('stores the employer form with normalised values', async () => {
    await send(jsonRequest(forms.employer_enquiry))
    const data = db.lead.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      type: 'EMPLOYER',
      email: 'grace@navylabs.cy',
      phone: '+35799123456',
      companyName: 'Navy Labs',
      role: 'HR Manager',
      websiteUrl: 'https://navylabs.cy',
      linkedin: 'https://www.linkedin.com/company/navy-labs',
      companySize: '50-99',
      referralSource: 'Google Search',
      consentVersion: '2026-10-12',
      cities: ['Limassol'],
      hqCountry: 'Cyprus',
    })
  })

  it('stores the merchant form with normalised values', async () => {
    await send(jsonRequest(forms.merchant_application))
    const data = db.lead.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      type: 'MERCHANT',
      email: 'ada@kafeneio.cy',
      phone: '+35799123456',
      companyName: 'Kafeneio',
      socialUrl: '@kafeneio',
      websiteUrl: null,
      industry: 'Food & Drinks',
      redemption: 'Both',
      referralSource: 'Friend Referral',
      cities: ['Limassol'],
      hqCountry: 'Cyprus',
    })
  })

  it('stores the waitlist form without a company', async () => {
    await send(jsonRequest(forms.individual_waitlist))
    const data = db.lead.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      type: 'INDIVIDUAL_WAITLIST',
      email: 'alan@example.com',
      firstName: 'Alan',
      referralSource: 'Social Media',
    })
    expect(data.companyName).toBeUndefined()
    expect(data.cities).toBeUndefined()
    expect(data.hqCountry).toBeUndefined()
  })

  it('stores the contact message with its message', async () => {
    await send(jsonRequest(forms.contact_message))
    const data = db.lead.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      type: 'CONTACT_MESSAGE',
      email: 'kostas@example.com',
      phone: '+35799123456',
      message: 'Hello, I would like to know more about Perks & More.',
    })
    expect(data.companyName).toBeUndefined()
  })

  it('stores consents, attribution and the server-side consent timestamp', async () => {
    await send(formRequest({
      ...forms.merchant_application,
      utm_source: 'facebook',
      utm_campaign: 'launch',
      page_url: 'https://perksandmore.com/merchants',
      utm_term: '',
    }))
    const data = db.lead.create.mock.calls[0][0].data
    expect(data.consentAt).toBeInstanceOf(Date)
    expect(data.consents).toMatchObject({
      'consent-1': forms.merchant_application['consent-1'],
      'consent-2': forms.merchant_application['consent-2'],
      version: '2026-10-12',
    })
    expect(typeof data.consents.acceptedAt).toBe('string')
    expect(data.attribution).toEqual({
      utm_source: 'facebook',
      utm_campaign: 'launch',
      page_url: 'https://perksandmore.com/merchants',
    })
  })
})

describe('website forms: validation errors', () => {
  it.each(['first_name', 'last_name', 'email', 'phone', 'company', 'role', 'website', 'company_size', 'consent-1'])(
    'rejects an employer submission without %s',
    async (field) => {
      const { status, json } = await send(jsonRequest({ ...forms.employer_enquiry, [field]: '' }))
      expect(status).toBe(400)
      expect(json.success).toBe(false)
      expect(json.errors).toHaveProperty(field)
      expect(db.lead.create).not.toHaveBeenCalled()
    },
  )

  it.each(['first_name', 'last_name', 'email', 'message', 'consent-1'])(
    'rejects a contact message without %s',
    async (field) => {
      const { status, json } = await send(jsonRequest({ ...forms.contact_message, [field]: '' }))
      expect(status).toBe(400)
      expect(json.errors).toHaveProperty(field)
      expect(db.lead.create).not.toHaveBeenCalled()
    },
  )

  it.each(['first_name', 'last_name', 'email', 'consent-1'])(
    'rejects a waitlist submission without %s',
    async (field) => {
      const { status, json } = await send(jsonRequest({ ...forms.individual_waitlist, [field]: '' }))
      expect(status).toBe(400)
      expect(json.errors).toHaveProperty(field)
      expect(db.lead.create).not.toHaveBeenCalled()
    },
  )

  it('rejects an invalid option value', async () => {
    const { status, json } = await send(jsonRequest({ ...forms.merchant_application, category: 'Coffee' }))
    expect(status).toBe(400)
    expect(json.errors).toMatchObject({ category: 'Choose a valid option' })
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid company size, redemption type and source', async () => {
    const companySize = await send(jsonRequest({ ...forms.employer_enquiry, company_size: '51-200' }))
    expect(companySize.status).toBe(400)
    expect(companySize.json.errors).toHaveProperty('company_size')

    const redemption = await send(jsonRequest({ ...forms.merchant_application, redemption: 'Cash' }))
    expect(redemption.status).toBe(400)
    expect(redemption.json.errors).toHaveProperty('redemption')

    const source = await send(jsonRequest({ ...forms.employer_enquiry, source: 'A friend' }))
    expect(source.status).toBe(400)
    expect(source.json.errors).toHaveProperty('source')

    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects a merchant submission without a website and an Instagram', async () => {
    const { status, json } = await send(jsonRequest({ ...forms.merchant_application, website: '', instagram: '' }))
    expect(status).toBe(400)
    expect(json.errors).toHaveProperty('website')
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('accepts a merchant submission with only an Instagram', async () => {
    const { status } = await send(jsonRequest({ ...forms.merchant_application, website: '' }))
    expect(status).toBe(201)
    expect(db.lead.create.mock.calls[0][0].data.socialUrl).toBe('@kafeneio')
  })

  it('rejects a non-LinkedIn linkedin URL', async () => {
    const { status, json } = await send(jsonRequest({ ...forms.employer_enquiry, linkedin: 'https://facebook.com/navy' }))
    expect(status).toBe(400)
    expect(json.errors).toHaveProperty('linkedin')
  })

  it.each(['employee_access', 'newsletter', 'unknown'])('rejects form_key %s with "Unsupported form"', async (formKey) => {
    const { status, json } = await send(jsonRequest({ ...forms.employer_enquiry, form_key: formKey }))
    expect(status).toBe(400)
    expect(json.errors).toEqual({ form_key: 'Unsupported form' })
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rejects a missing form_key', async () => {
    const { status, json } = await send(jsonRequest({ ...forms.employer_enquiry, form_key: undefined }))
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

  it('two identical employer submissions keep one row and report the second as deduplicated', async () => {
    db.lead.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'lead-existing', attribution: null })

    const first = await send(jsonRequest(forms.employer_enquiry))
    expect(first.status).toBe(201)
    expect(first.json.data).toEqual({ id: 'lead-1', deduplicated: false })

    const second = await send(jsonRequest(forms.employer_enquiry))
    expect(second.status).toBe(201)
    expect(second.json.data).toEqual({ id: 'lead-existing', deduplicated: true })

    expect(db.lead.create).toHaveBeenCalledTimes(1)
    expect(db.lead.update).toHaveBeenCalledTimes(1)
    expect(db.lead.update.mock.calls[0][0].where).toEqual({ id: 'lead-existing' })
  })

  it('duplicate email + type updates the same row and merges attribution', async () => {
    db.lead.findFirst.mockResolvedValue({ id: 'lead-existing', attribution: { utm_source: 'google', page_url: 'https://old' } })

    const { status, json } = await send(jsonRequest({ ...forms.employer_enquiry, utm_campaign: 'oct', page_url: 'https://new' }))

    expect(status).toBe(201)
    expect(json.id).toBe('lead-existing')
    expect(db.lead.create).not.toHaveBeenCalled()
    const update = db.lead.update.mock.calls[0][0]
    expect(update.where).toEqual({ id: 'lead-existing' })
    expect(update.data).not.toHaveProperty('createdAt')
    expect(update.data).not.toHaveProperty('status')
    expect(update.data.attribution).toEqual({ utm_source: 'google', page_url: 'https://new', utm_campaign: 'oct' })
    expect(db.lead.findFirst.mock.calls[0][0].where).toEqual({
      email: 'grace@navylabs.cy',
      type: 'EMPLOYER',
      status: { in: ['NEW', 'CONTACTED'] },
    })
  })

  it('two contact messages from the same email are kept as two rows', async () => {
    const first = await send(jsonRequest(forms.contact_message))
    const second = await send(jsonRequest({ ...forms.contact_message, message: 'A second message.' }))

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(first.json.data.deduplicated).toBe(false)
    expect(second.json.data.deduplicated).toBe(false)
    expect(db.lead.create).toHaveBeenCalledTimes(2)
    expect(db.lead.findFirst).not.toHaveBeenCalled()
    expect(db.lead.update).not.toHaveBeenCalled()
  })
})

describe('website forms: endpoint safety', () => {
  it('rejects a POST from an unknown origin', async () => {
    const { status, headers } = await send(jsonRequest(forms.employer_enquiry, { origin: 'https://evil.example' }))
    expect(status).toBe(403)
    expect(headers.get('access-control-allow-origin')).toBeNull()
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('echoes an allowed origin on POST', async () => {
    const { headers } = await send(jsonRequest(forms.employer_enquiry, { origin: SITE }))
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
    const { status } = await send(jsonRequest({ ...forms.contact_message, message: 'x'.repeat(21 * 1024) }))
    expect(status).toBe(413)
    expect(db.lead.create).not.toHaveBeenCalled()
  })

  it('rate limits per IP at 10 requests / 10 minutes', async () => {
    const limiter = fakeLimiter()
    setRateLimiter(limiter)
    await send(jsonRequest(forms.employer_enquiry))
    expect(vi.mocked(limiter.consume)).toHaveBeenCalledWith('leads:203.0.113.9', { limit: 10, windowMs: 600_000 })
  })

  it('returns a generic 500 without internals', async () => {
    db.lead.create.mockRejectedValue(new Error('connection refused at 10.0.0.5'))
    const { status, json } = await send(jsonRequest(forms.employer_enquiry))
    expect(status).toBe(500)
    expect(JSON.stringify(json)).not.toContain('10.0.0.5')
  })
})
