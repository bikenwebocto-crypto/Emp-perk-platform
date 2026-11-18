// Mobile authentication helper.
//
// Single source of truth for mobile-endpoint authentication. Every
// protected /api/mobile/* route uses `getAuthenticatedMobileEmployee()`
// to validate the Supabase Bearer token and load the associated
// Account, Employee, and Company records.
//
// Authentication model
// --------------------
// Supabase is the ONLY authentication provider. The mobile app obtains
// an `access_token` (and `refresh_token`) from Supabase Auth, stores
// them securely on the device, and sends the access token on every
// request as `Authorization: Bearer <access_token>`. The backend
// validates the token via `supabase.auth.getUser(token)`, then loads
// the application Account by the token's `user.id` (== `authUserId`).
//
// This file does NOT generate, store, or sign custom JWTs. There is
// no application token system — Supabase access tokens are the only
// credentials the mobile app needs.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { authenticateFromBearer, buildAuthContext } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { User } from '@supabase/supabase-js'
import type { Account, Company, Employee } from '@prisma/client'

export type MobileAuthResult =
  | {
      ok: true
      user: User
      account: Account
      employee: Employee
      company: Company
    }
  | { ok: false; response: NextResponse }

export interface MobileAuthProfile {
  employeeId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  avatarUrl: string | null
  company: { id: string; name: string; status: string }
  role: 'EMPLOYEE'
}

function authError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json(
    { success: false, error: { code, message, ...extra } },
    { status },
  )
}

export async function getAuthenticatedMobileEmployee(
  request: NextRequest,
): Promise<MobileAuthResult> {
  try {
    const auth = await authenticateFromBearer(request)
    if (!auth || !auth.user.email) {
      return {
        ok: false,
        response: authError(401, 'UNAUTHORIZED', 'Missing or invalid Bearer token'),
      }
    }

    let ctx
    try {
      ctx = await buildAuthContext(auth)
    } catch {
      return {
        ok: false,
        response: authError(
          403,
          'ACCOUNT_NOT_MAPPED',
          'You are not mapped to any account. Please contact your administrator.',
        ),
      }
    }

    if (ctx.account.status !== 'ACTIVE') {
      return {
        ok: false,
        response: authError(403, 'ACCOUNT_DISABLED', 'Account is inactive or suspended.'),
      }
    }

    // A Company Admin who was promoted from an employee keeps their Employee
    // row and may still use the mobile app with the same login.
    let employee: Employee | null = null
    let company: Company | null = ctx.company
    if (ctx.role === 'EMPLOYEE') {
      employee = ctx.profile as Employee | null
    } else if (ctx.role === 'COMPANY_ADMIN') {
      employee = await prisma.employee.findFirst({
        where: { accountId: ctx.account.authUserId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      })
      if (!employee) {
        return {
          ok: false,
          response: authError(
            403,
            'ROLE_NOT_ALLOWED',
            'This endpoint is only available for employee accounts.',
          ),
        }
      }
      company = await prisma.company.findUnique({ where: { id: employee.companyId } })
    } else {
      return {
        ok: false,
        response: authError(
          403,
          'ROLE_NOT_ALLOWED',
          'This endpoint is only available for employee accounts.',
        ),
      }
    }

    if (!employee) {
      return {
        ok: false,
        response: authError(
          404,
          'EMPLOYEE_NOT_FOUND',
          'No employee profile is linked to this account.',
        ),
      }
    }
    if (employee.status !== 'ACTIVE' || employee.deletedAt) {
      return {
        ok: false,
        response: authError(
          403,
          'EMPLOYEE_INACTIVE',
          'Your account is not active. Please contact your administrator.',
          { employeeStatus: employee.status },
        ),
      }
    }

    if (
      !company ||
      company.deletedAt ||
      company.status === 'CANCELLED' ||
      company.status === 'PAUSED' ||
      company.status === 'SUSPENDED'
    ) {
      return {
        ok: false,
        response: authError(
          403,
          'COMPANY_INACTIVE',
          "Your company's access is currently inactive.",
          { companyStatus: company?.status ?? 'UNKNOWN' },
        ),
      }
    }

    return { ok: true, user: ctx.user, account: ctx.account, employee, company }
  } catch (err) {
    console.error('getAuthenticatedMobileEmployee error:', err)
    return {
      ok: false,
      response: authError(500, 'INTERNAL', 'Internal server error'),
    }
  }
}

/**
 * Builds the standard mobile profile payload returned to the app after
 * a successful login. Centralized here so the shape cannot drift
 * between endpoints.
 */
export function buildMobileAuthProfile(
  account: Account,
  employee: Employee,
  company: Company,
): MobileAuthProfile {
  return {
    employeeId: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: account.email,
    avatarUrl: employee.avatarUrl,
    phone: employee.phone !,
    company: {
      id: company.id,
      name: company.name,
      status: company.status,
    },
    role: 'EMPLOYEE',
  }
}
