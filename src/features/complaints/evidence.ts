// Shared evidence/attachment validation for complaint & ticket flows.

export const MAX_EVIDENCE_URLS = 5

/**
 * Coerce client-provided evidence to a safe array of public http(s) URLs.
 * Invalid entries are silently dropped (never stored), and the array is
 * capped at MAX_EVIDENCE_URLS to keep payloads bounded.
 */
export function sanitizeEvidenceUrls(value: unknown): string[] {
  if (value === undefined || value === null || !Array.isArray(value)) return []
  return value
    .filter((u): u is string => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//.test(u))
    .slice(0, MAX_EVIDENCE_URLS)
}