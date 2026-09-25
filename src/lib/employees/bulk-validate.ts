/**
 * Bulk employee upload validation — the single source of truth for both
 * POST /api/admin/employees/bulk/validate (preview, no writes) and
 * POST /api/admin/employees/bulk (create). The create endpoint re-runs
 * this on the submitted rows; client-side validity is never trusted.
 *
 * CSV parsing and email normalisation are shared with the company
 * activation import (src/lib/company-activation/employee-csv.ts).
 */

import { prisma } from '@/lib/prisma'
import {
  EMAIL_REGEX,
  normalize,
  normalizeEmail,
  parseCsvBody,
} from '@/lib/company-activation/employee-csv'

export const MAX_BULK_ROWS = 500

export interface BulkRowInput {
  clientId: string
  sourceRow?: number
  name: string
  email: string
  department?: string
  jobTitle?: string
  phone?: string
  employeeId?: string
}

export type BulkRowField = Exclude<keyof BulkRowInput, 'clientId' | 'sourceRow'>

export interface BulkRowError {
  field: BulkRowField | 'row'
  message: string
}

export interface ValidatedBulkRow extends BulkRowInput {
  valid: boolean
  errors: BulkRowError[]
}

export interface BulkValidationResult {
  rows: ValidatedBulkRow[]
  summary: { total: number; valid: number; invalid: number }
}

// Column limits from prisma/schema.prisma (Account / Employee).
const MAX_LENGTH: Record<BulkRowField, number> = {
  name: 201, // firstName (100) + space + lastName (100)
  email: 255,
  department: 100,
  jobTitle: 100,
  phone: 50,
  employeeId: 100,
}

const FIELD_LABEL: Record<BulkRowField, string> = {
  name: 'Name',
  email: 'Email',
  department: 'Department',
  jobTitle: 'Job title',
  phone: 'Phone',
  employeeId: 'Employee ID',
}

/** Splits a full name into the schema's firstName / lastName columns. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = normalize(name).replace(/\s+/g, ' ')
  const idx = trimmed.indexOf(' ')
  if (idx === -1) return { firstName: trimmed, lastName: '' }
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) }
}

/** Trims every field and lower-cases the email. */
export function normalizeBulkRow(row: BulkRowInput): BulkRowInput {
  return {
    clientId: row.clientId,
    sourceRow: row.sourceRow,
    name: normalize(row.name).replace(/\s+/g, ' '),
    email: normalizeEmail(row.email),
    department: normalize(row.department),
    jobTitle: normalize(row.jobTitle),
    phone: normalize(row.phone),
    employeeId: normalize(row.employeeId),
  }
}

// Header aliases, compared after lower-casing and stripping spaces / _ / -.
const HEADER_ALIASES: Record<string, BulkRowField | 'firstName' | 'lastName'> = {
  name: 'name',
  fullname: 'name',
  firstname: 'firstName',
  lastname: 'lastName',
  email: 'email',
  emailaddress: 'email',
  department: 'department',
  jobtitle: 'jobTitle',
  title: 'jobTitle',
  phone: 'phone',
  phonenumber: 'phone',
  employeeid: 'employeeId',
  empid: 'employeeId',
}

export class BulkCsvError extends Error {}

/**
 * Parses a CSV upload into BulkRowInput rows with a fresh clientId and
 * the CSV line number (header = line 1) as sourceRow. Accepts either a
 * `name` column or `firstName` + `lastName` columns.
 */
export async function parseBulkCsv(csv: string): Promise<BulkRowInput[]> {
  let parsed
  try {
    parsed = await parseCsvBody(csv)
  } catch (err) {
    throw new BulkCsvError(`Could not parse CSV: ${(err as Error).message}`)
  }
  if (parsed.length === 0) throw new BulkCsvError('CSV has no data rows')
  if (parsed.length > MAX_BULK_ROWS) {
    throw new BulkCsvError(`CSV has ${parsed.length} rows; the maximum is ${MAX_BULK_ROWS}`)
  }

  const rows = parsed.map(({ rowNumber, raw }) => {
    const fields: Partial<Record<BulkRowField | 'firstName' | 'lastName', string>> = {}
    for (const [header, value] of Object.entries(raw)) {
      const key = HEADER_ALIASES[header.replace(/[\s_-]/g, '')]
      if (key && !fields[key]) fields[key] = value
    }
    const name =
      fields.name ?? [fields.firstName, fields.lastName].filter(Boolean).join(' ')
    return normalizeBulkRow({
      clientId: crypto.randomUUID(),
      sourceRow: rowNumber,
      name,
      email: fields.email ?? '',
      department: fields.department,
      jobTitle: fields.jobTitle,
      phone: fields.phone,
      employeeId: fields.employeeId,
    })
  })

  const headers = new Set(
    Object.keys(parsed[0]!.raw).map((h) => HEADER_ALIASES[h.replace(/[\s_-]/g, '')]),
  )
  if (!headers.has('email')) throw new BulkCsvError('CSV must have an "email" column')
  if (!headers.has('name') && !headers.has('firstName')) {
    throw new BulkCsvError('CSV must have a "name" column (or "firstName" and "lastName")')
  }

  return rows
}

/**
 * Validates a batch of rows for `companyId`. Checks required fields,
 * lengths, email format, duplicate emails across the whole batch (every
 * row sharing an email is flagged) and emails already registered to any
 * Account (Account.email is globally unique) with one findMany.
 *
 * No per-company seat limit exists in the schema, so none is enforced.
 */
export async function validateBulkRows(
  companyId: string,
  input: BulkRowInput[],
): Promise<BulkValidationResult> {
  void companyId // email uniqueness is global; kept for a future seat limit
  const rows = input.map(normalizeBulkRow)

  const errorsById = new Map<string, BulkRowError[]>(rows.map((r) => [r.clientId, []]))
  const push = (row: BulkRowInput, error: BulkRowError) => errorsById.get(row.clientId)!.push(error)

  // Per-row field checks
  for (const row of rows) {
    if (!row.name) push(row, { field: 'name', message: 'Name is required' })
    if (!row.email) push(row, { field: 'email', message: 'Email is required' })
    else if (!EMAIL_REGEX.test(row.email)) push(row, { field: 'email', message: 'Invalid email format' })

    for (const field of Object.keys(MAX_LENGTH) as BulkRowField[]) {
      const value = row[field] ?? ''
      if (value.length > MAX_LENGTH[field]) {
        push(row, { field, message: `${FIELD_LABEL[field]} must be at most ${MAX_LENGTH[field]} characters` })
      }
    }
    if (row.name && row.name.length <= MAX_LENGTH.name) {
      const { firstName, lastName } = splitName(row.name)
      if (firstName.length > 100 || lastName.length > 100) {
        push(row, { field: 'name', message: 'First and last name must each be at most 100 characters' })
      }
    }
  }

  // Duplicates within the batch — flag every row sharing the email.
  const byEmail = new Map<string, BulkRowInput[]>()
  for (const row of rows) {
    if (!row.email || !EMAIL_REGEX.test(row.email)) continue
    const group = byEmail.get(row.email) ?? []
    group.push(row)
    byEmail.set(row.email, group)
  }
  for (const group of byEmail.values()) {
    if (group.length < 2) continue
    for (const row of group) {
      const others = group
        .filter((o) => o.clientId !== row.clientId)
        .map((o) => (o.sourceRow ? `row ${o.sourceRow}` : 'another row'))
      push(row, { field: 'email', message: `Duplicate email in this upload (also ${others.join(', ')})` })
    }
  }

  // Emails already registered — one query, case-insensitive.
  const candidateEmails = [...byEmail.keys()]
  if (candidateEmails.length > 0) {
    const existing = await prisma.account.findMany({
      where: { email: { in: candidateEmails, mode: 'insensitive' } },
      select: { email: true },
    })
    const taken = new Set(existing.map((a) => a.email.toLowerCase()))
    for (const row of rows) {
      if (taken.has(row.email)) push(row, { field: 'email', message: 'Email already exists' })
    }
  }

  const validated = rows.map((row) => {
    const errors = errorsById.get(row.clientId)!
    return { ...row, valid: errors.length === 0, errors }
  })
  const valid = validated.filter((r) => r.valid).length

  return {
    rows: validated,
    summary: { total: validated.length, valid, invalid: validated.length - valid },
  }
}
