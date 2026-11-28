// Maps a lead to the initial values of the admin "add merchant" / "add company"
// forms when an admin converts it. Pure so it can be unit tested.
import { isOtherCategoryName } from '@/lib/categories'

export interface PrefillLead {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  companyName: string | null
  industry?: string | null
  cities?: string[] | null
  websiteUrl?: string | null
  hqCountry?: string | null
  socialUrl?: string | null
}

export interface MerchantPrefill {
  businessName: string
  contactName: string
  email: string
  contactPhone: string
  website: string
  categoryId: string
  city: string
  country: string
  socialLinks?: { instagram: string }
}

export interface CompanyPrefill {
  name: string
  email: string
  firstName: string
  lastName: string
  phone: string
  website: string
  industry: string
  city: string
  country: string
}

/** "@handle" (how lead forms store Instagram) → profile URL; URLs pass through. */
export function instagramUrl(value: string | null | undefined): string {
  const v = value?.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  const handle = v.replace(/^@/, '')
  return handle ? `https://www.instagram.com/${handle}` : ''
}

/** "Food & Drinks" and "food and drink" compare equal. */
function normaliseCategoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ')
}

/** Lead types that can be converted into a company or a merchant. */
export const CONVERTIBLE_LEAD_TYPES = ['MERCHANT', 'EMPLOYER'] as const

export type LeadType = 'MERCHANT' | 'EMPLOYER' | 'INDIVIDUAL_WAITLIST' | 'CONTACT_MESSAGE'

/** Where the Convert action sends the admin for each lead type. */
export function convertHref(lead: { id: string; type: LeadType }): string {
  const base = lead.type === 'MERCHANT' ? '/admin/merchants/add' : '/admin/companies/add'
  return `${base}?leadId=${encodeURIComponent(lead.id)}`
}

/**
 * Picks a category only when exactly one has the same name, ignoring case,
 * punctuation, "&" vs "and" and plural "s". Never matches partially.
 */
export function matchCategoryId(
  industry: string | null | undefined,
  categories: { id: string; name: string }[],
): string {
  if (isOtherCategoryName(industry)) return ''
  const term = industry ? normaliseCategoryName(industry) : ''
  if (!term) return ''
  const matches = categories.filter((c) => normaliseCategoryName(c.name) === term)
  return matches.length === 1 ? matches[0]!.id : ''
}

export function leadToMerchantPrefill(
  lead: PrefillLead,
  categories: { id: string; name: string }[],
): MerchantPrefill {
  const instagram = instagramUrl(lead.socialUrl)
  return {
    businessName: lead.companyName?.trim() || `${lead.firstName} ${lead.lastName}`.trim(),
    contactName: `${lead.firstName} ${lead.lastName}`.trim(),
    email: lead.email,
    contactPhone: lead.phone ?? '',
    website: lead.websiteUrl ?? '',
    categoryId: matchCategoryId(lead.industry, categories),
    city: lead.cities?.[0] ?? '',
    country: lead.hqCountry ?? '',
    ...(instagram ? { socialLinks: { instagram } } : {}),
  }
}

export function leadToCompanyPrefill(lead: PrefillLead): CompanyPrefill {
  return {
    name: lead.companyName?.trim() || `${lead.firstName} ${lead.lastName}`.trim(),
    email: lead.email,
    firstName: lead.firstName,
    lastName: lead.lastName,
    phone: lead.phone ?? '',
    website: lead.websiteUrl ?? '',
    industry: lead.industry ?? '',
    city: lead.cities?.[0] ?? '',
    country: lead.hqCountry ?? '',
  }
}
