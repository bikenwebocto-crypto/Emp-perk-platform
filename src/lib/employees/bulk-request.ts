import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, type CurrentUser } from '@/lib/supabase/server'
import { forbidden } from '@/lib/api-auth'
import { MAX_BULK_ROWS } from '@/lib/employees/bulk-validate'

export function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

const optionalString = z.string().max(1000).optional().nullable().transform((v) => v ?? undefined)

export const bulkRowSchema = z.object({
  clientId: z.string().min(1).max(100),
  sourceRow: z.number().int().positive().optional().nullable().transform((v) => v ?? undefined),
  name: z.string().max(1000).default(''),
  email: z.string().max(1000).default(''),
  department: optionalString,
  jobTitle: optionalString,
  phone: optionalString,
  employeeId: optionalString,
})

export const bulkRowsSchema = z
  .array(bulkRowSchema)
  .min(1, 'At least one row is required')
  .max(MAX_BULK_ROWS, `At most ${MAX_BULK_ROWS} rows are allowed`)
  .refine((rows) => new Set(rows.map((r) => r.clientId)).size === rows.length, 'clientId must be unique per row')

type BulkAuthResult =
  | { ok: true; user: CurrentUser; companyId: string }
  | { ok: false; response: NextResponse }

/**
 * Auth for the bulk employee endpoints.
 * - SUPER_ADMIN (userType "admin"): any company; companyId required.
 * - COMPANY_ADMIN: always their own company; a different companyId → 403.
 * The company must exist, not be deleted and be ACTIVE.
 */
export async function authorizeBulkCompany(requestedCompanyId: unknown): Promise<BulkAuthResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, response: errorResponse(401, 'UNAUTHORIZED', 'Unauthorized') }

  let companyId: string
  if (user.userType === 'admin') {
    if (typeof requestedCompanyId !== 'string' || !requestedCompanyId) {
      return { ok: false, response: errorResponse(400, 'VALIDATION', 'companyId is required') }
    }
    companyId = requestedCompanyId
  } else if (user.userType === 'company_admin') {
    if (!user.companyId) return { ok: false, response: forbidden(user.userType) }
    if (requestedCompanyId && requestedCompanyId !== user.companyId) {
      return { ok: false, response: forbidden(user.userType) }
    }
    companyId = user.companyId
  } else {
    return { ok: false, response: forbidden(user.userType) }
  }

  if (!z.string().uuid().safeParse(companyId).success) {
    return { ok: false, response: errorResponse(400, 'VALIDATION', 'Invalid companyId') }
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, status: true, deletedAt: true },
  })
  if (!company || company.deletedAt) {
    return { ok: false, response: errorResponse(404, 'NOT_FOUND', 'Company not found') }
  }
  if (company.status !== 'ACTIVE') {
    return { ok: false, response: errorResponse(400, 'COMPANY_INACTIVE', 'Company is not active') }
  }

  return { ok: true, user, companyId }
}
