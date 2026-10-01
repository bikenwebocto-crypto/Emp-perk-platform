// Merchant suggestions — shared validation, status workflow and auth helpers.
//
// Employees suggest merchants from the mobile app
// (/api/mobile/merchant-suggestions); super admins triage them from the
// admin panel (/api/admin/merchant-suggestions). Both sides import the
// rules from here so the validation and the status workflow cannot drift.

import { NextResponse } from 'next/server'
import type { MerchantSuggestionStatus } from '@prisma/client'
import { getCurrentUser, type CurrentUser } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'

// ─── Constants ────────────────────────────────────────────────────────────

export const MERCHANT_SUGGESTION_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'CONTACTED',
  'REJECTED',
  'CONVERTED',
] as const satisfies readonly MerchantSuggestionStatus[]

// Suggestions still being worked on. An employee may not file a second
// suggestion for the same email/phone while one of these is open.
export const OPEN_SUGGESTION_STATUSES: MerchantSuggestionStatus[] = [
  'PENDING',
  'UNDER_REVIEW',
  'CONTACTED',
]

export const SUGGESTION_RATE_LIMIT = 10
export const SUGGESTION_RATE_WINDOW_MS = 24 * 60 * 60 * 1000

export const REASON_MAX_LENGTH = 2000
export const ADMIN_NOTES_MAX_LENGTH = 5000
const NAME_MAX_LENGTH = 255
const EMAIL_MAX_LENGTH = 255
const WEBSITE_MAX_LENGTH = 500

export function isMerchantSuggestionStatus(value: unknown): value is MerchantSuggestionStatus {
  return (
    typeof value === 'string' &&
    (MERCHANT_SUGGESTION_STATUSES as readonly string[]).includes(value)
  )
}

// ─── Status transitions ───────────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<MerchantSuggestionStatus, MerchantSuggestionStatus[]> = {
  PENDING: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['CONTACTED', 'REJECTED', 'CONVERTED'],
  CONTACTED: ['UNDER_REVIEW', 'REJECTED', 'CONVERTED'],
  REJECTED: ['UNDER_REVIEW'],
  CONVERTED: [],
}

export function getAllowedNextStatuses(
  status: MerchantSuggestionStatus,
): MerchantSuggestionStatus[] {
  return STATUS_TRANSITIONS[status] ?? []
}

export function canTransition(
  from: MerchantSuggestionStatus,
  to: MerchantSuggestionStatus,
): boolean {
  return getAllowedNextStatuses(from).includes(to)
}

export async function readRequestBody(
  request: NextRequest,
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get('content-type') ?? ''

  try {
    if (
      contentType.includes('multipart/form-data') ||
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      const form = await request.formData()
      const body: Record<string, unknown> = {}
      for (const [key, value] of form.entries()) {
        // Only text fields; ignore any uploaded files
        if (typeof value === 'string') body[key] = value
      }
      return body
    }

    const json = await request.json()
    return json && typeof json === 'object' && !Array.isArray(json) ? json : null
  } catch {
    return null
  }
}

// ─── Input normalization ──────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i

/** Adds https:// when no scheme is given; returns null if not a valid http(s) URL. */
export function normalizeWebsite(raw: string): string | null {
  const value = raw.trim()
  const withScheme = SCHEME_RE.test(value) ? value : `https://${value}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // Require a dotted hostname ("example.com"), rejecting "https://foo".
  if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) {
    return null
  }
  return url.toString()
}

/**
 * Strips common formatting (spaces, dashes, dots, parentheses) and keeps an
 * optional leading "+". Returns null unless the result is 7–15 digits.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, '')
  return /^\+?\d{7,15}$/.test(compact) ? compact : null
}

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  if (value.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(value)) return null
  return value
}

export interface MerchantSuggestionInput {
  merchantName: string
  merchantWebsite: string | null
  merchantPhone: string
  merchantEmail: string
  reason: string | null
}

export type ValidationResult =
  | { ok: true; data: MerchantSuggestionInput }
  | { ok: false; errors: Record<string, string> }

export function validateMerchantSuggestionInput(body: unknown): ValidationResult {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const errors: Record<string, string> = {}

  // merchantName — required
  let merchantName = ''
  if (typeof input.merchantName !== 'string' || !input.merchantName.trim()) {
    errors.merchantName = 'Merchant name is required'
  } else if (input.merchantName.trim().length > NAME_MAX_LENGTH) {
    errors.merchantName = `Merchant name must be at most ${NAME_MAX_LENGTH} characters`
  } else {
    merchantName = input.merchantName.trim()
  }

  // merchantWebsite — optional, http(s) only
  let merchantWebsite: string | null = null
  const rawWebsite = input.merchantWebsite
  if (rawWebsite !== undefined && rawWebsite !== null && rawWebsite !== '') {
    if (typeof rawWebsite !== 'string') {
      errors.merchantWebsite = 'Website must be a string'
    } else if (rawWebsite.trim()) {
      const normalized = normalizeWebsite(rawWebsite)
      if (!normalized) {
        errors.merchantWebsite = 'Website must be a valid http or https URL'
      } else if (normalized.length > WEBSITE_MAX_LENGTH) {
        errors.merchantWebsite = `Website must be at most ${WEBSITE_MAX_LENGTH} characters`
      } else {
        merchantWebsite = normalized
      }
    }
  }

  // merchantPhone — required
  let merchantPhone = ''
  if (typeof input.merchantPhone !== 'string' || !input.merchantPhone.trim()) {
    errors.merchantPhone = 'Phone number is required'
  } else {
    const normalized = normalizePhone(input.merchantPhone)
    if (!normalized) {
      errors.merchantPhone = 'Phone number must contain 7–15 digits (optionally starting with +)'
    } else {
      merchantPhone = normalized
    }
  }

  // merchantEmail — required
  let merchantEmail = ''
  if (typeof input.merchantEmail !== 'string' || !input.merchantEmail.trim()) {
    errors.merchantEmail = 'Email is required'
  } else {
    const normalized = normalizeEmail(input.merchantEmail)
    if (!normalized) {
      errors.merchantEmail = 'Email must be a valid email address'
    } else {
      merchantEmail = normalized
    }
  }

  // reason — optional
  let reason: string | null = null
  if (input.reason !== undefined && input.reason !== null) {
    if (typeof input.reason !== 'string') {
      errors.reason = 'Reason must be a string'
    } else if (input.reason.trim().length > REASON_MAX_LENGTH) {
      errors.reason = `Reason must be at most ${REASON_MAX_LENGTH} characters`
    } else {
      reason = input.reason.trim() || null
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    data: { merchantName, merchantWebsite, merchantPhone, merchantEmail, reason },
  }
}

// ─── Responses & auth ─────────────────────────────────────────────────────

export function apiError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({ success: false, error: { code, message, ...extra } }, { status })
}

export type AdminAuthResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; response: NextResponse }

/** Allows platform admins only (userType "admin" or "super_admin"). */
export async function requireAdmin(): Promise<AdminAuthResult> {
  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, response: apiError(401, 'UNAUTHORIZED', 'Unauthorized') }
  }
  const userType: string = user.userType
  if (userType !== 'admin' && userType !== 'super_admin') {
    return { ok: false, response: apiError(403, 'FORBIDDEN', 'Admin access required') }
  }
  return { ok: true, user }
}

/** Parses page/pageSize query params with sane bounds. */
export function parsePagination(searchParams: URLSearchParams, maxPageSize = 50) {
  const page = Math.max(1, Math.floor(Number(searchParams.get('page') ?? '1')) || 1)
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Math.floor(Number(searchParams.get('pageSize') ?? '20')) || 20),
  )
  return { page, pageSize, skip: (page - 1) * pageSize }
}
