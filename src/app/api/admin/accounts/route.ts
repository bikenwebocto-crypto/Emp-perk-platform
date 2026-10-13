import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { buildAuditData, fromCurrentUser } from '@/services/audit-log.service'
import { validateUserEmail } from '@/services/user-validation.service'
import {
  inviteAuthUser, inviteErrorStatus, rollbackAuthUser,
} from '@/services/employee-invite.service'
import { ACTIVE_ADMIN_ROLES,ADMIN_ROLES, assignableRoles, type AdminRoleValue } from '@/lib/access/account-access'
import { apiError, requireAccountAccess } from './helpers'

// System admins: Account (role SUPER_ADMIN, profileType ADMIN) + AdminUser
// (accountId = Account.authUserId). The real admin role lives on AdminUser.role.

// GET /api/admin/accounts — list system admins.
// Query: q (name/email), role (AdminRole), page, pageSize.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAccountAccess()
    if (!auth.ok) return auth.response

    const sp = new URL(request.url).searchParams
    const page = Math.max(1, Number(sp.get('page') ?? '1') || 1)
    const pageSize = Math.min(100, Math.max(1, Number(sp.get('pageSize') ?? '20') || 20))
    const q = sp.get('q')?.trim()
    const role = sp.get('role')

    const adminWhere: Record<string, unknown> = { accountId: { not: null } }
    if (role && (ADMIN_ROLES as readonly string[]).includes(role)) adminWhere.role = role
    if (q) {
      // Name matches here; email matches are added on the Account side below.
      const nameHits = await prisma.adminUser.findMany({
        where: {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { accountId: true },
      })
      const emailHits = await prisma.account.findMany({
        where: { profileType: 'ADMIN', email: { contains: q, mode: 'insensitive' } },
        select: { authUserId: true },
      })
      adminWhere.accountId = {
        in: [...nameHits.map((a) => a.accountId!).filter(Boolean), ...emailHits.map((a) => a.authUserId)],
      }
    }

    const admins = await prisma.adminUser.findMany({
      where: adminWhere,
      select: { accountId: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true },
    })
    const adminByAccount = new Map(admins.map((a) => [a.accountId!, a]))

    const where = { profileType: 'ADMIN' as const, authUserId: { in: [...adminByAccount.keys()] } }
    const [rows, total] = await Promise.all([
      prisma.account.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { authUserId: true, email: true, status: true, lastLoginAt: true, createdAt: true },
      }),
      prisma.account.count({ where }),
    ])

    const data = rows.map((r) => {
      const a = adminByAccount.get(r.authUserId)!
      const lastLoginAt = r.lastLoginAt ?? a.lastLoginAt
      const active = a.isActive && r.status === 'ACTIVE'
      return {
        id: r.authUserId,
        name: `${a.firstName} ${a.lastName}`.trim(),
        email: r.email,
        role: a.role,
        status: !active ? 'INACTIVE' : lastLoginAt ? 'ACTIVE' : 'INVITE_PENDING',
        lastLoginAt,
        createdAt: r.createdAt,
      }
    })

    return NextResponse.json({
      success: true,
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    })
  } catch (error) {
    console.error('[GET /api/admin/accounts]', error)
    return apiError(500, 'INTERNAL', 'Internal server error')
  }
}

const createSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(255),
  role: z.enum(ACTIVE_ADMIN_ROLES),
})

// POST /api/admin/accounts — create a system admin.
// Order: validate → Supabase invite (creates the login + "set password"
// email) → one transaction (Account + AdminUser + audit) → on DB error, delete
// the Supabase user again.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAccountAccess()
    if (!auth.ok) return auth.response
    const { user } = auth

    const parsed = createSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return apiError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid input')
    const { firstName, lastName, email, role } = parsed.data

    // An ADMIN may never create a SUPER_ADMIN (or any role outside its scope).
    if (!assignableRoles({ adminRole: user.adminRole }).includes(role)) {
      return apiError(403, 'FORBIDDEN', 'You cannot assign this role')
    }

    const existing = await prisma.account.findUnique({ where: { email }, select: { authUserId: true } })
    if (existing) return apiError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists')
    // Also catches profile rows that have no Account yet.
    const validation = await validateUserEmail(email)
    if (validation.exists) return apiError(409, 'EMAIL_ALREADY_EXISTS', 'Email is already assigned to another account')

    const invite = await inviteAuthUser(email, { role: 'ADMIN', firstName })
    if (!invite.ok) return apiError(inviteErrorStatus(invite.code), invite.code, invite.message)
    const authUserId = invite.authUserId

    try {
      await prisma.$transaction(async (tx) => {
        // ACTIVE because login rejects any other status; "invite pending" is
        // derived from lastLoginAt being null.
        await tx.account.create({
          data: { authUserId, email, role: 'SUPER_ADMIN', profileType: 'ADMIN', status: 'ACTIVE', createdBy: user.id },
        })
        await tx.adminUser.create({
          data: { id: authUserId, accountId: authUserId, firstName, lastName, role: role as AdminRoleValue, isActive: true },
        })
        await tx.auditLog.create({
          data: buildAuditData(fromCurrentUser(user, 'ADMIN_ACCOUNT_CREATED', 'account', authUserId, {
            metadata: { email, role },
          })) as any,
        })
      })
    } catch (dbError) {
      await rollbackAuthUser(authUserId)
      if ((dbError as { code?: string })?.code === 'P2002') {
        return apiError(409, 'EMAIL_ALREADY_EXISTS', 'An account with this email already exists')
      }
      throw dbError
    }

    return NextResponse.json(
      {
        success: true,
        data: { id: authUserId, email, role, status: 'INVITE_PENDING' },
        message: 'Admin created. An invitation to set a password has been sent.',
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/admin/accounts]', error)
    return apiError(500, 'INTERNAL', 'Internal server error')
  }
}
