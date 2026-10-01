import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { authContextStore, buildAuthContext } from '@/lib/auth';
import type { AuthResult } from '@/lib/auth';
import type { PerfTimer } from '@/lib/perf';
import type { Database } from './types';
import type { User } from '@supabase/supabase-js';

export async function createClient(timer?: PerfTimer) {
  const tCookies = performance.now()
  const cookieStore = await cookies() 
  timer?.point(`cookies(): ${(performance.now() - tCookies).toFixed(1)}ms`)

  const tClient = performance.now()
  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet : { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
  timer?.point(`createServerClient: ${(performance.now() - tClient).toFixed(1)}ms`)
  return client
}

export type UserProfile =
  | (import('@prisma/client').AdminUser & { companyId?: null })
  | (import('@prisma/client').Merchant & { companyId?: null })
  | (import('@prisma/client').CompanyAdmin)
  | (import('@prisma/client').Employee);

export interface CurrentUser {
  id: string;
  email: string;
  role: string;
  companyName?: string | null;
  companyStatus?: string | null;
  userType: 'admin' | 'merchant' | 'company_admin' | 'employee';
  companyId: string | null;
  profileType: string;
  profileId: string | null;
  profile: Record<string, unknown> | null;
  city?: string | null;
}

function getCompanyName(ctx: { profileType: string; profile: any; company: any }): string | null {
  if (ctx.profile?.companyName) return ctx.profile.companyName
  if (ctx.company?.name) return ctx.company.name
  return null
}

function currentUserFromContext(ctx: any): CurrentUser {
  const userTypeMap: Record<string, 'admin' | 'merchant' | 'company_admin' | 'employee'> = {
    SUPER_ADMIN: 'admin',
    MERCHANT: 'merchant',
    COMPANY_ADMIN: 'company_admin',
    EMPLOYEE: 'employee',
  }

  return {
    id: ctx.user.id,
    email: ctx.user.email!,
    role: ctx.account.role,
    userType: userTypeMap[ctx.account.role] ?? 'employee',
    companyId: ctx.companyId,
    city: ctx.profile?.city ?? null,
    companyName: getCompanyName(ctx),
    companyStatus: ctx.companyStatus,
    profileType: ctx.profileType,
    profileId: ctx.profileId,
    profile: ctx.profile as Record<string, unknown> | null,
  }
}

async function _getCurrentUser(timer?: PerfTimer): Promise<CurrentUser | null> {
    console.log('>>> _getCurrentUser REAL EXECUTION', new Date().toISOString())  // ← move it HERE, first line inside the function

  const start = performance.now()

  try {
    const existing = authContextStore.getStore()
    if (existing) {
      return currentUserFromContext(existing)
    }

    let authUser: User | null = null

    // Check if middleware already authenticated this request
    try {
      const headersList = await headers()
      const middlewareEmail = headersList.get('x-auth-email')
      if (middlewareEmail) {
        const account = await prisma.account.findUnique({
          where: { email: middlewareEmail },
          select: { authUserId: true },
        })
        if (account) {
          authUser = { id: account.authUserId, email: middlewareEmail } as User
        } else {
          return null
        }
      }
    } catch {
      // headers() unavailable in this context
    }

    if (!authUser) {
      const supabase = await createClient(timer)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return null
      authUser = user
    }

    const auth: AuthResult = { user: authUser, accessToken: '' }
    const ctx = await buildAuthContext(auth)

    authContextStore.enterWith(ctx)
    return currentUserFromContext(ctx)
  } catch (error) {
    console.log(
      `[getCurrentUser] FAILED after ${(performance.now() - start).toFixed(2)} ms`
    )
    console.error(error)
    return null
  }
}

// React cache() memoizes the zero-argument core per request in Route Handlers,
// Server Components, and Server Actions, so repeated calls (e.g. inside
// getMerchantFromSession / getEmployeeFromSession / requireRole) reuse the first
// result instead of re-running the Supabase session check + accounts query.
// The timer argument is deliberately NOT forwarded: call sites pass different
// timer objects, which would otherwise split the cache key and defeat dedup.
const getCurrentUserCached = cache(async (): Promise<CurrentUser | null> => {
  return _getCurrentUser()
})

export async function getCurrentUser(timer?: PerfTimer): Promise<CurrentUser | null> {
  void timer
  return getCurrentUserCached()
}

export interface ResolvedUser {
  id: string;
  email: string;
  userType: 'admin' | 'merchant' | 'company_admin' | 'employee';
  role: string | null;
  profileId: string | null;
  name: string;
  companyName?: string | null;
  isActive: boolean;
}

export async function resolveAuthenticatedUser(): Promise<ResolvedUser | null> {
  const session = await getCurrentUser()
  if (!session) return null

  let name = session.email
  if (session.profile) {
    switch (session.profileType) {
      case 'ADMIN': {
        const p = session.profile as { firstName?: string; lastName?: string }
        if (p.firstName) name = `${p.firstName} ${p.lastName ?? ''}`.trim()
        break
      }
      case 'MERCHANT': {
        const p = session.profile as { businessName?: string }
        if (p.businessName) name = p.businessName
        break
      }
      case 'COMPANY':
      case 'EMPLOYEE': {
        const p = session.profile as { firstName?: string; lastName?: string }
        if (p.firstName) name = `${p.firstName} ${p.lastName ?? ''}`.trim()
        break
      }
    }
  }

  return {
    id: session.id,
    email: session.email,
    userType: session.userType,
    role: session.role,
    profileId: session.profileId,
    name: name || 'NA',
    companyName: session.companyName,
    isActive: session.role !== null && session.role !== undefined,
  }
}
