export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  tiktok?: string;
}

export const SOCIAL_LINK_PLATFORMS = ['instagram', 'facebook', 'twitter', 'tiktok'] as const;
export type SocialLinkPlatform = (typeof SOCIAL_LINK_PLATFORMS)[number];

const URL_RE = /^https?:\/\/\S+$/i;

/**
 * Drop empty/whitespace values and non-strings. Returns undefined when nothing
 * remains so we never persist `{ instagram: "" }` noise.
 */
export function cleanSocialLinks(input: unknown): SocialLinks | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const out: SocialLinks = {};
  for (const platform of SOCIAL_LINK_PLATFORMS) {
    const value = (input as Record<string, unknown>)[platform];
    if (typeof value === 'string' && value.trim()) out[platform] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Validate every provided value is an http(s) URL. Empty/missing values are
 * allowed (fields are optional). Returns an error message or null when valid.
 */
export function validateSocialLinks(input: unknown): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== 'object') return 'Social links must be an object';
  for (const platform of SOCIAL_LINK_PLATFORMS) {
    const value = (input as Record<string, unknown>)[platform];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !URL_RE.test(value.trim())) {
      return `Invalid ${platform} URL`;
    }
  }
  return null;
}

/**
 * Spread the incoming partial over the existing stored object so editing one
 * platform never wipes the others, then drop empty values.
 */
export function mergeSocialLinks(existing: unknown, incoming: unknown): SocialLinks | undefined {
  const base = cleanSocialLinks(existing) ?? {};
  const next = cleanSocialLinks(incoming) ?? {};
  return cleanSocialLinks({ ...base, ...next });
}
