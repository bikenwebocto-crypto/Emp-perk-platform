// Shared display formatters. Platform currency is EUR (Cyprus).

const dmy = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Nicosia' })
const dmyTime = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Nicosia' })

/** Day-first date, e.g. 15/08/2026 (Asia/Nicosia). */
export const formatDateDMY = (d: Date | string | number) => dmy.format(new Date(d))

/** Day-first date and time, e.g. 15/08/2026, 14:05 (Asia/Nicosia). */
export const formatDateTimeDMY = (d: Date | string | number) => dmyTime.format(new Date(d))

export const eurCompact = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const eurExact = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

/** Formats a value, or returns an em dash when it is null/undefined. */
export const orDash = <T,>(v: T | null | undefined, fmt: (v: T) => string) =>
  v == null ? '—' : fmt(v)

export interface AddressParts {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
}

type BranchDisplayRecord = Record<string, unknown>

function displayRecord(value: unknown): BranchDisplayRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as BranchDisplayRecord
    : null
}

function displayText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** One-line address from whichever parts are present, or `fallback` when none are. */
export function formatAddress(address: AddressParts | null | undefined, fallback = 'No address on file'): string {
  if (!address) return fallback
  const cityLine = [address.postalCode, address.city].filter(Boolean).join(' ')
  const parts = [address.line1, address.line2, cityLine, address.state, address.country]
    .map((p) => p?.trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : fallback
}

/** Formats either the nested or flattened branch shape used by admin APIs. */
export function formatBranchAddress(branch: unknown, fallback = 'No address on file'): string {
  const record = displayRecord(branch)
  if (!record) return fallback

  const addressValue = record.address
  const addressText = typeof addressValue === 'string' ? displayText(addressValue) : null
  if (addressText) return addressText

  const address = displayRecord(addressValue)
  const formattedAddress = displayText(address?.formattedAddress, address?.fullAddress)
  if (formattedAddress) return formattedAddress

  return formatAddress({
    line1: displayText(address?.line1, address?.addressLine1, record.addressLine1, record.line1),
    line2: displayText(address?.line2, address?.addressLine2, record.addressLine2, record.line2),
    city: displayText(address?.city, record.city),
    state: displayText(address?.state, record.state),
    postalCode: displayText(address?.postalCode, address?.zip, record.postalCode, record.zip),
    country: displayText(address?.country, record.country),
  }, fallback)
}

/** Uses a meaningful label for missing/malformed names and never exposes IDs. */
export function formatBranchName(branch: unknown, fallback = 'Branch'): string {
  const record = displayRecord(branch)
  return displayText(record?.name, record?.branchName) ?? fallback
}
