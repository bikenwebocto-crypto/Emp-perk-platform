// Shared query parsing and safe projections for the admin audit APIs
// (/api/admin/audit-logs, /api/admin/audit-logs/[id], /api/admin/billing/audit).
//
// Pure functions, no Prisma client import, so they are unit-testable.
// Nothing here invents data: a value that was never recorded is returned as
// null and the UI shows it as "Not recorded".

import type { Prisma } from '@prisma/client'
import { redactAuditPayload } from '@/services/audit-log.service'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const INT_RE = /^\d+$/

export const AUDIT_ACTOR_TYPES = ['admin', 'merchant', 'company_admin', 'employee', 'system'] as const
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string }

/**
 * Strict pagination parsing. Missing values fall back to defaults; anything
 * present but not a positive integer (e.g. "abc", "0", "-1", "1.5") is an error
 * rather than being silently coerced.
 */
export function parsePagination(
  sp: URLSearchParams,
  defaultPageSize = DEFAULT_PAGE_SIZE,
): ParseResult<{ page: number; pageSize: number; skip: number }> {
  const rawPage = sp.get('page')
  const rawSize = sp.get('pageSize')
  let page = 1
  let pageSize = defaultPageSize
  if (rawPage !== null && rawPage !== '') {
    if (!INT_RE.test(rawPage) || Number(rawPage) < 1 || !Number.isSafeInteger(Number(rawPage))) {
      return { ok: false, message: 'page must be a positive integer' }
    }
    page = Number(rawPage)
  }
  if (rawSize !== null && rawSize !== '') {
    if (!INT_RE.test(rawSize) || Number(rawSize) < 1 || Number(rawSize) > MAX_PAGE_SIZE) {
      return { ok: false, message: `pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}` }
    }
    pageSize = Number(rawSize)
  }
  return { ok: true, value: { page, pageSize, skip: (page - 1) * pageSize } }
}

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

/**
 * `from`/`to` as YYYY-MM-DD (inclusive whole day, UTC) or a full ISO 8601
 * date-time with a timezone (exact instant, inclusive).
 */
function parseBound(value: string, endOfDay: boolean): Date | null {
  if (DATE_RE.test(value)) {
    const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    return isNaN(d.getTime()) ? null : d
  }
  if (ISO_DATETIME_RE.test(value)) {
    const d = new Date(value)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

export function parseDateRange(sp: URLSearchParams): ParseResult<Prisma.DateTimeFilter | null> {
  const from = sp.get('from')?.trim() || ''
  const to = sp.get('to')?.trim() || ''
  const filter: Prisma.DateTimeFilter = {}
  if (from) {
    const d = parseBound(from, false)
    if (!d) return { ok: false, message: 'from must be YYYY-MM-DD or an ISO date-time' }
    filter.gte = d
  }
  if (to) {
    const d = parseBound(to, true)
    if (!d) return { ok: false, message: 'to must be YYYY-MM-DD or an ISO date-time' }
    filter.lte = d
  }
  if (filter.gte && filter.lte && filter.gte > filter.lte) {
    return { ok: false, message: 'from must be on or before to' }
  }
  return { ok: true, value: filter.gte || filter.lte ? filter : null }
}

/** Outcome is stored (when at all) as metadata.outcome or metadata.result. */
export function outcomeWhere(outcome: string): Prisma.AuditLogWhereInput {
  return {
    OR: [
      { metadata: { path: ['outcome'], equals: outcome } },
      { metadata: { path: ['result'], equals: outcome } },
    ],
  }
}

/**
 * Build the WHERE clause for the main audit list from query params.
 * All filtering happens in the database.
 */
export function buildAuditWhere(sp: URLSearchParams): ParseResult<Prisma.AuditLogWhereInput> {
  const and: Prisma.AuditLogWhereInput[] = []
  const val = (k: string) => {
    const v = sp.get(k)?.trim()
    return v && v !== 'ALL' ? v : undefined
  }

  const search = val('search')
  if (search) {
    if (search.length > 100) return { ok: false, message: 'search is too long' }
    and.push({ action: { contains: search, mode: 'insensitive' } })
  }

  const action = val('action')
  if (action) {
    if (action.length > 100) return { ok: false, message: 'Invalid action' }
    and.push({ action })
  }

  // Exact match: values come from the stored distinct values (see /filters).
  const entityType = val('entityType')
  if (entityType) {
    if (entityType.length > 50) return { ok: false, message: 'Invalid entityType' }
    and.push({ entityType })
  }

  const entityId = val('entityId')
  if (entityId) {
    if (!UUID_RE.test(entityId)) return { ok: false, message: 'entityId must be a UUID' }
    and.push({ entityId })
  }

  const actorType = val('actorType')
  if (actorType) {
    if (!(AUDIT_ACTOR_TYPES as readonly string[]).includes(actorType)) {
      return { ok: false, message: 'Unknown actorType' }
    }
    and.push({ actorType })
  }

  const actorId = val('actorId')
  if (actorId) {
    if (!UUID_RE.test(actorId)) return { ok: false, message: 'actorId must be a UUID' }
    and.push({
      OR: [{ adminId: actorId }, { merchantId: actorId }, { companyAdminId: actorId }, { employeeId: actorId }],
    })
  }

  const companyId = val('companyId')
  if (companyId) {
    if (!UUID_RE.test(companyId)) return { ok: false, message: 'companyId must be a UUID' }
    and.push({ OR: [{ companyId }, { entityType: { in: ['company', 'COMPANY'] }, entityId: companyId }] })
  }

  const outcome = val('outcome')
  if (outcome) {
    if (outcome.length > 50) return { ok: false, message: 'Invalid outcome' }
    and.push(outcomeWhere(outcome))
  }

  const range = parseDateRange(sp)
  if (!range.ok) return range
  if (range.value) and.push({ createdAt: range.value })

  return { ok: true, value: and.length ? { AND: and } : {} }
}

// ─────────────────────────────────────────────────────────────
// Projections
// ─────────────────────────────────────────────────────────────

type Person = { firstName: string; lastName: string } | null | undefined

export interface AuditActorRelations {
  actorType: string
  admin?: Person
  merchant?: { businessName: string } | null
  companyAdmin?: Person
  employee?: Person
}

const fullName = (p: Person) => (p ? `${p.firstName} ${p.lastName}`.trim() || null : null)

/** Actor display name. A deleted/unlinked actor is "Unknown", never guessed. */
export function resolveActorName(r: AuditActorRelations): string {
  return (
    fullName(r.admin) ??
    r.merchant?.businessName ??
    fullName(r.companyAdmin) ??
    fullName(r.employee) ??
    (r.actorType === 'system' ? 'System' : 'Unknown')
  )
}

export function resolveActorId(r: {
  adminId?: string | null
  merchantId?: string | null
  companyAdminId?: string | null
  employeeId?: string | null
}): string | null {
  return r.adminId ?? r.merchantId ?? r.companyAdminId ?? r.employeeId ?? null
}

const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export function extractOutcome(metadata: unknown): string | null {
  const m = asObject(metadata)
  return m ? asString(m.outcome) ?? asString(m.result) : null
}

export function extractReason(changes: unknown, metadata: unknown): string | null {
  return asString(asObject(changes)?.reason) ?? asString(asObject(metadata)?.reason)
}

export function extractRequestId(metadata: unknown): string | null {
  return asString(asObject(metadata)?.requestId)
}

export interface AuditFieldChange {
  field: string
  before: unknown
  after: unknown
  /** false when only one side was recorded; the UI must not imply the other. */
  hasBefore: boolean
  hasAfter: boolean
}

export type AuditChangeView =
  | { kind: 'none' }
  | { kind: 'diff'; fields: AuditFieldChange[] }
  /** Only a snapshot of values was stored; no "before" state exists. */
  | { kind: 'snapshot'; values: Record<string, unknown> }
  | { kind: 'raw'; value: unknown }

const BEFORE_KEYS = ['before', 'old', 'previous', 'prev']
const AFTER_KEYS = ['after', 'new', 'next', 'updated']

/**
 * Turn whatever shape `changes` was stored in into a readable comparison,
 * without inventing values. Supported shapes:
 *   { before: {...}, after: {...} }  (and old/new, previous/next)
 *   { from: x, to: y }               (single transition)
 *   { field: { from, to } | { old, new } | { before, after } }
 *   any other object                 → snapshot (after-only)
 * Values are redacted again on read, for rows written before redaction existed.
 */
export function buildChangeView(rawChanges: unknown): AuditChangeView {
  if (rawChanges === null || rawChanges === undefined) return { kind: 'none' }
  const changes = redactAuditPayload(rawChanges)
  const obj = asObject(changes)
  if (!obj) return { kind: 'raw', value: changes }

  // `reason` is shown on its own, not as a changed field.
  const rest: Record<string, unknown> = { ...obj }
  delete rest.reason
  if (Object.keys(rest).length === 0) return { kind: 'none' }

  const bKey = BEFORE_KEYS.find((k) => k in rest)
  const aKey = AFTER_KEYS.find((k) => k in rest)
  const b = bKey ? asObject(rest[bKey]) : null
  const a = aKey ? asObject(rest[aKey]) : null
  if (b || a) {
    const keys = Array.from(new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])).sort()
    return {
      kind: 'diff',
      fields: keys.map((field) => ({
        field,
        before: b?.[field],
        after: a?.[field],
        hasBefore: !!b && field in b,
        hasAfter: !!a && field in a,
      })),
    }
  }

  if ('from' in rest || 'to' in rest) {
    const { from, to, field, ...others } = rest
    const fields: AuditFieldChange[] = [
      {
        field: asString(field) ?? 'value',
        before: from,
        after: to,
        hasBefore: 'from' in rest,
        hasAfter: 'to' in rest,
      },
    ]
    for (const [k, v] of Object.entries(others)) {
      fields.push({ field: k, before: undefined, after: v, hasBefore: false, hasAfter: true })
    }
    return { kind: 'diff', fields }
  }

  const entries = Object.entries(rest)
  const pairShape = (v: unknown) => {
    const o = asObject(v)
    if (!o) return null
    for (const [bk, ak] of [['from', 'to'], ['old', 'new'], ['before', 'after']] as const) {
      if (bk in o || ak in o) return { o, bk, ak }
    }
    return null
  }
  if (entries.length > 0 && entries.every(([, v]) => pairShape(v))) {
    return {
      kind: 'diff',
      fields: entries.map(([field, v]) => {
        const { o, bk, ak } = pairShape(v)!
        return { field, before: o[bk], after: o[ak], hasBefore: bk in o, hasAfter: ak in o }
      }),
    }
  }

  return { kind: 'snapshot', values: rest }
}

/** Metadata keys never returned by the detail API, even redacted. */
const HIDDEN_METADATA_KEYS = new Set(['requestId', 'outcome', 'result', 'reason', 'actor', 'actorId'])

/** Redacted metadata minus keys already shown elsewhere. Null when empty. */
export function safeMetadata(metadata: unknown): Record<string, unknown> | null {
  const m = asObject(redactAuditPayload(metadata))
  if (!m) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(m)) if (!HIDDEN_METADATA_KEYS.has(k)) out[k] = v
  return Object.keys(out).length ? out : null
}
