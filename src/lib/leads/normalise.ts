// Normalisers for website form values. Every value arrives as text (form-encoded) or
// loosely typed JSON, so each function accepts unknown and returns a string or null.

/** Trims; empty string or missing → null. */
export function cleanText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

export function normaliseEmail(value: unknown): string | null {
  return cleanText(value)?.toLowerCase() ?? null;
}

/**
 * Strips spaces and symbols; a leading 00 becomes +; numbers without a country code
 * are treated as Cypriot (+357). "99 123456" → "+35799123456".
 */
export function normalisePhone(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const hasPlus = /^[^\d]*\+/.test(text); // "+357…" or "(+44) …"
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  return `+357${digits}`;
}

/**
 * Cypriot number → "+357XXXXXXXX" (exactly 8 digits after the country code).
 * Accepts "99123456", "+357 99 123456" and "0035799123456".
 * Anything else → null, so the caller can report a format error.
 */
export function normaliseCyprusPhone(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('357') && digits.length > 8) digits = digits.slice(3);
  if (digits.length !== 8) return null;
  return `+357${digits}`;
}

/** Adds https:// when no scheme is given. "kafeneio.cy" → "https://kafeneio.cy" */
export function normaliseWebsite(value: unknown): string | null {
  const text = cleanText(value)?.replace(/\s+/g, '');
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

/**
 * LinkedIn profile or company URL → "https://www.linkedin.com/…".
 * Non-LinkedIn hosts are rejected (null).
 */
export function normaliseLinkedIn(value: unknown): string | null {
  const text = cleanText(value)?.replace(/\s+/g, '');
  if (!text) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/') return null;
  return `https://www.linkedin.com${path}`;
}

/** Profile URL, "@name" or "name" → "@name". */
export function normaliseInstagram(value: unknown): string | null {
  const text = cleanText(value)?.replace(/\s+/g, '');
  if (!text) return null;
  const fromUrl = text.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i);
  const handle = (fromUrl?.[1] ?? text).replace(/^@+/, '').replace(/\/+$/, '');
  return handle ? `@${handle}` : null;
}

/** The consent wording to store: the text the website sent, or "Accepted" for a checkbox token. */
export function consentLabel(value: unknown): string {
  const text = cleanText(value);
  if (!text) return 'Accepted';
  const lower = text.toLowerCase();
  if (['true', 'on', '1', 'yes'].includes(lower)) return 'Accepted';
  return text;
}

/** Consent values the website may send: true, "true", "on", "1" — or the consent text itself. */
export function isTruthyConsent(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'number') return value === 1;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  return !['false', '0', 'off', 'no', 'unchecked', 'undefined', 'null'].includes(text);
}

/** Aliases with the spelling used by the website spec; both names are exported. */
export const normalizeCyprusPhone = normaliseCyprusPhone;
export const normalizeEmail = normaliseEmail;
export const normalizeInstagram = normaliseInstagram;
export const normalizeLinkedIn = normaliseLinkedIn;
export const normalizePhone = normalisePhone;
export const normalizeWebsite = normaliseWebsite;
