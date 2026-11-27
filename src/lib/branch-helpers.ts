import type { BranchStatus, BranchType, BranchDisplayType } from '@/types'

export interface BranchOpeningHour {
  day:
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY'
  open: string
  close: string
  closed?: boolean
}

export const DEFAULT_OPENING_HOURS: BranchOpeningHour[] = [
  { day: 'MONDAY', open: '09:00', close: '18:00' },
  { day: 'TUESDAY', open: '09:00', close: '18:00' },
  { day: 'WEDNESDAY', open: '09:00', close: '18:00' },
  { day: 'THURSDAY', open: '09:00', close: '18:00' },
  { day: 'FRIDAY', open: '09:00', close: '18:00' },
  { day: 'SATURDAY', open: '10:00', close: '16:00' },
  { day: 'SUNDAY', closed: true, open: '00:00', close: '00:00' },
]

export function normalizeOpeningHours(value: unknown): BranchOpeningHour[] {
  if (!Array.isArray(value)) return DEFAULT_OPENING_HOURS
  return value
}

export const DAYS_OF_WEEK: BranchOpeningHour['day'][] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

export const BRANCH_STATUS_OPTIONS: { value: BranchStatus; label: string; description: string }[] = [
  { value: 'ACTIVE', label: 'Active', description: 'Visible to employees and accepting redemptions' },
  { value: 'INACTIVE', label: 'Inactive', description: 'Temporarily hidden from employees' },
  { value: 'CLOSED', label: 'Closed', description: 'Permanently closed at this location' },
]

export const BRANCH_TYPE_OPTIONS: { value: BranchType; label: string; description: string }[] = [
  {
    value: 'IN_STORE',
    label: 'In-Store',
    description: 'Physical location where employees visit. Requires address and coordinates.',
  },
  {
    value: 'ONLINE',
    label: 'Online',
    description: 'Digital or delivery branch. Only one per merchant.',
  },
  {
    value: 'BOTH',
    label: 'In-Store & Online',
    description: 'Physical store that also sells online. Requires address and coordinates.',
  },
]

export const BRANCH_TYPE_LABELS: Record<BranchType, string> = {
  IN_STORE: 'In-Store',
  ONLINE: 'Online',
  BOTH: 'In-Store & Online',
}

export const BRANCH_STATUS_LABELS: Record<BranchStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  CLOSED: 'Closed',
}

export function getBranchDisplayType(branch: {
  branchType: BranchType
  isNationwide?: boolean
  deliveryRadiusKm?: number | null
}): BranchDisplayType {
  if (branch.branchType === 'IN_STORE') return 'IN_STORE'
  if (branch.branchType === 'BOTH') return 'BOTH'
  if (branch.isNationwide || (branch.deliveryRadiusKm ?? 0) > 0) return 'ONLINE_DELIVERY'
  return 'ONLINE_DIGITAL'
}

export const BRANCH_DISPLAY_TYPE_LABELS: Record<BranchDisplayType, string> = {
  IN_STORE: 'In-Store',
  ONLINE_DELIVERY: 'Online (Delivery)',
  ONLINE_DIGITAL: 'Online (Digital)',
  BOTH: 'In-Store & Online',
}

export const BRANCH_DISPLAY_TYPE_STYLES: Record<BranchDisplayType, string> = {
  IN_STORE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
  ONLINE_DELIVERY: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-500',
  ONLINE_DIGITAL: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-500',
  BOTH: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-500',
}

export const BRANCH_STATUS_STYLES: Record<BranchStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  INACTIVE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  CLOSED: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-500',
}

export function isCoordinateValid(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  if (Number.isNaN(value)) return false
  return value >= -180 && value <= 180
}

export function isLatitudeValid(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false
  if (Number.isNaN(value)) return false
  return value >= -90 && value <= 90
}

export function isLongitudeValid(value: number | null | undefined): boolean {
  return isCoordinateValid(value)
}

export interface BranchValidationInput {
  name?: string
  addressLine1?: string
  city?: string
  country?: string
  latitude?: number | null
  longitude?: number | null
  branchType?: BranchType
  isNationwide?: boolean
  deliveryRadiusKm?: number | null
  websiteUrl?: string | null
}

export interface BranchValidationResult {
  valid: boolean
  errors: Record<string, string>
}

export function validateBranchInput(input: BranchValidationInput, partial = false): BranchValidationResult {
  const errors: Record<string, string> = {}

  if (!partial || input.name !== undefined) {
    if (!input.name || input.name.trim().length < 2) {
      errors.name = 'Branch name is required (min 2 characters)'
    }
  }

  if (input.websiteUrl) {
    let ok = false
    try {
      const u = new URL(input.websiteUrl)
      ok = u.protocol === 'http:' || u.protocol === 'https:'
    } catch {}
    if (!ok) errors.websiteUrl = 'Website URL must start with http:// or https://'
  }

  const isDelivery =
    (input.branchType === 'ONLINE' || input.branchType === 'BOTH') && (input.isNationwide === true || (input.deliveryRadiusKm ?? 0) > 0)

  if (input.branchType === 'ONLINE' || input.branchType === 'BOTH') {
    if (isDelivery) {
      if (!input.isNationwide && (!input.deliveryRadiusKm || input.deliveryRadiusKm <= 0)) {
        errors.deliveryRadiusKm = 'Delivery radius is required for delivery merchants'
      }
      if (input.deliveryRadiusKm !== undefined && input.deliveryRadiusKm !== null) {
        if (input.deliveryRadiusKm < 0) {
          errors.deliveryRadiusKm = 'Delivery radius cannot be negative'
        }
        if (input.deliveryRadiusKm > 5000) {
          errors.deliveryRadiusKm = 'Delivery radius cannot exceed 5000 km'
        }
      }
    }
  }

  // In-store branches and online delivery branches both need a physical base
  // location (delivery uses it to measure the radius). Pure digital does not.
  if (input.branchType !== 'ONLINE' || isDelivery) {
    const kind = isDelivery ? 'delivery branches' : 'in-store branches'
    if (!partial || input.addressLine1 !== undefined) {
      if (!input.addressLine1 || input.addressLine1.trim().length < 2) {
        errors.addressLine1 = `Address is required for ${kind}`
      }
    }
    if (!partial || input.city !== undefined) {
      if (!input.city || input.city.trim().length < 2) {
        errors.city = `City is required for ${kind}`
      }
    }
    if (!partial || input.country !== undefined) {
      if (!input.country || input.country.trim().length < 2) {
        errors.country = `Country is required for ${kind}`
      }
    }
    if (!partial || input.latitude !== undefined) {
      if (input.latitude === null || input.latitude === undefined) {
        errors.latitude = `Latitude is required for ${kind}`
      } else if (!isLatitudeValid(input.latitude)) {
        errors.latitude = 'Latitude must be between -90 and 90'
      }
    }
    if (!partial || input.longitude !== undefined) {
      if (input.longitude === null || input.longitude === undefined) {
        errors.longitude = `Longitude is required for ${kind}`
      } else if (!isLongitudeValid(input.longitude)) {
        errors.longitude = 'Longitude must be between -180 and 180'
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

export const SIGNIFICANT_LOCATION_FIELDS = [
  'addressLine1',
  'city',
  'state',
  'latitude',
  'longitude',
] as const

export function isSignificantLocationChange(before: any, after: any): {
  changed: boolean
  fields: string[]
} {
  const fields: string[] = []
  for (const key of SIGNIFICANT_LOCATION_FIELDS) {
    const a = before?.[key]
    const b = after?.[key]
    if (a == null && b == null) continue
    if (a == null || b == null) {
      fields.push(key)
      continue
    }
    if (key === 'latitude' || key === 'longitude') {
      if (Math.abs(Number(a) - Number(b)) > 0.000001) fields.push(key)
    } else if (String(a).trim() !== String(b).trim()) {
      fields.push(key)
    }
  }
  return { changed: fields.length > 0, fields }
}

export function buildAddressString(parts: {
  addressLine1?: string | null
  addressLine2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}): string {
  return [
    parts.addressLine1,
    parts.addressLine2,
    parts.city,
    parts.state,
    parts.postalCode,
    parts.country,
  ]
    .filter(Boolean)
    .map((p) => String(p).trim())
    .filter(Boolean)
    .join(', ')
}

export function hasDuplicateAddress(branch: {
  addressLine1?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}, existing: Array<{
  id: string
  addressLine1: string
  city: string
  state: string | null
  postalCode: string
  country: string
}>): boolean {
  return existing.some((b) =>
    b.id !== (branch as any).id &&
    b.addressLine1.trim().toLowerCase() === (branch.addressLine1 ?? '').trim().toLowerCase() &&
    b.city.trim().toLowerCase() === (branch.city ?? '').trim().toLowerCase() &&
    (b.state ?? '').trim().toLowerCase() === (branch.state ?? '').trim().toLowerCase() &&
    b.postalCode.trim().toLowerCase() === (branch.postalCode ?? '').trim().toLowerCase() &&
    b.country.trim().toLowerCase() === (branch.country ?? '').trim().toLowerCase()
  )
}

export function formatOpeningHours(hours: any): string {
  if (!hours) return 'Not specified'
  if (Array.isArray(hours)) {
    return hours
      .map((h: any) => {
        if (h.closed) return `${h.day?.slice(0, 3) ?? ''}: Closed`
        return `${h.day?.slice(0, 3) ?? ''}: ${h.open}–${h.close}`
      })
      .join(' • ')
  }
  return 'Custom schedule'
}

// A BOTH branch is a physical store that also sells online, so it counts as
// in-store and as online wherever branches are matched.
export const PHYSICAL_BRANCH_TYPES = ['IN_STORE', 'BOTH'] as const satisfies readonly BranchType[]
export const ONLINE_BRANCH_TYPES = ['ONLINE', 'BOTH'] as const satisfies readonly BranchType[]

/** Has a physical store (IN_STORE or BOTH). */
export function isPhysicalBranch(type: BranchType | string | null | undefined): boolean {
  return type === 'IN_STORE' || type === 'BOTH'
}

/** Sells online (ONLINE or BOTH). */
export function isOnlineBranch(type: BranchType | string | null | undefined): boolean {
  return type === 'ONLINE' || type === 'BOTH'
}
