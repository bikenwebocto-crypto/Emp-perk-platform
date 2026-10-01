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
