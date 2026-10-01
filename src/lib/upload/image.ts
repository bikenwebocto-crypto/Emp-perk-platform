// Generic image upload / delete utility.
//
// Delegates to Supabase Storage. Every upload type (offer images,
// merchant logos, hero banners, QR codes, etc.) passes its own
// bucket name and folder prefix so assets stay isolated.
// The filename is always `{prefix}/{timestamp}-{random}.{ext}` —
// collisions are effectively impossible.
//
// Supports both browser client (default) and server/admin client
// via the optional `supabase` option — so this is the single upload
// entry point for the entire application.
//
// This file replaces the offer-specific `src/lib/upload-offer-image.ts`
// which now delegates here.

import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadImageOptions {
  /** Supabase Storage bucket name, e.g. "offer-images" or "merchant-logos". */
  bucket: string
  /** Folder prefix inside the bucket, e.g. "offer-images" or "merchant-logos". */
  folder?: string
  /** Optional file-extension override (defaults to the real extension). */
  ext?: string
  /**
   * Optional Supabase client override. Use `getAdminClient()` to upload
   * from server context without relying on browser auth. Defaults to
   * the browser client when omitted.
   */
  supabase?: SupabaseClient
}

export interface DeleteImageOptions {
  bucket: string
  /** Optional Supabase client override (same semantics as UploadImageOptions). */
  supabase?: SupabaseClient
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export async function uploadImage(
  file: File,
  options: UploadImageOptions,
): Promise<string> {
  const supabase = options.supabase ?? createClient()
  const ext = options.ext || file.name.split('.').pop() || 'jpg'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const folder = options.folder ?? options.bucket
  const path = `${folder}/${timestamp}-${random}.${ext}`
  console.log('[UPLOAD] Uploading to Supabase Storage:', {
    bucket: options.bucket,
    folder,
    path,
    ext,
    timestamp,
    random,
  })
  
  const { error } = await supabase.storage
    .from(options.bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    })

  if (error) {
    console.error('[UPLOAD] Supabase Storage error:', {
      message: error.message,
      name: error.name,
      ...(error as any).statusCode && { statusCode: (error as any).statusCode },
      ...(error as any).error && { error: (error as any).error },
      ...(error as any).details && { details: (error as any).details },
      ...(error as any).hint && { hint: (error as any).hint },
    })
    throw new Error(`Upload failed: ${error.message}`)
  }

  const { data: urlData } = supabase.storage
    .from(options.bucket)
    .getPublicUrl(path)

  console.log('[UPLOAD] Success', { publicUrl: urlData.publicUrl })

  return urlData.publicUrl
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteImage(
  url: string,
  options: DeleteImageOptions,
): Promise<void> {
  try {
    const supabase = options.supabase ?? createClient()
    const urlObj = new URL(url)
    const segments = urlObj.pathname.split('/')
    const bucketIndex = segments.findIndex((s) => s === options.bucket)
    if (bucketIndex === -1) return
    const path = segments.slice(bucketIndex).join('/')
    await supabase.storage.from(options.bucket).remove([path])
  } catch {
    // Silently fail — stale references are harmless
  }
}

// ---------------------------------------------------------------------------
// Preset: Offer Images
// ---------------------------------------------------------------------------

export const OFFER_IMAGE_OPTIONS: UploadImageOptions = {
  bucket: 'offer-images',
  folder: 'offer-images',
}

// ---------------------------------------------------------------------------
// Preset: Merchant Logo
// ---------------------------------------------------------------------------

export const MERCHANT_LOGO_OPTIONS: UploadImageOptions = {
  bucket: 'offer-images',
  folder: 'Brand_logo',
}

export const COMPANY_LOGO_OPTIONS  : UploadImageOptions = {
  bucket: 'offer-images',
  folder: 'Brand_logo',
}

// ---------------------------------------------------------------------------
// Preset: Merchant Cover Image
// ---------------------------------------------------------------------------

export const MERCHANT_COVER_OPTIONS: UploadImageOptions = {
  bucket: 'offer-images',
  folder: 'Brand_logo',
}

// ---------------------------------------------------------------------------
// Preset: QR Codes
// ---------------------------------------------------------------------------

export const QR_OPTIONS: UploadImageOptions = {
  bucket: 'offer-images',
  folder: 'qr-code',
}

// ---------------------------------------------------------------------------
// Preset: Banner Images (merchant banner bookings)
// ---------------------------------------------------------------------------

export const BANNER_IMAGE_OPTIONS: UploadImageOptions = {
  bucket: 'offer-images',
  folder: 'Brand_banner',
}

export const EMPLOYEE_AVATAR_OPTIONS: UploadImageOptions = {
  bucket: 'offer-images',
  folder: 'employee-avatars',
}

// ---------------------------------------------------------------------------
// Preset: Ticket/Complaint Evidence (employee complaint screenshots)
// ---------------------------------------------------------------------------

export const TICKET_EVIDENCE_OPTIONS: UploadImageOptions = {
  bucket: 'offer-images',
  folder: 'tickets',
}
