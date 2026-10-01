import { CATEGORY_LOGO_OPTIONS } from '@/lib/upload/image'

// Category.icon is VARCHAR(50) and also holds legacy icon names ("utensils", "laptop").
// A full public URL doesn't fit, so for uploaded logos we store only the storage path
// inside the existing bucket (e.g. "Brand_logo/1727000000000-ab12cd.png") and rebuild
// the public URL when reading.

export const CATEGORY_ICON_MAX_LENGTH = 50

const BUCKET = CATEGORY_LOGO_OPTIONS.bucket
const FOLDER = CATEGORY_LOGO_OPTIONS.folder ?? CATEGORY_LOGO_OPTIONS.bucket
const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`

export function isCategoryLogoPath(icon: string | null | undefined): icon is string {
  return !!icon && icon.startsWith(`${FOLDER}/`)
}

/** Public URL for an uploaded category logo, or null when `icon` is a legacy icon name. */
export function categoryLogoUrl(icon: string | null | undefined): string | null {
  if (!isCategoryLogoPath(icon)) return null
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  return base ? `${base}${PUBLIC_PREFIX}${icon}` : null
}

/**
 * Turns a public URL returned by uploadImage() into the storage path to store in
 * Category.icon. Returns null unless the URL points at our Supabase project, the
 * expected bucket and logo folder.
 */
export function categoryLogoPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base || parsed.origin !== new URL(base).origin) return null
    if (!parsed.pathname.startsWith(PUBLIC_PREFIX)) return null
    const path = decodeURIComponent(parsed.pathname.slice(PUBLIC_PREFIX.length))
    if (!isCategoryLogoPath(path) || path.includes('..')) return null
    return path
  } catch {
    return null
  }
}
