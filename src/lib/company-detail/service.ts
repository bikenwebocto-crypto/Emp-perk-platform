import * as crypto from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { CurrentUser } from '@/lib/supabase/server'
import {
  assertCanDisableAdmin,
  derivePrimaryAdmin,
  ensurePrimaryAdmin,
  PrimaryAdminGuardError,
  summarizeAdmins,
  toAdminSummary,
} from '@/lib/company-contact'
import { buildPreview, parseCsvBody, validateRows } from '@/lib/company-activation/employee-csv'
import { buildAuditData, createAuditLog, fromCurrentUser } from '@/services/audit-log.service'
import { validateUserEmail } from '@/services/user-validation.service'
import { sendCompanyAdminInvitation } from '@/services/company-admin-invitation.service'
import { inviteAuthUser, normalizeEmail, rollbackAuthUser } from '@/services/employee-invite.service'

/**
 * Company Detail operations shared by the Super Admin routes
 * (/api/admin/companies/[id]/...) and the Company Admin routes
 * (/api/company/...). Callers authenticate and resolve `companyId`
 * themselves: Super Admin takes it from the URL, Company Admin from the
 * session only. Everything here re-checks that records belong to
 * `companyId`, so a company admin can never touch another company.
 */

export type CompanyDetailScope = 'super_admin' | 'company_admin'

type User = NonNullable<CurrentUser>

function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ----- Detail ---------------------------------------------------------

export async function getCompanyDetail(companyId: string, scope: CompanyDetailScope) {
  // Auto-fix primary admin: if the company has admins but none flagged
  // isPrimary, promote the oldest ACTIVE admin (per spec). Safe to run
  // on every read — it's a no-op when the invariant is already met.
  try {
    await ensurePrimaryAdmin(companyId)
  } catch (err) {
    console.error('ensurePrimaryAdmin failed for company', companyId, err)
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      billing: true,
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { company: { select: { name: true } } },
      },
      _count: { select: { employees: true, redemptions: true, csvUploads: true } },
      companyAdmins: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        include: { account: { select: { email: true, status: true } } },
      },
    },
  })

  if (!company || company.deletedAt) return null

  // Email lives on the linked account; fill it in after summarizing
  const emailByAdminId = new Map(
    company.companyAdmins.map((a) => [a.id, a.account?.email ?? '']),
  )

  const admins = summarizeAdmins(company.companyAdmins).map((a) => ({
    ...a,
    email: a.email || emailByAdminId.get(a.id) || '',
  }))

  const derived = derivePrimaryAdmin(company.companyAdmins)
  const primaryAdmin = derived
    ? { ...derived, email: derived.email || emailByAdminId.get(derived.id) || '' }
    : null

  const { companyAdmins: _rawAdmins, ...rest } = company
  const base = scope === 'super_admin' ? { ...rest, companyAdmins: company.companyAdmins } : rest

  // The internal admin note is Super Admin only. Status history `changedBy`
  // holds platform-admin ids, which company admins have no use for.
  const scoped =
    scope === 'company_admin'
      ? {
          ...base,
          adminNote: null,
          statusHistory: company.statusHistory.map(({ changedBy: _changedBy, ...h }) => h),
        }
      : base

  return {
    ...scoped,
    companyContact: {
      id: company.id,
      companyName: company.name,
      companyEmail: company.email,
      phone: company.phone,
      website: company.website,
      socialLinks: company.socialLinks,
      status: company.status,
      city: company.city,
      country: company.country,
      industry: company.industry,
      logoUrl: company.logoUrl,
      employeeCount: company._count?.employees ?? 0,
      createdAt: company.createdAt,
    },
    primaryAdmin,
    admins,
    adminCount: admins.length,
    activeAdminCount: admins.filter((a) => a.isActive).length,
  }
}

// ----- Administrators -------------------------------------------------

export interface AddAdminBody {
  firstName?: string
  lastName?: string
  email?: string
  role?: 'OWNER' | 'MEMBER'
  status?: 'ACTIVE' | 'INACTIVE'
}

/**
 * Create a new company admin. Auto-assigns primary if the company has
 * no active primary yet.
 */
export async function createCompanyAdmin(user: User, companyId: string, body: AddAdminBody) {
  try {
    const firstName = (body.firstName ?? '').trim()
    const lastName = (body.lastName ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    const role = body.role === 'OWNER' ? 'OWNER' : 'MEMBER'
    const status = body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'

    if (!firstName) return apiError(400, 'VALIDATION', 'First name is required')
    if (!lastName) return apiError(400, 'VALIDATION', 'Last name is required')
    if (!email) return apiError(400, 'VALIDATION', 'Email is required')
    if (!EMAIL_RE.test(email)) return apiError(400, 'VALIDATION', 'Invalid email address')

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, deletedAt: true },
    })
    if (!company || company.deletedAt) return apiError(404, 'NOT_FOUND', 'Company not found')

    // Reuse the existing email validator — it checks all profile
    // tables (AdminUser, Merchant, CompanyAdmin, Employee) plus the
    // Account table. We refuse any collision.
    const validation = await validateUserEmail(email)
    if (validation.exists) {
      return apiError(409, 'CONFLICT', 'Email is already assigned to another account in the system')
    }

    const result = await prisma.$transaction(async (tx) => {
      const pkId = crypto.randomUUID()
      const account = await tx.account.create({
        data: {
          authUserId: pkId,
          email,
          role: 'COMPANY_ADMIN',
          profileType: 'COMPANY',
          status: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
          createdBy: user.id,
        },
      })

      const admin = await tx.companyAdmin.create({
        data: {
          id: pkId,
          companyId,
          accountId: account?.authUserId,
          firstName,
          lastName,
          isPrimary: false,
          isActive: status === 'ACTIVE',
        },
      })

      await tx.auditLog.create({
        data: buildAuditData(
          fromCurrentUser(user, 'COMPANY_ADMIN_CREATED', 'company_admin', admin.id, {
            metadata: { companyId, email, role, status },
          }),
        ) as any,
      })

      // Auto-fix primary: if this is the first active admin (or the
      // company has no active primary), promote it.
      await ensurePrimaryAdmin(companyId, tx)

      const refreshed = await tx.companyAdmin.findUnique({ where: { id: admin.id } })
      const refreshedAcct = refreshed?.accountId
        ? await tx.account.findUnique({
            where: { authUserId: refreshed.accountId },
            select: { email: true },
          })
        : null
      return { admin: refreshed, email: refreshedAcct?.email ?? '' }
    })

    await sendCompanyAdminInvitation({
      email,
      firstName,
      lastName,
      companyName: company.name ?? '',
      companyId,
      actorType: user.userType,
      actorId: user.profileId,
    })

    return NextResponse.json(
      {
        success: true,
        data: { admin: result.admin ? toAdminSummary(result.admin, result.email) : null },
        message:
          'Company admin created successfully. A welcome email has been sent to the provided email address.',
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof PrimaryAdminGuardError) return apiError(409, error.code, error.message)
    if ((error as { code?: string })?.code === 'P2002') {
      return apiError(409, 'CONFLICT', 'A company admin with this email already exists')
    }
    console.error('Company admins API error:', error)
    return apiError(500, 'INTERNAL', 'Internal server error')
  }
}

export interface UpdateAdminBody {
  firstName?: string
  lastName?: string
  email?: string
  role?: 'OWNER' | 'MEMBER'
  status?: 'ACTIVE' | 'INACTIVE'
  makePrimary?: boolean
}

/**
 * Edit, disable / re-enable, or make primary a single company admin.
 *
 * `actorAdminId` is set when a company admin is acting. They may not
 * disable their own login, and only the current primary admin can hand
 * the primary role to someone else.
 */
export async function updateCompanyAdmin(
  user: User,
  companyId: string,
  adminId: string,
  body: UpdateAdminBody,
  actorAdminId?: string,
) {
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, deletedAt: true },
    })
    if (!company || company.deletedAt) return apiError(404, 'NOT_FOUND', 'Company not found')

    const existing = await prisma.companyAdmin.findUnique({ where: { id: adminId } })
    if (!existing || existing.companyId !== companyId) {
      return apiError(404, 'NOT_FOUND', 'Company admin not found in this company')
    }

    const wantsPrimary = body.makePrimary === true
    const wantsInactive = body.status === 'INACTIVE'
    const wantsActive = body.status === 'ACTIVE'

    if (actorAdminId) {
      if (wantsInactive && adminId === actorAdminId) {
        return apiError(403, 'FORBIDDEN', 'You cannot disable your own administrator account')
      }
      if (wantsPrimary && !existing.isPrimary) {
        const actor = await prisma.companyAdmin.findUnique({
          where: { id: actorAdminId },
          select: { isPrimary: true, companyId: true },
        })
        if (!actor?.isPrimary || actor.companyId !== companyId) {
          return apiError(403, 'FORBIDDEN', 'Only the primary administrator can transfer the primary role')
        }
      }
    }

    const existingAcct = existing.accountId
      ? await prisma.account.findUnique({ where: { authUserId: existing.accountId }, select: { email: true } })
      : null
    const currentEmail = existingAcct?.email ?? ''
    let nextEmail: string | undefined
    if (body.email !== undefined) {
      const trimmed = body.email.trim().toLowerCase()
      if (!trimmed) return apiError(400, 'VALIDATION', 'Email cannot be empty')
      if (!EMAIL_RE.test(trimmed)) return apiError(400, 'VALIDATION', 'Invalid email address')
      if (trimmed !== currentEmail) {
        const validation = await validateUserEmail(trimmed)
        if (validation.exists) {
          return apiError(409, 'CONFLICT', 'Email is already assigned to another account in the system')
        }
      }
      nextEmail = trimmed
    }

    // Role is derived: only the primary admin can hold role=OWNER.
    // isPrimary is the source of truth, so role edits are advisory.
    const result = await prisma.$transaction(async (tx) => {
      // If disabling, run the guard inside the transaction.
      if (wantsInactive && existing.isActive) {
        await assertCanDisableAdmin(companyId, adminId, tx)
      }

      const updated = await tx.companyAdmin.update({
        where: { id: adminId },
        data: {
          firstName: body.firstName !== undefined ? body.firstName.trim() : undefined,
          lastName: body.lastName !== undefined ? body.lastName.trim() : undefined,
          isActive: wantsInactive ? false : wantsActive ? true : undefined,
        },
      })

      if (nextEmail && nextEmail !== currentEmail && existing.accountId) {
        await tx.account.update({
          where: { authUserId: existing.accountId },
          data: { email: nextEmail },
        })
      }

      // Mirror the admin status on the Account.
      if ((wantsInactive || wantsActive) && existing.accountId) {
        await tx.account.update({
          where: { authUserId: existing.accountId },
          data: { status: wantsInactive ? 'INACTIVE' : 'ACTIVE' },
        })
      }

      // Make primary: demote current primary (if any) and flag this one.
      if (wantsPrimary) {
        await tx.companyAdmin.updateMany({
          where: { companyId, isPrimary: true, id: { not: adminId } },
          data: { isPrimary: false },
        })
        if (!updated.isPrimary) {
          await tx.companyAdmin.update({ where: { id: adminId }, data: { isPrimary: true } })
        }
      }

      // Auto-fix primary: if the company now lacks an active primary,
      // promote the best candidate.
      await ensurePrimaryAdmin(companyId, tx)

      const refreshed = await tx.companyAdmin.findUnique({ where: { id: adminId } })
      const refreshedAcct = refreshed?.accountId
        ? await tx.account.findUnique({ where: { authUserId: refreshed.accountId }, select: { email: true } })
        : null

      const changes: Record<string, unknown> = {}
      if (body.firstName !== undefined && body.firstName.trim() !== existing.firstName)
        changes.firstName = body.firstName.trim()
      if (body.lastName !== undefined && body.lastName.trim() !== existing.lastName)
        changes.lastName = body.lastName.trim()
      if (nextEmail && nextEmail !== currentEmail) changes.email = nextEmail
      if (wantsInactive && existing.isActive) changes.isActive = false
      if (wantsActive && !existing.isActive) changes.isActive = true
      if (wantsPrimary && !existing.isPrimary) changes.isPrimary = true

      await tx.auditLog.create({
        data: buildAuditData(fromCurrentUser(user, 'COMPANY_ADMIN_UPDATED', 'company_admin', adminId, {
          metadata: { companyId, changes },
        })) as any,
      })

      return { admin: refreshed, email: refreshedAcct?.email ?? '' }
    })

    if (nextEmail && nextEmail !== currentEmail) {
      await sendCompanyAdminInvitation({
        email: nextEmail,
        firstName: existing.firstName,
        lastName: existing.lastName,
        companyName: company.name ?? '',
        companyId,
        actorType: user.userType,
        actorId: user.profileId,
      })
    }

    return NextResponse.json({
      success: true,
      data: result && result.admin ? toAdminSummary(result.admin, result.email) : null,
      message: 'Admin updated successfully',
    })
  } catch (error) {
    if (error instanceof PrimaryAdminGuardError) return apiError(409, error.code, error.message)
    if ((error as { code?: string })?.code === 'P2002') {
      return apiError(409, 'CONFLICT', 'A company admin with this email already exists')
    }
    console.error('Company admin update error:', error)
    return apiError(500, 'INTERNAL', 'Internal server error')
  }
}

// ----- Employee CSV import --------------------------------------------

export async function previewEmployeeCsv(companyId: string, formData: FormData) {
  try {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, deletedAt: true } })
    if (!company || company.deletedAt) return apiError(404, 'NOT_FOUND', 'Company not found')

    const file = formData.get('file')
    if (!(file instanceof Blob)) {
      return apiError(400, 'VALIDATION', 'CSV file is required (multipart field "file")')
    }
    const csv = await (file as File).text()
    if (!csv.trim()) return apiError(400, 'VALIDATION', 'CSV file is empty')

    const preview = await buildPreview(csv, companyId)
    return NextResponse.json({ success: true, data: preview })
  } catch (error) {
    console.error('CSV preview error:', error)
    return apiError(500, 'INTERNAL', 'Internal server error')
  }
}

interface CsvRowResult {
  email: string
  status: 'CREATED' | 'FAILED'
  reason?: string
  employeeId?: string
}

export interface ConfirmCsvBody {
  csv?: string
  bodyHash?: string
}

export async function confirmEmployeeCsv(user: User, companyId: string, body: ConfirmCsvBody) {
  try {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, deletedAt: true } })
    if (!company || company.deletedAt) return apiError(404, 'NOT_FOUND', 'Company not found')

    const { csv, bodyHash } = body
    if (!csv) return apiError(400, 'VALIDATION', 'csv body is required')
    if (!bodyHash) return apiError(400, 'VALIDATION', 'bodyHash is required (must match the preview)')

    // Re-validate against current DB state. Refuse if the previously
    // emitted bodyHash does not match — this prevents confirming a stale
    // preview after another admin already added/removed employees.
    const preview = await buildPreview(csv, companyId)
    if (preview.bodyHash !== bodyHash) {
      return apiError(400, 'VALIDATION', 'CSV body has changed since preview. Re-run the preview.')
    }
    if (preview.validCount === 0) {
      return apiError(400, 'VALIDATION', 'No valid rows to import. Fix the invalid rows and retry.')
    }

    const rows = await parseCsvBody(csv)
    const existingEmployees = await prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      select: { accountId: true },
    })
    const existingAccountIds = existingEmployees.map((e) => e.accountId).filter(Boolean) as string[]
    const existingAccounts = existingAccountIds.length > 0
      ? await prisma.account.findMany({ where: { authUserId: { in: existingAccountIds } }, select: { email: true } })
      : []
    const existingEmails = new Set(
      existingAccounts.map((e) => e.email?.toLowerCase()).filter((e): e is string => !!e),
    )
    const { valid } = await validateRows(rows, { companyId, existingEmails })
    if (valid.length === 0) return apiError(400, 'VALIDATION', 'No valid rows to import.')

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
            data: { authUserId: pkId, email, role: 'EMPLOYEE', profileType: 'EMPLOYEE', status: 'ACTIVE' },
          })
          await tx.employee.create({
            data: {
              id: pkId,
              accountId: pkId,
              companyId,
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

    const uploadJob = await prisma.cSVUploadJob.create({
      data: {
        companyId,
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

    for (const r of preview.invalidRows) {
      await prisma.cSVRejectedRow.create({
        data: { csvUploadId: uploadJob.id, rowNumber: r.rowNumber, reason: r.reason, rowData: r.raw as any },
      })
    }

    await createAuditLog(fromCurrentUser(user, 'EMPLOYEE_CSV_IMPORTED', 'company', companyId, {
      metadata: { total: preview.totalRows, imported, rejected: preview.invalidCount, failed },
    }))

    return NextResponse.json({
      success: true,
      data: { jobId: uploadJob.id, imported, rejected: preview.invalidCount, failed, results },
      message: `Imported ${imported} employees. ${preview.invalidCount} rejected.${failed ? ` ${failed} failed.` : ''}`,
    })
  } catch (error) {
    console.error('CSV confirm error:', error)
    return apiError(500, 'INTERNAL', 'Internal server error')
  }
}
