import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient, getCurrentUser } from '@/lib/supabase/server'
import { clientIpFromRequest } from '@/lib/rate-limit'
import { MfaRecoveryError, type RecoveryActor } from '@/services/mfa-recovery.service'

// Route helpers for the MFA recovery APIs. Actors are always derived from the
// Supabase session; role, account id and approval data in request bodies are
// never trusted.

export function recoveryError(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error: { code, message, ...(details ?? {}) } }, { status })
}

export function handleRecoveryError(error: unknown, scope: string) {
  if (error instanceof MfaRecoveryError) {
    return recoveryError(error.status, error.code, error.message, error.details)
  }
  console.error(`[MFA_RECOVERY] ${scope} failed`, error)
  return recoveryError(500, 'INTERNAL_ERROR', 'Something went wrong.')
}

type ActorResult = { ok: true; actor: RecoveryActor } | { ok: false; response: NextResponse }

/**
 * Actor for the locked-out user's own endpoints (/api/mfa/recovery/*). These
 * run on an AAL1 session, so the Supabase user is re-read here and must match
 * the Account row by id as well as email.
 */

export async function getUserRecoveryActor(
  request: Request
): Promise<ActorResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return {
      ok: false,
      response: recoveryError(
        401,
        'UNAUTHORIZED',
        'Unauthorized'
      ),
    };
  }

  const normalizedEmail = user.email.trim().toLowerCase();

  const account = await prisma.account.findFirst({
    where: {
      email: normalizedEmail,
    },
  });

  if (!account) {
    return {
      ok: false,
      response: recoveryError(
        401,
        'ACCOUNT_NOT_FOUND',
        'No account matches your sign-in email.'
      ),
    };
  }

  if (account.status !== 'ACTIVE') {
    return {
      ok: false,
      response: recoveryError(
        403,
        'ACCOUNT_INACTIVE',
        'This account is not active.'
      ),
    };
  }

  let adminRole: string | null = null;
  let adminActive: boolean | null = null;

  if (account.role === 'SUPER_ADMIN') {
    const admin = await prisma.adminUser.findFirst({
      where: {
        accountId: account.authUserId,
      },
      select: {
        role: true,
        isActive: true,
      },
    });

    adminRole = admin?.role ?? null;
    adminActive = admin?.isActive ?? null;
  }

  return {
    ok: true,
    actor: {
      accountId: account.authUserId,
      email: account.email,
      accountRole: account.role,
      adminRole,
      adminActive,
      ip: clientIpFromRequest(request),
    },
  };
}


/** Actor for /api/admin/* recovery routes (middleware has already required AAL2). */
export async function getAdminRecoveryActor(request: Request): Promise<ActorResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, response: recoveryError(401, 'UNAUTHORIZED', 'Unauthorized') }
  if (user.userType !== 'admin') return { ok: false, response: recoveryError(403, 'FORBIDDEN', 'Admin access required') }
  return {
    ok: true,
    actor: {
      accountId: user.id,
      email: user.email,
      accountRole: user.role,
      adminRole: user.adminRole ?? null,
      adminActive: (user.profile as { isActive?: boolean } | null)?.isActive ?? null,
      ip: clientIpFromRequest(request),
    },
  }
}

/**
 * When the current session last verified a TOTP code, from the JWT's AMR
 * claims. Used as the "strong reauthentication" check for approver changes:
 * the client re-runs mfa.challengeAndVerify right before the request.
 */
export async function getFreshTotpVerifiedAt(): Promise<Date | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (data?.currentLevel !== 'aal2') return null
  const methods = (data.currentAuthenticationMethods ?? []) as Array<string | { method: string; timestamp: number }>
  const totp = methods
    .filter((m): m is { method: string; timestamp: number } => typeof m === 'object' && m.method === 'totp')
    .sort((a, b) => b.timestamp - a.timestamp)[0]
  return totp ? new Date(totp.timestamp * 1000) : null
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function listParamsFrom(request: Request) {
  const sp = new URL(request.url).searchParams
  return {
    status: sp.get('status'),
    role: sp.get('role'),
    from: sp.get('from'),
    to: sp.get('to'),
    q: sp.get('q'),
    page: Number(sp.get('page')) || 1,
    pageSize: Number(sp.get('pageSize')) || 20,
    sort: sp.get('sort'),
    order: sp.get('order'),
  }
}
