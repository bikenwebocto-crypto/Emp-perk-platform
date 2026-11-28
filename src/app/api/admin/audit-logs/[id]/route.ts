import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/billing/auth-helpers'
import { AUDIT_LOG_ROLES } from '@/lib/access/account-access'
import {
  UUID_RE,
  buildChangeView,
  extractOutcome,
  extractReason,
  extractRequestId,
  resolveActorId,
  resolveActorName,
  safeMetadata,
} from '@/lib/audit/audit-query'

/**
 * GET /api/admin/audit-logs/[id]
 *
 * Full audit record for the detail view. `changes` is returned as a normalised
 * comparison and `metadata` with secrets redacted (re-applied on read for rows
 * written before redaction existed). Fields that were never recorded are null.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(AUDIT_LOG_ROLES)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid audit log id' } },
      { status: 400 },
    )
  }

  try {
    const r = await prisma.auditLog.findUnique({
      where: { id },
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
        changes: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        admin: { select: { firstName: true, lastName: true } },
        merchant: { select: { businessName: true } },
        companyAdmin: { select: { firstName: true, lastName: true } },
        employee: { select: { firstName: true, lastName: true } },
        company: { select: { name: true } },
      },
    })
    if (!r) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Audit log not found' } },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      data: {
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
        changes: buildChangeView(r.changes),
        metadata: safeMetadata(r.metadata),
        request: {
          ipAddress: r.ipAddress,
          userAgent: r.userAgent,
          requestId: extractRequestId(r.metadata),
        },
        createdAt: r.createdAt.toISOString(),
      },
    })
  } catch (err) {
    console.error('[ADMIN_AUDIT_LOG_DETAIL] query failed', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
