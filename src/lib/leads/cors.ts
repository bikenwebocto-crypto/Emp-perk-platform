/** Origins allowed to call the public leads API, from PUBLIC_SITE_ORIGINS (comma-separated). */
export function allowedOrigins(): string[] {
  return (process.env.PUBLIC_SITE_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Requests without an Origin header (server-to-server, e.g. a WordPress backend post) are
 * not browser cross-origin calls and are allowed; any Origin must be listed.
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  return allowedOrigins().includes(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins().includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
