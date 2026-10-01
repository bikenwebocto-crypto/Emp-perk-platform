import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'CY'

// Any input -> E.164 ("+35799123456"), or null if invalid.
// Numbers without "+" are read as DEFAULT_PHONE_COUNTRY.
export function toE164(raw: unknown, country: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const p = parsePhoneNumberFromString(raw.trim(), country)
  return p?.isValid() ? p.number : null
}

export const isValidPhone = (raw: unknown, country?: CountryCode) => toE164(raw, country) !== null

// For display: "+357 99 123456"
export function formatPhone(value: string | null | undefined): string {
  if (!value) return ''
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value
}

export function phoneCountry(value: string | null | undefined): CountryCode | undefined {
  return value ? parsePhoneNumberFromString(value)?.country : undefined
}