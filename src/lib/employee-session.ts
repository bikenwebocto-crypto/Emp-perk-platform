import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/server'
import { Prisma } from '@prisma/client'

export interface EmployeeSession {
  id: string
  email: string
  firstName: string
  lastName: string
  companyId: string
  status: string
  jobTitle: string | null
  department: string | null
  avatarUrl: string | null
  phone: string | null
  employeeId: string | null
  companyStatus?: string
  city?: string
}

export interface InactiveCompanySentinel {
  inactive: true
  companyStatus: string
  message: string
}

export type EmployeeSessionResult = EmployeeSession | InactiveCompanySentinel | null

export async function getEmployeeFromSession(): Promise<EmployeeSessionResult> {
  const user = await getCurrentUser()
  if (!user || user.userType !== 'employee' || !user.profileId) return null

  const profile = user.profile as Record<string, unknown> | null
  if (!profile) return null

  const companyStatus = user.companyStatus

  if (!companyStatus) {
    return null
  }
  if (companyStatus !== 'ACTIVE') {
    return {
      inactive: true,
      companyStatus,
      message: `Your company's access is currently inactive.`,
    }
  }

  return {
    id: user.profileId,
    email: user.email,
    firstName: (profile.firstName as string) ?? '',
    lastName: (profile.lastName as string) ?? '',
    companyId: user.companyId ?? '',
    status: (profile.status as string) ?? 'ACTIVE',
    jobTitle: (profile.jobTitle as string) ?? null,
    department: (profile.department as string) ?? null,
    avatarUrl: (profile.avatarUrl as string) ?? null,
    phone: (profile.phone as string) ?? null,
    employeeId: (profile.employeeId as string) ?? null,
    companyStatus,
    city: (user.city as string) ?? null,
  }
}

export function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
    { status: 401 }
  )
}

export function notFound(message = 'Not found') {
  return NextResponse.json(
    { success: false, error: { code: 'NOT_FOUND', message } },
    { status: 404 }
  )
}

export function badRequest(message: string, details?: Record<string, string>) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message, details } },
    { status: 400 }
  )
}

export function companyInactive(companyStatus: string) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'COMPANY_INACTIVE',
        message: `Your company's access is currently inactive.`,
        companyStatus,
      },
    },
    { status: 403 }
  )
}

export function internalError(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2023'
  ) {
    return notFound('Invalid resource identifier'); // Return 404 instead of 500
  }      
  console.error('Employee API error:', error)
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
    { status: 500 }
  )
}
