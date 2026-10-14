import { describe, it, expect } from 'vitest'
import { leadToMerchantPrefill, leadToCompanyPrefill, matchCategoryId, convertHref } from '@/lib/leads/prefill'

const baseLead = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@acme.test',
  phone: '+14155550100',
  companyName: 'Acme Coffee',
}

const categories = [
  { id: 'cat-food', name: 'Food & Drink' },
  { id: 'cat-retail-1', name: 'Retail' },
  { id: 'cat-retail-2', name: 'retail' },
]

describe('leadToMerchantPrefill', () => {
  it('maps lead fields onto the merchant form', () => {
    const prefill = leadToMerchantPrefill(
      { ...baseLead, industry: 'food & drink', cities: ['Austin', 'Dallas'], websiteUrl: 'https://acme.test' },
      categories,
    )
    expect(prefill).toEqual({
      businessName: 'Acme Coffee',
      contactName: 'Ada Lovelace',
      email: 'ada@acme.test',
      contactPhone: '+14155550100',
      website: 'https://acme.test',
      categoryId: 'cat-food',
      city: 'Austin',
    })
  })

  it('leaves category empty when the industry matches more than one category', () => {
    expect(leadToMerchantPrefill({ ...baseLead, industry: 'Retail' }, categories).categoryId).toBe('')
  })

  it('leaves category empty when nothing matches, and handles missing optionals', () => {
    const prefill = leadToMerchantPrefill({ ...baseLead, phone: null, industry: 'Bakery', cities: [] }, categories)
    expect(prefill.categoryId).toBe('')
    expect(prefill.city).toBe('')
    expect(prefill.contactPhone).toBe('')
    expect(prefill.website).toBe('')
  })

  it('does not partially match category names', () => {
    expect(matchCategoryId('Food', categories)).toBe('')
  })
})

describe('leadToCompanyPrefill', () => {
  it('maps lead fields onto the company form and ignores companySize', () => {
    const prefill = leadToCompanyPrefill({ ...baseLead, hqCountry: 'Canada', companySize: '51-200' } as any)
    expect(prefill).toEqual({
      name: 'Acme Coffee',
      email: 'ada@acme.test',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+14155550100',
      country: 'Canada',
    })
    expect(prefill).not.toHaveProperty('employeeCount')
  })
})

describe('convertHref', () => {
  it('routes merchant and employer leads to the right add form', () => {
    expect(convertHref({ id: 'abc', type: 'MERCHANT' })).toBe('/admin/merchants/add?leadId=abc')
    expect(convertHref({ id: 'abc', type: 'EMPLOYER' })).toBe('/admin/companies/add?leadId=abc')
  })
})
