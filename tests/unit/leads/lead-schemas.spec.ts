import { describe, it, expect } from 'vitest'
import {
  employeeAccessSchema,
  employerEnquirySchema,
  fieldErrors,
  merchantApplicationSchema,
} from '@/lib/leads/schemas'
import { parseLeadSubmission } from '@/lib/leads/parse'

const employer = {
  first_name: 'Grace',
  last_name: 'Hopper',
  email: 'Grace@Example.com',
  phone: '99 123456',
  company: 'Navy Labs',
  role: 'HR Manager',
  website: 'navylabs.cy',
  company_size: '50-99',
  'consent-1': 'I agree to the privacy policy',
}

const merchant = {
  first_name: 'Ada',
  last_name: 'Lovelace',
  email: 'ada@kafeneio.cy',
  phone: '99 123456',
  company: 'Kafeneio',
  category: 'Coffee & Cafés',
  redemption: 'In-store',
  website: 'kafeneio.cy',
  'consent-1': 'I am authorised to submit',
  'consent-2': 'I agree to the privacy policy',
}

const employee = {
  first_name: 'Alan',
  last_name: 'Turing',
  email: 'alan@navylabs.cy',
  company: 'Navy Labs',
  intent: 'Get access',
  'consent-1': 'I agree to the privacy policy',
}

function errorsOf(schema: { safeParse: (v: unknown) => any }, value: unknown) {
  const result = schema.safeParse(value)
  return result.success ? {} : fieldErrors(result.error)
}

describe('employer_enquiry schema', () => {
  it('accepts a full submission and normalises values', () => {
    const result = employerEnquirySchema.parse(employer)
    expect(result.email).toBe('grace@example.com')
    expect(result.phone).toBe('+35799123456')
    expect(result.website).toBe('https://navylabs.cy')
    expect(result.instagram).toBeNull()
  })

  it.each(['first_name', 'last_name', 'email', 'phone', 'company', 'role', 'website', 'company_size', 'consent-1'])(
    'requires %s',
    (field) => {
      expect(errorsOf(employerEnquirySchema, { ...employer, [field]: '' })).toHaveProperty(field)
    },
  )

  it('rejects an unknown company size', () => {
    expect(errorsOf(employerEnquirySchema, { ...employer, company_size: '10-50' })).toEqual({ company_size: 'Choose a valid option' })
  })
})

describe('merchant_application schema', () => {
  it('accepts website only, instagram only, or both', () => {
    expect(merchantApplicationSchema.safeParse(merchant).success).toBe(true)
    expect(merchantApplicationSchema.safeParse({ ...merchant, website: '', instagram: 'kafeneio' }).success).toBe(true)
    expect(merchantApplicationSchema.safeParse({ ...merchant, instagram: 'instagram.com/kafeneio' }).success).toBe(true)
  })

  it('requires at least one of website or instagram', () => {
    expect(errorsOf(merchantApplicationSchema, { ...merchant, website: ' ', instagram: '' })).toEqual({
      website: 'Add your website or Instagram (at least one)',
    })
  })

  it.each(['first_name', 'last_name', 'email', 'phone', 'company', 'category', 'redemption', 'consent-1', 'consent-2'])(
    'requires %s',
    (field) => {
      expect(errorsOf(merchantApplicationSchema, { ...merchant, [field]: '' })).toHaveProperty(field)
    },
  )

  it('keeps role optional', () => {
    expect(merchantApplicationSchema.parse(merchant).role).toBeNull()
  })

  it('rejects option text that does not match exactly', () => {
    const errors = errorsOf(merchantApplicationSchema, { ...merchant, category: 'coffee & cafés', redemption: 'Instore' })
    expect(errors).toEqual({ category: 'Choose a valid option', redemption: 'Choose a valid option' })
  })
})

describe('employee_access schema', () => {
  it('accepts the minimum fields with phone, role and consent-2 optional', () => {
    const result = employeeAccessSchema.parse(employee)
    expect(result.phone).toBeNull()
    expect(result.role).toBeNull()
    expect(result['consent-2']).toBeNull()
  })

  it.each(['first_name', 'last_name', 'email', 'company', 'intent', 'consent-1'])('requires %s', (field) => {
    expect(errorsOf(employeeAccessSchema, { ...employee, [field]: '' })).toHaveProperty(field)
  })

  it('rejects an unknown intent', () => {
    expect(errorsOf(employeeAccessSchema, { ...employee, intent: 'Maybe' })).toEqual({ intent: 'Choose a valid option' })
  })
})

describe('parseLeadSubmission', () => {
  it.each([
    ['employer_enquiry', employer, 'EMPLOYER'],
    ['merchant_application', merchant, 'MERCHANT'],
    ['employee_access', employee, 'EMPLOYEE_ACCESS'],
  ])('maps %s to %s', (formKey, body, type) => {
    const result = parseLeadSubmission({ ...body, form_key: formKey })
    expect(result.ok && result.input.type).toBe(type)
  })

  it.each(['newsletter', 'contact_message', 'nope', ''])('rejects form_key %j', (formKey) => {
    expect(parseLeadSubmission({ ...employee, form_key: formKey })).toEqual({ ok: false, errors: { form_key: 'Unsupported form' } })
  })

  it('maps website fields onto lead columns', () => {
    const result = parseLeadSubmission({ ...merchant, instagram: 'kafeneio', role: 'Owner', form_key: 'merchant_application' })
    if (!result.ok) throw new Error('expected ok')
    expect(result.input.data).toMatchObject({
      companyName: 'Kafeneio',
      websiteUrl: 'https://kafeneio.cy',
      socialUrl: '@kafeneio',
      industry: 'Coffee & Cafés',
      redemption: 'In-store',
      role: 'Owner',
      phone: '+35799123456',
      formKey: 'merchant_application',
    })
  })

  it('only shares an employee with their employer when consent-2 is ticked', () => {
    const without = parseLeadSubmission({ ...employee, form_key: 'employee_access', 'consent-2': '' })
    const withIt = parseLeadSubmission({ ...employee, form_key: 'employee_access', 'consent-2': 'Share with my employer' })
    expect(without.ok && without.input.data.shareWithEmployer).toBe(false)
    expect(withIt.ok && withIt.input.data.shareWithEmployer).toBe(true)
  })
})
