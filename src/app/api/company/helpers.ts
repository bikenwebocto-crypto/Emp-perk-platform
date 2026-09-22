import { getCurrentUser } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import type { CompanyAdmin, Company } from '@prisma/client'

export class CompanyInactiveError extends Error {
  code = 'COMPANY_INACTIVE'
  constructor(public companyStatus: string) {
    super(`Your company's access is currently inactive.`)
    this.name = 'CompanyInactiveError'
  }
}

export interface GetCompanyAdminOptions {
  /**
   * Allow read-style access while the company is PAUSED / SUSPENDED /
   * CANCELLED. The company admin can then SEE their status (e.g. the
   * read-only Account Status card) without being able to mutate via the
   * strict routes. Hard-deleted companies remain blocked either way.
   */
  allowInactive?: boolean
}

export async function getCompanyAdmin(options: GetCompanyAdminOptions = {}): Promise<{
  company: Company
  companyAdmin: CompanyAdmin
  user: Awaited<ReturnType<typeof getCurrentUser>>
}> {
  const { allowInactive = false } = options
  const user = await getCurrentUser()
  if (!user || user.userType !== 'company_admin') {
    throw new AuthError('Unauthorized')
  }
  if (!user.profileId) throw new AuthError('Unauthorized')

  const companyAdmin = user.profile as unknown as CompanyAdmin | null
  if (!companyAdmin || !companyAdmin.isActive) {
    throw new AuthError('Company admin account not found or inactive')
  }

  let company: Company | null = null
  try {
    const ctx = getAuthContext()
    company = ctx.company
  } catch {
    if (companyAdmin.companyId) {
      company = await prisma.company.findUnique({ where: { id: companyAdmin.companyId } })
    }
  }

  if (!company || company.deletedAt) {
    throw new AuthError('Company not found or inactive')
  }
  if (
    !allowInactive &&
    (company.status === 'CANCELLED' ||
      company.status === 'PAUSED' ||
      company.status === 'SUSPENDED')
  ) {
    throw new CompanyInactiveError(company.status)
  }

  return { company, companyAdmin, user }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: error.message } },
      { status: 401 },
    )
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: error.message } },
      { status: 403 },
    )
  }
  if (error instanceof CompanyInactiveError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'COMPANY_INACTIVE',
          message: `Your company's access is currently inactive.`,
          companyStatus: error.companyStatus,
        },
      },
      { status: 403 },
    )
  }
  // Handle Prisma unique constraint violations
  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
    const prismaError = error as any
    const target = prismaError.meta?.target
    // Email uniqueness is now on Account only (removed from profile tables)
    if (Array.isArray(target) && target.includes('email')) {
      return NextResponse.json(
        { success: false, error: { code: 'EMAIL_ALREADY_EXISTS', message: 'Email is already assigned to another account' } },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'DUPLICATE_ENTRY', message: 'A record with this information already exists' } },
      { status: 409 },
    )
  }
  console.error('API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 },
  )
}
