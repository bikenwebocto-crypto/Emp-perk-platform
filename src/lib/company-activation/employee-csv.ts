/**
 * Employee CSV import validation + preview logic.
 *
 * The validator is shared between the preview API (no DB writes)
 * and the confirm API (writes). It is intentionally pure — takes
 * rows in, returns ValidRow | InvalidRow tuples — so the same
 * rules apply whether the user is reviewing or confirming.
 */

import { parse } from 'csv-parse/sync'
import { prisma } from '@/lib/prisma'

export interface ParsedCsvRow {
  rowNumber: number
  raw: Record<string, string>
}

export interface ValidRow {
  rowNumber: number
  firstName: string
  lastName: string
  email: string
  department: string | null
  jobTitle: string | null
}

export interface InvalidRow {
  rowNumber: number
  reason: string
  raw: Record<string, string>
}

export interface ImportPreview {
  totalRows: number
  validCount: number
  invalidCount: number
  validRows: ValidRow[]
  invalidRows: InvalidRow[]
  /** SHA-256 hash of the CSV body so the confirm step can verify nothing changed. */
  bodyHash: string
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Parses a CSV body into rows keyed by lower-cased header. Handles a
 * UTF-8 BOM, CRLF/LF line endings, quoted fields and blank lines.
 * `rowNumber` is the physical CSV line the record ends on (header = 1),
 * so it stays accurate when blank lines are skipped.
 */
export async function parseCsvBody(csv: string): Promise<ParsedCsvRow[]> {
  if (!csv.trim()) return []
  const records: { record: Record<string, string>; info: { lines: number } }[] = parse(csv, {
    bom: true,
    columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    info: true,
  })
  return records.map(({ record, info }) => ({ rowNumber: info.lines, raw: record }))
}

export function normalize(value: string | undefined | null): string {
  return (value ?? '').trim()
}

export function normalizeEmail(value: string | undefined | null): string {
  return normalize(value).toLowerCase()
}

export async function validateRows(
  rows: ParsedCsvRow[],
  options: { companyId: string; existingEmails: Set<string> }
): Promise<{ valid: ValidRow[]; invalid: InvalidRow[] }> {
  const valid: ValidRow[] = []
  const invalid: InvalidRow[] = []
  const seenEmailsInThisFile = new Set<string>()

  // Pull existing emails from DB once, then merge with the in-file
  // duplicate detection so the preview is accurate even on the
  // first pass.
  const existingEmails = options.existingEmails

  for (const row of rows) {
    const firstName = normalize(row.raw.firstname)
    const lastName = normalize(row.raw.lastname)
    const email = normalizeEmail(row.raw.email)
    const department = normalize(row.raw.department) || null
    const jobTitle = normalize(row.raw.jobtitle) || null

    if (!firstName) {
      invalid.push({ rowNumber: row.rowNumber, reason: 'Missing first name', raw: row.raw })
      continue
    }
    if (!lastName) {
      invalid.push({ rowNumber: row.rowNumber, reason: 'Missing last name', raw: row.raw })
      continue
    }
    if (!email) {
      invalid.push({ rowNumber: row.rowNumber, reason: 'Missing email', raw: row.raw })
      continue
    }
    if (!EMAIL_REGEX.test(email)) {
      invalid.push({ rowNumber: row.rowNumber, reason: 'Invalid email format', raw: row.raw })
      continue
    }
    if (seenEmailsInThisFile.has(email)) {
      invalid.push({ rowNumber: row.rowNumber, reason: 'Duplicate email in upload', raw: row.raw })
      continue
    }
    if (existingEmails.has(email)) {
      invalid.push({ rowNumber: row.rowNumber, reason: 'Employee with this email already exists', raw: row.raw })
      continue
    }
    seenEmailsInThisFile.add(email)
    valid.push({ rowNumber: row.rowNumber, firstName, lastName, email, department, jobTitle })
  }

  return { valid, invalid }
}

export async function buildPreview(csv: string, companyId: string): Promise<ImportPreview> {
  const rows = await parseCsvBody(csv)
  const existing = await prisma.employee.findMany({
    where: { companyId, deletedAt: null },
  })
  const existingAccountIds = existing.map((e) => e.accountId).filter(Boolean) as string[]
  const existingAccounts = existingAccountIds.length > 0
    ? await prisma.account.findMany({ where: { authUserId: { in: existingAccountIds } }, select: { authUserId: true, email: true } })
    : []
  const accountEmailMap = new Map(existingAccounts.map((a) => [a.authUserId, a.email]))
  const existingEmails = new Set(existing.map((e) => accountEmailMap.get(e.accountId ?? '')?.toLowerCase() ?? ''))
  const { valid, invalid } = await validateRows(rows, { companyId, existingEmails })

  const bodyHash = await sha256(csv)

  return {
    totalRows: rows.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    validRows: valid,
    invalidRows: invalid,
    bodyHash,
  }
}

async function sha256(input: string): Promise<string> {
  // Edge-compatible SHA-256 via SubtleCrypto. For Node < 19 this
  // would need node:crypto, but Next 15 runs on Node 20+.
  const enc = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
