import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import { forbidden } from '@/lib/api-auth'
import { buildPreview, parseCsvBody, validateRows, type ValidRow } from '@/lib/company-activation/employee-csv'
import { inviteAuthUser, normalizeEmail, rollbackAuthUser } from '@/services/employee-invite.service'

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}
function notFound(message = 'Company not found') {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
    { status: 404 }
  )
}
function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message } },
    { status: 400 }
  )
}
function internalError(error: unknown) {
  console.error('CSV confirm error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}

interface CsvRowResult {
  email: string
  status: 'CREATED' | 'FAILED'
  reason?: string
  employeeId?: string
}

interface ConfirmBody {
  csv?: string
  bodyHash?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return unauthorized()
    if (user.userType !== 'admin') return forbidden(user.userType)

    const { id } = await params
    const company = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true, deletedAt: true } })
    if (!company || company.deletedAt) return notFound()

    const body = (await request.json().catch(() => ({}))) as ConfirmBody
    const csv = body.csv
    const bodyHash = body.bodyHash
    if (!csv) return badRequest('csv body is required')
    if (!bodyHash) return badRequest('bodyHash is required (must match the preview)')

    // Re-validate against current DB state. Refuse if the previously
    // emitted bodyHash does not match the current body — this prevents
    // an admin from confirming a stale preview after another admin
    // already added/removed employees.
    const preview = await buildPreview(csv, id)
    if (preview.bodyHash !== bodyHash) {
      return badRequest('CSV body has changed since preview. Re-run the preview.')
    }
    if (preview.validCount === 0) {
      return badRequest('No valid rows to import. Fix the invalid rows and retry.')
    }

    // Re-parse + re-validate to get the fresh valid set. The buildPreview
    // call above already did this but did not return the full rows
    // for re-derivation; we re-run to get the typed rows.
    const rows = await parseCsvBody(csv)
    const existingEmployees = await prisma.employee.findMany({
      where: { companyId: id, deletedAt: null },
      select: { accountId: true },
    })
    const existingAccountIds = existingEmployees.map((e) => e.accountId).filter(Boolean) as string[]
    const existingAccounts = existingAccountIds.length > 0
      ? await prisma.account.findMany({ where: { authUserId: { in: existingAccountIds } }, select: { email: true } })
      : []
    const existingEmails = new Set(
      existingAccounts.map((e) => e.email?.toLowerCase()).filter((e): e is string => !!e)
    )
    const { valid } = await validateRows(rows, { companyId: id, existingEmails })

    if (valid.length === 0) {
      return badRequest('No valid rows to import.')
    }

    // One invite + one transaction per row. A failed invite or DB write
    // fails only that row; a DB failure removes the Supabase user again.
    const results: CsvRowResult[] = []
    for (const v of valid) {
      const email = normalizeEmail(v.email)
      const invite = await inviteAuthUser(email, { role: 'EMPLOYEE', firstName: v.firstName, companyName: company.name })
      if (!invite.ok) {
        results.push({ email, status: 'FAILED', reason: invite.message })
        continue
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
            },
          })
          await tx.employee.create({
            data: {
              id: pkId,
              accountId: pkId,
              companyId: id,
              firstName: v.firstName,
              lastName: v.lastName,
              department: v.department,
              jobTitle: v.jobTitle,
              status: 'ACTIVE',
              joinMethod: 'csv_import',
              invitedAt: new Date(),
              invitedBy: user.id,
            },
          })
        })
        results.push({ email, status: 'CREATED', employeeId: pkId })
      } catch (err) {
        await rollbackAuthUser(pkId)
        console.error('[CSV_CONFIRM] create failed', email, err)
        results.push({ email, status: 'FAILED', reason: 'Could not create employee. Please try again.' })
      }
    }
    const imported = results.filter((r) => r.status === 'CREATED').length
    const failed = results.length - imported

    // Create the CSVUploadJob audit row with the real outcome.
    const uploadJob = await prisma.cSVUploadJob.create({
      data: {
        companyId: id,
        adminId: user.id,
        fileName: 'employee-import.csv',
        fileUrl: 'inline://employee-import',
        fileSize: csv.length,
        totalRows: preview.totalRows,
        processedRows: preview.totalRows,
        successCount: imported,
        errorCount: preview.invalidCount + failed,
        status: 'COMPLETED',
        completedAt: new Date(),
        metadata: { bodyHash },
      },
    })

    // Record rejected rows in CSVRejectedRow for the audit trail.
    for (const r of preview.invalidRows) {
      await prisma.cSVRejectedRow.create({
        data: {
          csvUploadId: uploadJob.id,
          rowNumber: r.rowNumber,
          reason: r.reason,
          rowData: r.raw as any,
        },
      })
    }

    await createAuditLog(fromCurrentUser(user, 'EMPLOYEE_CSV_IMPORTED', 'company', id, {
      metadata: { total: preview.totalRows, imported, rejected: preview.invalidCount, failed },
    }))

    return NextResponse.json({
      success: true,
      data: {
        jobId: uploadJob.id,
        imported,
        rejected: preview.invalidCount,
        failed,
        results,
      },
      message: `Imported ${imported} employees. ${preview.invalidCount} rejected.${failed ? ` ${failed} failed.` : ''}`,
    })
  } catch (error) {
    return internalError(error)
  }
}
