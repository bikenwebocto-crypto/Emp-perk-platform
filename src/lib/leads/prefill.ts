// Maps a lead to the initial values of the admin "add merchant" / "add company"
// forms when an admin converts it. Pure so it can be unit tested.

export interface PrefillLead {
  firstName: string
  lastName: string
  email: string
  phone: string | null
  companyName: string
  industry?: string | null
  cities?: string[] | null
  websiteUrl?: string | null
  hqCountry?: string | null
}

export interface MerchantPrefill {
  businessName: string
  contactName: string
  email: string
  contactPhone: string
  website: string
  categoryId: string
  city: string
}

export interface CompanyPrefill {
  name: string
  email: string
  firstName: string
  lastName: string
  phone: string
  country: string
}

/** Where the Convert action sends the admin for each lead type. */
export function convertHref(lead: { id: string; type: 'MERCHANT' | 'EMPLOYER' }): string {
  const base = lead.type === 'MERCHANT' ? '/admin/merchants/add' : '/admin/companies/add'
  return `${base}?leadId=${encodeURIComponent(lead.id)}`
}

/** Picks a category only when exactly one has the same name (case-insensitive). */
export function matchCategoryId(
  industry: string | null | undefined,
  categories: { id: string; name: string }[],
): string {
  const term = industry?.trim().toLowerCase()
  if (!term) return ''
  const matches = categories.filter((c) => c.name.trim().toLowerCase() === term)
  return matches.length === 1 ? matches[0]!.id : ''
}

export function leadToMerchantPrefill(
  lead: PrefillLead,
  categories: { id: string; name: string }[],
): MerchantPrefill {
  return {
    businessName: lead.companyName,
    contactName: `${lead.firstName} ${lead.lastName}`.trim(),
    email: lead.email,
    contactPhone: lead.phone ?? '',
    website: lead.websiteUrl ?? '',
    categoryId: matchCategoryId(lead.industry, categories),
    city: lead.cities?.[0] ?? '',
  }
}

export function leadToCompanyPrefill(lead: PrefillLead): CompanyPrefill {
  return {
    name: lead.companyName,
    email: lead.email,
    firstName: lead.firstName,
    lastName: lead.lastName,
    phone: lead.phone ?? '',
    country: lead.hqCountry ?? '',
  }
}
