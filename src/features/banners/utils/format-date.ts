/**
 * Banner dates are calendar dates, not instants. They are stored at midnight
 * UTC (`new Date('2026-10-20')`), so formatting them with `toLocaleDateString()`
 * can shift the day by one in timezones behind UTC. These helpers read the
 * `YYYY-MM-DD` prefix and rebuild the date locally, which keeps the displayed
 * day identical to the stored day everywhere.
 */

const DISPLAY = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/** `'2026-10-20' | '2026-10-20T00:00:00.000Z'` -> `'20 Oct 2026'`. */
export function formatBannerDate(value: string | Date | null | undefined): string | null {
  const parts = dateParts(value)
  if (!parts) return null
  return DISPLAY.format(new Date(parts[0], parts[1] - 1, parts[2]))
}

/** Value for an `<input type="date">`, i.e. always `YYYY-MM-DD`. */
export function bannerDateInputValue(value: string | Date | null | undefined): string {
  const parts = dateParts(value)
  if (!parts) return ''
  return `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`
}

function dateParts(value: string | Date | null | undefined): [number, number, number] | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()]
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null

  return [Number(match[1]), Number(match[2]), Number(match[3])]
}
