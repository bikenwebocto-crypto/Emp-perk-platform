import { describe, it, expect } from 'vitest'
import type { z } from 'zod'
import {
  contactMessageSchema,
  employerEnquirySchema,
  fieldErrors,
  individualWaitlistSchema,
  merchantApplicationSchema,
} from '@/lib/leads/schemas'
import { parseLeadSubmission } from '@/lib/leads/parse'

const employer = {
  form_key: 'employer_enquiry',
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'Grace@Example.com',
  phone: '99 123456',
  company: 'Navy Labs',
  role: 'HR Manager',
  website: 'navylabs.cy',
  linkedin: 'linkedin.com/company/navy-labs',
  company_size: '50-99',
  source: 'Google Search',
  'consent-1': 'I have read the Privacy Policy and understand how my details will be used.',
  consent_version: '2026-10-12',
}

const merchant = {
  form_key: 'merchant_application',
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@kafeneio.cy',
  phone: '+357 99 123456',
  company: 'Kafeneio',
  role: 'Owner',
  website: 'kafeneio.cy',
  instagram: 'instagram.com/kafeneio',
  category: 'Food & Drinks',
  redemption: 'Both',
  source: 'Friend Referral',
  'consent-1': 'I confirm that I am authorised to submit this application on behalf of the business.',
  'consent-2': 'I have read the Privacy Policy and understand how my details will be used.',
  consent_version: '2026-10-12',
}

const waitlist = {
  form_key: 'individual_waitlist',
  first_name: 'Alan',
  last_name: 'Turing',
  email: 'alan@example.com',
  source: 'Social Media',
  'consent-1': 'I have read the Privacy Policy and understand how my details will be used.',
}

const contact = {
  form_key: 'contact_message',
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'grace@example.com',
  phone: '0035799123456',
  message: 'Hello, I would like to know more about Perks & More.',
  'consent-1': 'I have read the Privacy Policy and understand how my details will be used.',
}

/** Field errors of a schema, keyed by the website field name. */
function errorsOf(schema: z.ZodTypeAny, payload: unknown): Record<string, string> {
  const parsed = schema.safeParse(payload)
  return parsed.success ? {} : fieldErrors(parsed.error)
}

describe('employer_enquiry schema', () => {
  it('accepts a complete submission and normalises the values', () => {
    const parsed = employerEnquirySchema.parse(employer)
    expect(parsed.email).toBe('grace@example.com')
    expect(parsed.phone).toBe('+35799123456')
    expect(parsed.website).toBe('https://navylabs.cy')
    expect(parsed.linkedin).toBe('https://www.linkedin.com/company/navy-labs')
    expect(parsed.company_size).toBe('50-99')
    expect(parsed.source).toBe('Google Search')
  })

  it.each(['first_name', 'last_name', 'email', 'phone', 'company', 'role', 'website', 'company_size', 'consent-1'])(
    'requires %s',
    (field) => {
      expect(errorsOf(employerEnquirySchema, { ...employer, [field]: '' })).toHaveProperty(field)
    },
  )

  it('rejects an invalid email, option value and phone format', () => {
    expect(errorsOf(employerEnquirySchema, { ...employer, email: 'nope' })).toMatchObject({
      email: 'Enter a valid email address',
    })
    expect(errorsOf(employerEnquirySchema, { ...employer, company_size: '51-200' })).toMatchObject({
      company_size: 'Choose a valid option',
    })
    expect(errorsOf(employerEnquirySchema, { ...employer, source: 'A friend' })).toMatchObject({
      source: 'Choose a valid option',
    })
    expect(errorsOf(employerEnquirySchema, { ...employer, phone: '123' })).toMatchObject({
      phone: 'Enter a valid Cyprus phone number',
    })
  })

  it('rejects a LinkedIn URL that points at another host', () => {
    expect(errorsOf(employerEnquirySchema, { ...employer, linkedin: 'https://facebook.com/navy' })).toMatchObject({
      linkedin: 'Enter a valid LinkedIn URL',
    })
  })

  it('treats a missing source as absent', () => {
    const parsed = employerEnquirySchema.parse({ ...employer, source: undefined })
    expect(parsed.source).toBeNull()
  })

  it('accepts a consent checkbox sent as true', () => {
    const parsed = employerEnquirySchema.parse({ ...employer, 'consent-1': true })
    expect(parsed['consent-1']).toBe('Accepted')
  })
})

describe('merchant_application schema', () => {
  it('accepts a complete submission and normalises the values', () => {
    const parsed = merchantApplicationSchema.parse(merchant)
    expect(parsed.phone).toBe('+35799123456')
    expect(parsed.website).toBe('https://kafeneio.cy')
    expect(parsed.instagram).toBe('@kafeneio')
    expect(parsed.category).toBe('Food & Drinks')
    expect(parsed.redemption).toBe('Both')
  })

  it('requires a website or an Instagram', () => {
    expect(errorsOf(merchantApplicationSchema, { ...merchant, website: '', instagram: '' })).toMatchObject({
      website: 'Add your website or Instagram (at least one)',
    })
  })

  it('accepts an Instagram on its own', () => {
    const parsed = merchantApplicationSchema.safeParse({ ...merchant, website: '' })
    expect(parsed.success).toBe(true)
  })

  it('accepts a website on its own', () => {
    const parsed = merchantApplicationSchema.safeParse({ ...merchant, instagram: '' })
    expect(parsed.success).toBe(true)
  })

  it.each(['first_name', 'last_name', 'email', 'phone', 'company', 'category', 'redemption', 'consent-1', 'consent-2'])(
    'requires %s',
    (field) => {
      expect(errorsOf(merchantApplicationSchema, { ...merchant, [field]: '' })).toHaveProperty(field)
    },
  )

  it('rejects an unknown category, redemption type or source', () => {
    expect(errorsOf(merchantApplicationSchema, { ...merchant, category: 'Coffee' })).toMatchObject({
      category: 'Choose a valid option',
    })
    expect(errorsOf(merchantApplicationSchema, { ...merchant, redemption: 'Cash' })).toMatchObject({
      redemption: 'Choose a valid option',
    })
    expect(errorsOf(merchantApplicationSchema, { ...merchant, source: 'A friend' })).toMatchObject({
      source: 'Choose a valid option',
    })
  })

  it('treats the role as optional', () => {
    const parsed = merchantApplicationSchema.parse({ ...merchant, role: '' })
    expect(parsed.role).toBeNull()
  })
})

describe('individual_waitlist schema', () => {
  it('accepts a complete submission', () => {
    const parsed = individualWaitlistSchema.parse(waitlist)
    expect(parsed.email).toBe('alan@example.com')
    expect(parsed.source).toBe('Social Media')
  })

  it.each(['first_name', 'last_name', 'email', 'consent-1'])('requires %s', (field) => {
    expect(errorsOf(individualWaitlistSchema, { ...waitlist, [field]: '' })).toHaveProperty(field)
  })
})

describe('contact_message schema', () => {
  it('accepts a complete submission and normalises the phone', () => {
    const parsed = contactMessageSchema.parse(contact)
    expect(parsed.phone).toBe('+35799123456')
    expect(parsed.message).toBe('Hello, I would like to know more about Perks & More.')
  })

  it.each(['first_name', 'last_name', 'email', 'message', 'consent-1'])('requires %s', (field) => {
    expect(errorsOf(contactMessageSchema, { ...contact, [field]: '' })).toHaveProperty(field)
  })

  it('caps the message at 5000 characters', () => {
    expect(errorsOf(contactMessageSchema, { ...contact, message: 'x'.repeat(5001) })).toHaveProperty('message')
  })

  it('treats the phone as optional but validates it when given', () => {
    expect(contactMessageSchema.parse({ ...contact, phone: '' }).phone).toBeNull()
    expect(errorsOf(contactMessageSchema, { ...contact, phone: '123' })).toHaveProperty('phone')
  })
})

describe('parseLeadSubmission', () => {
  it('maps the employer form onto an EMPLOYER lead', () => {
    const result = parseLeadSubmission(employer)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.type).toBe('EMPLOYER')
    expect(result.input.email).toBe('grace@example.com')
    expect(result.input.data).toMatchObject({
      formKey: 'employer_enquiry',
      firstName: 'Grace',
      lastName: 'Hopper',
      phone: '+35799123456',
      companyName: 'Navy Labs',
      role: 'HR Manager',
      websiteUrl: 'https://navylabs.cy',
      linkedin: 'https://www.linkedin.com/company/navy-labs',
      companySize: '50-99',
      referralSource: 'Google Search',
      consentVersion: '2026-10-12',
    })
  })

  it('maps the merchant form onto a MERCHANT lead', () => {
    const result = parseLeadSubmission(merchant)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.type).toBe('MERCHANT')
    expect(result.input.data).toMatchObject({
      formKey: 'merchant_application',
      companyName: 'Kafeneio',
      websiteUrl: 'https://kafeneio.cy',
      socialUrl: '@kafeneio',
      industry: 'Food & Drinks',
      redemption: 'Both',
      referralSource: 'Friend Referral',
    })
  })

  it('maps the waitlist form onto an INDIVIDUAL_WAITLIST lead without a company', () => {
    const result = parseLeadSubmission(waitlist)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.type).toBe('INDIVIDUAL_WAITLIST')
    expect(result.input.data.formKey).toBe('individual_waitlist')
    expect(result.input.data.companyName).toBeUndefined()
    expect(result.input.data.referralSource).toBe('Social Media')
  })

  it('maps the contact form onto a CONTACT_MESSAGE lead with the message', () => {
    const result = parseLeadSubmission(contact)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.type).toBe('CONTACT_MESSAGE')
    expect(result.input.data.formKey).toBe('contact_message')
    expect(result.input.data.message).toBe('Hello, I would like to know more about Perks & More.')
  })

  it.each(['employee_access', 'newsletter', 'unknown', ''])('rejects form_key %s', (formKey) => {
    expect(parseLeadSubmission({ ...employer, form_key: formKey })).toEqual({
      ok: false,
      errors: { form_key: 'Unsupported form' },
    })
  })

  it('rejects a missing form_key', () => {
    expect(parseLeadSubmission({ ...employer, form_key: undefined })).toEqual({
      ok: false,
      errors: { form_key: 'Unsupported form' },
    })
  })

  it('stores the consents with the version and the acceptance time', () => {
    const result = parseLeadSubmission(merchant)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const consents = result.input.data.consents as Record<string, string | null>
    expect(consents['consent-1']).toBe(merchant['consent-1'])
    expect(consents['consent-2']).toBe(merchant['consent-2'])
    expect(consents.version).toBe('2026-10-12')
    expect(typeof consents.acceptedAt).toBe('string')
  })

  it('collects the attribution fields', () => {
    const result = parseLeadSubmission({
      ...employer,
      page_url: 'https://perksandmore.com/employers',
      landing_page: 'https://perksandmore.com/',
      referrer: 'https://google.com',
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'launch',
      utm_term: '',
      utm_content: 'a',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.input.attribution).toEqual({
      page_url: 'https://perksandmore.com/employers',
      landing_page: 'https://perksandmore.com/',
      referrer: 'https://google.com',
      utm_source: 'facebook',
      utm_medium: 'cpc',
      utm_campaign: 'launch',
      utm_content: 'a',
    })
  })
})
