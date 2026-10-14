import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { inviteAuthUser, normalizeEmail, rollbackAuthUser } from '@/services/employee-invite.service'
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
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } })

    const createRow = async (row: ValidatedBulkRow): Promise<BulkCreateResult> => {
      const email = normalizeEmail(row.email)
      const base = { clientId: row.clientId, sourceRow: row.sourceRow, email }
      if (!row.valid) {
        return { ...base, status: 'FAILED', reason: row.errors.map((e) => e.message).join('; ') }
      }

      const { firstName, lastName } = splitName(row.name)

      // Invite first: the Supabase user id becomes the account/employee id.
      const invite = await inviteAuthUser(email, { role: 'EMPLOYEE', firstName, companyName: company?.name })
      if (!invite.ok) {
        return { ...base, status: 'FAILED', reason: invite.message, emailSent: false }
      }
      const pkId = invite.authUserId

      try {
        await prisma.$transaction(async (tx) => {
          await tx.account.create({
            data: {
              authUserId: pkId,
              email,
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
                changes: { email, companyId, department: row.department || null },
                metadata: { source: 'bulk_upload', sourceRow: row.sourceRow ?? null },
              }),
            ),
          })
        })
      } catch (err) {
        await rollbackAuthUser(pkId)
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return { ...base, status: 'FAILED', reason: 'Email already exists' }
        }
        console.error('[BULK_EMPLOYEES] create failed', email, err)
        return { ...base, status: 'FAILED', reason: 'Could not create employee. Please try again.' }
      }

      return { ...base, status: 'CREATED', employeeId: pkId, emailSent: true }
    }

    const results = await mapWithConcurrency(rows, CONCURRENCY, createRow)
    const created = results.filter((r) => r.status === 'CREATED').length
    const summary = { total: results.length, created, failed: results.length - created }

    await createAuditLog(
      fromCurrentUser(user, 'EMPLOYEES_BULK_CREATED', 'company', companyId, {
        metadata: {
          ...summary,
          // Invite failures — those rows were not created.
          emailsFailed: results.filter((r) => r.emailSent === false).length,
        },
      }),
    )

    return NextResponse.json({ success: true, data: { summary, results } })
  } catch (error) {
    console.error('Bulk employee create error:', error)
    return errorResponse(500, 'INTERNAL', 'Internal server error')
  }
}
