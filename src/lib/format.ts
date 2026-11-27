// Shared display formatters. Platform currency is EUR (Cyprus).

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

/** One-line address from whichever parts are present, or `fallback` when none are. */
export function formatAddress(address: AddressParts | null | undefined, fallback = 'No address on file'): string {
  if (!address) return fallback
  const cityLine = [address.postalCode, address.city].filter(Boolean).join(' ')
  const parts = [address.line1, address.line2, cityLine, address.state, address.country]
    .map((p) => p?.trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : fallback
}
