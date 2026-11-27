import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/billing/auth-helpers'

/**
 * GET /api/admin/audit-logs
 *
 * Query params (all optional):
 *   - search:     substring of the action (case-insensitive)
 *   - entityType: exact entity type, e.g. merchant, company, offer
 *   - from, to:   YYYY-MM-DD, inclusive
 *   - page, pageSize (max 100)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const sp = request.nextUrl.searchParams
  const search = sp.get('search')?.trim()
  const entityType = sp.get('entityType')?.trim()
  const from = sp.get('from')
  const to = sp.get('to')
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10) || 25))

  const where: Prisma.AuditLogWhereInput = {}
  if (search) where.action = { contains: search, mode: 'insensitive' }
  if (entityType && entityType !== 'ALL') where.entityType = { equals: entityType, mode: 'insensitive' }
  const createdAt: Prisma.DateTimeFilter = {}
  if (from && !isNaN(Date.parse(from))) createdAt.gte = new Date(`${from}T00:00:00`)
  if (to && !isNaN(Date.parse(to))) createdAt.lte = new Date(`${to}T23:59:59.999`)
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt

  try {
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          admin: { select: { firstName: true, lastName: true } },
          merchant: { select: { businessName: true } },
          companyAdmin: { select: { firstName: true, lastName: true } },
          employee: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    const fullName = (p?: { firstName: string; lastName: string } | null) =>
      p ? `${p.firstName} ${p.lastName}`.trim() : null

    const data = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorType: r.actorType,
      actorName:
        fullName(r.admin) ??
        r.merchant?.businessName ??
        fullName(r.companyAdmin) ??
        fullName(r.employee) ??
        (r.actorType === 'system' ? 'System' : 'Unknown'),
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
    }))

    return NextResponse.json({
      success: true,
      data,
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    })
  } catch (err) {
    console.error('[ADMIN_AUDIT_LOGS] query failed', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
