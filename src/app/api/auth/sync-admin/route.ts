import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { checkEmailConfiguration } from '@/lib/email/email.examples'
import { getPublicBranding } from '@/features/admin/settings/login-branding/services/login-branding.service'
import { cookies } from "next/headers";
import { hasVerifiedTotpFactor, requiresMfaForRole } from '@/lib/auth/mfa';

const dashboardMap: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  MERCHANT: '/merchant',
  COMPANY_ADMIN: '/company',
  EMPLOYEE: '/employee',
}

async function getMfaRedirectForRole(supabase: Awaited<ReturnType<typeof createClient>>, role: string | null | undefined): Promise<string> {
  if (!requiresMfaForRole(role)) return dashboardMap[role ?? 'EMPLOYEE'] ?? '/employee'

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const hasTotp = hasVerifiedTotpFactor(factors)
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (!hasTotp) return '/mfa/setup'
  if (aal?.currentLevel !== 'aal2') return '/mfa/verify'
  return dashboardMap[role ?? 'EMPLOYEE'] ?? '/employee'
}

export async function POST(request: NextRequest) {
  const branding = await getPublicBranding();
  // console.log(' ** Branding in sync-admin route:', branding);
  const cookieStore = await cookies();

  cookieStore.set(
    "branding",
    JSON.stringify(branding),
    {
      maxAge: 60 * 60, // 1 hour
      path: "/",
    }
  );
    // const data = cookieStore.get("branding")?.value;
    // console.log(' ** Branding in sync-admin route from sessionStorage:', data);

  const supabase = await createClient()
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  console.log(' ** Token in sync-admin route:', token);

  const { data: { user }, error } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser()

    console.log(' ** User in sync-admin route:', user);

  if (error || !user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    )
  }
  
  const email = user.email!
  // console.log('Email :' , email, user.id);
  // ── Step 1: Check existing Account ──────────────────────
  const existingAccount = await prisma.account.findUnique({
    where: { authUserId: user.id },
  })
  // console.log('existing account:',existingAccount);
  if (existingAccount) {
    if (existingAccount.status !== 'ACTIVE') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Account is inactive or suspended.',
          },
        },
        { status: 403 },
      )
    }

    await prisma.account.update({
      where: { authUserId: user.id },
      data: { lastLoginAt: new Date() },
    })

    const redirectTo = await getMfaRedirectForRole(supabase, existingAccount.role)

    return NextResponse.json({
      success: true,
      role: existingAccount.role,
      redirectTo,
    })
  }

  // ── Step 2: No Account — find by email and link ────────
  const accountByEmail = await prisma.account.findUnique({
    where: { email },
    select: { authUserId: true, profileType: true, role: true, status: true },
  })

  if (!accountByEmail) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ACCOUNT_NOT_MAPPED',
          message: 'You are not mapped to any role or account. Please contact your administrator.',
        },
      },
      { status: 403 },
    )
  }

  if (accountByEmail.status !== 'ACTIVE') {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Account is inactive or suspended.',
        },
      },
      { status: 403 },
    )
  }

  // Verify the linked profile still exists
  let profile: { id: string } | null = null
  switch (accountByEmail.profileType) {
    case 'ADMIN':
      profile = await prisma.adminUser.findFirst({ where: { accountId: accountByEmail.authUserId }, select: { id: true } })
      break
    case 'MERCHANT':
      profile = await prisma.merchant.findFirst({ where: { accountId: accountByEmail.authUserId }, select: { id: true } })
      break
    case 'COMPANY':
      profile = await prisma.companyAdmin.findFirst({ where: { accountId: accountByEmail.authUserId }, select: { id: true } })
      break
    case 'EMPLOYEE':
      profile = await prisma.employee.findFirst({ where: { accountId: accountByEmail.authUserId }, select: { id: true } })
      break
  }

  if (!profile) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'ACCOUNT_NOT_MAPPED',
          message: 'Linked profile not found. Please contact your administrator.',
        },
      },
      { status: 403 },
    )
  }

  // Update lastLoginAt (authUserId stays as set by admin create flow)
  await prisma.account.update({
    where: { email },
    data: { lastLoginAt: new Date() },
  })

  const redirectTo = await getMfaRedirectForRole(supabase, accountByEmail.role)

  return NextResponse.json({
    success: true,
    role: accountByEmail.role,
    redirectTo,
  })
}

