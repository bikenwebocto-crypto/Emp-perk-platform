import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getAdminClient } from '@/lib/supabase/admin'
import { buildAuditData, createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import { authorizeBulkCompany, bulkRowsSchema, errorResponse } from '@/lib/employees/bulk-request'
import { splitName, validateBulkRows, type ValidatedBulkRow } from '@/lib/employees/bulk-validate'

// Stay well inside the PgBouncer pool.
const CONCURRENCY = 5

interface BulkCreateResult {
  clientId: string
  sourceRow?: number
  email: string
  status: 'CREATED' | 'FAILED'
  reason?: string
  employeeId?: string
  emailSent?: boolean
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx]!)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Employees log in through Supabase Auth, and the login sync matches the
 * Supabase user to our Account by email. Nothing else in the app creates
 * that Supabase user, so the invite email both creates it and lets the
 * employee set a password (the link lands on /login, which shows the
 * set-password view).
 */
async function sendInvite(email: string, companyId: string): Promise<boolean> {
  try {
    const { error } = await getAdminClient().auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login`,
      data: { role: 'EMPLOYEE', companyId },
    })
    if (error) {
      console.error('[BULK_EMPLOYEES] invite failed', email, error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[BULK_EMPLOYEES] invite failed', email, err)
    return false
  }
}

// POST /api/admin/employees/bulk — create the rows the admin selected.
// Body: { companyId, rows }. Rows are re-validated here; the client's
// view of validity is never trusted.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return errorResponse(400, 'VALIDATION', 'Invalid JSON body')

    const auth = await authorizeBulkCompany(body.companyId)
    if (!auth.ok) return auth.response
    const { user, companyId } = auth

    const parsed = bulkRowsSchema.safeParse(body.rows)
    if (!parsed.success) {
      return errorResponse(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid rows')
    }

    const { rows } = await validateBulkRows(companyId, parsed.data)

    const createRow = async (row: ValidatedBulkRow): Promise<BulkCreateResult> => {
      const base = { clientId: row.clientId, sourceRow: row.sourceRow, email: row.email }
      if (!row.valid) {
        return { ...base, status: 'FAILED', reason: row.errors.map((e) => e.message).join('; ') }
      }

      const pkId = crypto.randomUUID()
      const { firstName, lastName } = splitName(row.name)
      try {
        await prisma.$transaction(async (tx) => {
          await tx.account.create({
            data: {
              authUserId: pkId,
              email: row.email,
              role: 'EMPLOYEE',
              profileType: 'EMPLOYEE',
              status: 'ACTIVE',
              createdBy: user.id,
            },
          })
          await tx.employee.create({
            data: {
              id: pkId,
              accountId: pkId,
              companyId,
              firstName,
              lastName,
              department: row.department || null,
              jobTitle: row.jobTitle || null,
              phone: row.phone || null,
              employeeId: row.employeeId || null,
              status: 'ACTIVE',
              joinMethod: 'csv_import',
              invitedAt: new Date(),
              invitedBy: user.id,
            },
          })
          await tx.auditLog.create({
            data: buildAuditData(
              fromCurrentUser(user, 'EMPLOYEE_CREATED', 'employee', pkId, {
                changes: { email: row.email, companyId, department: row.department || null },
                metadata: { source: 'bulk_upload', sourceRow: row.sourceRow ?? null },
              }),
            ),
          })
        })
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return { ...base, status: 'FAILED', reason: 'Email already exists' }
        }
        console.error('[BULK_EMPLOYEES] create failed', row.email, err)
        return { ...base, status: 'FAILED', reason: 'Could not create employee. Please try again.' }
      }

      // After commit — an email failure never fails the row.
      const emailSent = await sendInvite(row.email, companyId)
      return { ...base, status: 'CREATED', employeeId: pkId, emailSent }
    }

    const results = await mapWithConcurrency(rows, CONCURRENCY, createRow)
    const created = results.filter((r) => r.status === 'CREATED').length
    const summary = { total: results.length, created, failed: results.length - created }

    await createAuditLog(
      fromCurrentUser(user, 'EMPLOYEES_BULK_CREATED', 'company', companyId, {
        metadata: {
          ...summary,
          emailsFailed: results.filter((r) => r.status === 'CREATED' && !r.emailSent).length,
        },
      }),
    )

    return NextResponse.json({ success: true, data: { summary, results } })
  } catch (error) {
    console.error('Bulk employee create error:', error)
    return errorResponse(500, 'INTERNAL', 'Internal server error')
  }
}
