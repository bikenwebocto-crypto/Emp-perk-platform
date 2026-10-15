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

/** Adds https:// when no scheme is given. "kafeneio.cy" → "https://kafeneio.cy" */
export function normaliseWebsite(value: unknown): string | null {
  const text = cleanText(value)?.replace(/\s+/g, '');
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

/** Profile URL, "@name" or "name" → "@name". */
export function normaliseInstagram(value: unknown): string | null {
  const text = cleanText(value)?.replace(/\s+/g, '');
  if (!text) return null;
  const fromUrl = text.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i);
  const handle = (fromUrl?.[1] ?? text).replace(/^@+/, '');
  return handle ? `@${handle}` : null;
}
