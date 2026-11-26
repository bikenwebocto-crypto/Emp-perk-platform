import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { getMerchantFromSession } from '@/lib/merchant-session'

/**
 * The merchant's own profile / branch-location change requests and their
 * outcome. Requests live in action_queue_items (type PROFILE_EDIT_REQUEST);
 * the admin's rejection reason is stored in metadata.rejectionReason.
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.userType !== 'merchant') {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 },
      )
    }
    const merchant = await getMerchantFromSession()
    if (!merchant) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Merchant not found' } },
        { status: 404 },
      )
    }

    const items = await prisma.actionQueueItem.findMany({
      where: {
        type: 'PROFILE_EDIT_REQUEST',
        OR: [{ merchantId: merchant.id }, { referenceId: merchant.id, referenceType: 'merchant' }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, status: true, metadata: true, createdAt: true, completedAt: true },
    })

    // Resolve requested category ids to names so the UI can show "Requested: <name>".
    const categoryIds = [
      ...new Set(
        items
          .map((i) => ((i.metadata as Record<string, any> | null)?.requestedFields ?? {}).categoryId)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    ]
    const categories = categoryIds.length
      ? await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
      : []
    const categoryName = new Map(categories.map((c) => [c.id, c.name]))

    const data = items.map((item) => {
      const meta = (item.metadata as Record<string, any> | null) ?? {}
      const requested = (meta.requestedFields ?? {}) as Record<string, unknown>
      const requestedValues: Record<string, unknown> = {}
      for (const f of ['businessName', 'categoryId', 'logoUrl']) {
        if (f in requested) requestedValues[f] = requested[f]
      }
      const status =
        item.status === 'COMPLETED' ? 'APPROVED' : item.status === 'FAILED' ? 'REJECTED' : 'PENDING'
      return {
        id: item.id,
        kind: meta.branchId ? 'BRANCH_LOCATION' : 'PROFILE',
        branchName: (meta.branchName as string | undefined) ?? null,
        fields: (meta.approvalFields ?? meta.changedFields ?? []) as string[],
        reason: (meta.reason as string | undefined) ?? null,
        requestedValues,
        requestedCategoryName:
          typeof requestedValues.categoryId === 'string'
            ? categoryName.get(requestedValues.categoryId) ?? null
            : null,
        status,
        rejectionReason: status === 'REJECTED' ? ((meta.rejectionReason as string | undefined) ?? null) : null,
        createdAt: item.createdAt,
        decidedAt: item.completedAt,
      }
    })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Merchant change-requests API error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    )
  }
}
