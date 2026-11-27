/**
 * The public base URL of the app (no trailing slash). Throws when
 * NEXT_PUBLIC_APP_URL is unset, so links in emails, QR codes and invites are
 * never built as relative paths.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  let url = raw.replace(/\/+$/, '')
  // In production the public URL is always https. An http:// value here once
  // caused an infinite http→https redirect loop, so upgrade it rather than trust it.
  if (process.env.NODE_ENV === 'production' && url.startsWith('http://')) {
    console.error('[app-url] NEXT_PUBLIC_APP_URL uses http:// in production; upgrading to https://')
    url = 'https://' + url.slice('http://'.length)
  }
  return url
}
