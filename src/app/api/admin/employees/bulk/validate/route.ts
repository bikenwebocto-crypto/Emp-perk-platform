import { NextRequest, NextResponse } from 'next/server'
import { authorizeBulkCompany, bulkRowsSchema, errorResponse } from '@/lib/employees/bulk-request'
import {
  BulkCsvError,
  MAX_BULK_ROWS,
  parseBulkCsv,
  validateBulkRows,
  type BulkRowInput,
} from '@/lib/employees/bulk-validate'

// POST /api/admin/employees/bulk/validate — parse + validate, nothing is saved.
// Body: { companyId, csv } on first load, or { companyId, rows } to re-check edits.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return errorResponse(400, 'VALIDATION', 'Invalid JSON body')

    const auth = await authorizeBulkCompany(body.companyId)
    if (!auth.ok) return auth.response

    const hasCsv = typeof body.csv === 'string'
    const hasRows = Array.isArray(body.rows)
    if (hasCsv === hasRows) {
      return errorResponse(400, 'VALIDATION', 'Provide exactly one of "csv" or "rows"')
    }

    let rows: BulkRowInput[]
    if (hasCsv) {
      if (body.csv.length > MAX_BULK_ROWS * 2000) {
        return errorResponse(400, 'VALIDATION', 'CSV file is too large')
      }
      try {
        rows = await parseBulkCsv(body.csv)
      } catch (err) {
        if (err instanceof BulkCsvError) return errorResponse(400, 'INVALID_CSV', err.message)
        throw err
      }
    } else {
      const parsed = bulkRowsSchema.safeParse(body.rows)
      if (!parsed.success) {
        return errorResponse(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid rows')
      }
      rows = parsed.data
    }

    const result = await validateBulkRows(auth.companyId, rows)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('Bulk employee validate error:', error)
    return errorResponse(500, 'INTERNAL', 'Internal server error')
  }
}
