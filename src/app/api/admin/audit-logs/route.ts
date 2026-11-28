import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/billing/auth-helpers'
import { AUDIT_LOG_ROLES } from '@/lib/access/account-access'
import {
  buildAuditWhere,
  extractOutcome,
  extractReason,
  pageMeta,
  parsePagination,
  resolveActorId,
  resolveActorName,
} from '@/lib/audit/audit-query'

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION_ERROR', message } },
    { status: 400 },
  )
}

/**
 * GET /api/admin/audit-logs
 *
 * Query params (all optional; "ALL" or empty = no filter):
 *   - search:     substring of the action (case-insensitive)
 *   - action:     exact stored action
 *   - entityType: exact stored entity type (see /api/admin/audit-logs/filters)
 *   - entityId:   UUID
 *   - actorType:  admin | merchant | company_admin | employee | system
 *   - actorId:    UUID of the acting profile
 *   - companyId:  UUID — events tagged with the company or targeting it
 *   - outcome:    value stored in metadata.outcome / metadata.result
 *   - from, to:   YYYY-MM-DD, inclusive (UTC)
 *   - page (>=1), pageSize (1–100)
 *
 * Returns a list projection only: no changes, metadata or user agent. Use
 * /api/admin/audit-logs/[id] for the full (redacted) record.
 */
export async function GET(request: NextRequest) {
  // Same roles as the /admin/audit-logs page (see account-access).
  const auth = await requireAdmin(AUDIT_LOG_ROLES)
  if (!auth.ok) return auth.response

  const sp = request.nextUrl.searchParams
  const pagination = parsePagination(sp)
  if (!pagination.ok) return badRequest(pagination.message)
  const where = buildAuditWhere(sp)
  if (!where.ok) return badRequest(where.message)
  const { page, pageSize, skip } = pagination.value

  try {
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: where.value,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorType: true,
          adminId: true,
          merchantId: true,
          companyAdminId: true,
          employeeId: true,
          companyId: true,
          ipAddress: true,
          createdAt: true,
          changes: true,
          metadata: true,
          admin: { select: { firstName: true, lastName: true } },
          merchant: { select: { businessName: true } },
          companyAdmin: { select: { firstName: true, lastName: true } },
          employee: { select: { firstName: true, lastName: true } },
          company: { select: { name: true } },
        },
      }),
      prisma.auditLog.count({ where: where.value }),
    ])

    // changes/metadata are read only to derive outcome/reason; never returned.
    const data = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorType: r.actorType,
      actorId: resolveActorId(r),
      actorName: resolveActorName(r),
      companyId: r.companyId,
      companyName: r.company?.name ?? null,
      outcome: extractOutcome(r.metadata),
      reason: extractReason(r.changes, r.metadata),
      hasChanges: r.changes !== null,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({ success: true, data, meta: pageMeta(page, pageSize, total) })
  } catch (err) {
    console.error('[ADMIN_AUDIT_LOGS] query failed', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
