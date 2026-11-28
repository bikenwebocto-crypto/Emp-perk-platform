import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, BILLING_AUDIT_ACTIONS } from '@/lib/billing/auth-helpers'
import { BILLING_AUDIT_ROLES } from '@/lib/access/account-access'
import {
  UUID_RE,
  pageMeta,
  parseDateRange,
  parsePagination,
  resolveActorId,
  resolveActorName,
} from '@/lib/audit/audit-query'

const ALL_ACTIONS: string[] = Object.values(BILLING_AUDIT_ACTIONS)

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION_ERROR', message } },
    { status: 400 },
  )
}

/** Only the billing transition fields are exposed from `changes`. */
function safeChanges(changes: unknown) {
  const c = (changes && typeof changes === 'object' ? changes : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  return { from: str(c.from), to: str(c.to), reason: str(c.reason) }
}

/**
 * GET /api/admin/billing/audit
 *
 * Returns the recent billing-related audit events across all companies.
 * Restricted to BILLING_AUDIT_ROLES. Only billing actions can be queried, and
 * only safe fields are returned (no metadata, IP address or user agent).
 *   - companyId: optional filter (UUID)
 *   - action:    optional single billing-action filter
 *   - from, to:  optional YYYY-MM-DD, inclusive (UTC)
 *   - page (>=1), pageSize (1–100). Invalid values → 400; a page past the end
 *     returns an empty list with the real totals in `meta`.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(BILLING_AUDIT_ROLES)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId') || undefined
  const action = searchParams.get('action') || undefined
  if (companyId && !UUID_RE.test(companyId)) return badRequest('Invalid companyId')
  if (action && !ALL_ACTIONS.includes(action)) return badRequest('Unknown billing action')

  const pagination = parsePagination(searchParams)
  if (!pagination.ok) return badRequest(pagination.message)
  const range = parseDateRange(searchParams)
  if (!range.ok) return badRequest(range.message)
  const { page, pageSize, skip } = pagination.value

  try {
    const where: Prisma.AuditLogWhereInput = {
      action: action ? action : { in: ALL_ACTIONS },
    }
    if (companyId) {
      where.OR = [
        { entityType: 'company', entityId: companyId },
        { companyId },
      ]
    }
    if (range.value) where.createdAt = range.value

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          companyId: true,
          actorType: true,
          adminId: true,
          merchantId: true,
          companyAdminId: true,
          employeeId: true,
          changes: true,
          createdAt: true,
          admin: { select: { id: true, firstName: true, lastName: true } },
          merchant: { select: { businessName: true } },
          companyAdmin: { select: { firstName: true, lastName: true } },
          employee: { select: { firstName: true, lastName: true } },
          company: { select: { id: true, name: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    const data = rows.map((r) => {
      const changes = safeChanges(r.changes)
      return {
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        companyId: r.companyId,
        company: r.company ? { id: r.company.id, name: r.company.name } : null,
        actorType: r.actorType,
        actorId: resolveActorId(r),
        adminId: r.adminId,
        admin: r.admin
          ? { id: r.admin.id, firstName: r.admin.firstName, lastName: r.admin.lastName }
          : null,
        actorName: resolveActorName(r),
        reason: changes.reason,
        changes,
        createdAt: r.createdAt.toISOString(),
      }
    })

    return NextResponse.json({ success: true, data, meta: pageMeta(page, pageSize, total) })
  } catch (err) {
    console.error('Billing audit error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
