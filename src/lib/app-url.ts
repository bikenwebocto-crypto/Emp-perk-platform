/**
 * The public base URL of the app (no trailing slash). Throws when
 * NEXT_PUBLIC_APP_URL is unset, so links in emails, QR codes and invites are
 * never built as relative paths.
 */
export function getAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  return raw.replace(/\/+$/, '')
}
