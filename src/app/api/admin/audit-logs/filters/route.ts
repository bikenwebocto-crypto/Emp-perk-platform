import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/billing/auth-helpers'
import { AUDIT_LOG_ROLES } from '@/lib/access/account-access'

const MAX_OPTIONS = 500

/**
 * GET /api/admin/audit-logs/filters
 *
 * Filter options built from the values actually stored, so the entity-type and
 * action dropdowns always match real rows (stored casing is inconsistent across
 * writers, e.g. `merchant_offer` vs `MERCHANT_OFFER`). Uses GROUP BY on indexed
 * columns; no audit rows are sent to the browser.
 */
export async function GET() {
  const auth = await requireAdmin(AUDIT_LOG_ROLES)
  if (!auth.ok) return auth.response

  try {
    const [entityTypes, actions, actorTypes, companies] = await Promise.all([
      prisma.auditLog.groupBy({ by: ['entityType'], _count: { _all: true }, orderBy: { entityType: 'asc' }, take: MAX_OPTIONS }),
      prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' }, take: MAX_OPTIONS }),
      prisma.auditLog.groupBy({ by: ['actorType'], _count: { _all: true }, orderBy: { actorType: 'asc' } }),
      prisma.auditLog.groupBy({
        by: ['companyId'],
        where: { companyId: { not: null } },
        _count: { _all: true },
        take: MAX_OPTIONS,
        orderBy: { companyId: 'asc' },
      }),
    ])

    const companyIds = companies.map((c) => c.companyId).filter((v): v is string => !!v)
    const names = companyIds.length
      ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : []

    return NextResponse.json({
      success: true,
      data: {
        entityTypes: entityTypes.map((e) => ({ value: e.entityType, count: e._count._all })),
        actions: actions.map((a) => ({ value: a.action, count: a._count._all })),
        actorTypes: actorTypes.map((a) => ({ value: a.actorType, count: a._count._all })),
        companies: names
          .map((c) => ({ value: c.id, label: c.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
    })
  } catch (err) {
    console.error('[ADMIN_AUDIT_LOG_FILTERS] query failed', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
