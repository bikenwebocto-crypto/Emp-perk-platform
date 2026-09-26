import type { ActionQueueType } from '@prisma/client'

/** An item of `pendingApprovals` from GET /api/admin/overview (an ActionQueueItem). */
export interface PendingApproval {
  /** ActionQueueItem id */
  id: string
  type: ActionQueueType | (string & {})
  title: string | null
  description: string | null
  /** Id of the underlying entity (merchant, offer, company, issue, …) */
  referenceId: string | null
  referenceType: string | null
  priority: number
  merchantName: string | null
  createdAt: string | null
}

function fallbackHref(item: Pick<PendingApproval, 'id' | 'type'>): string {
  const params = new URLSearchParams()
  if (item.type) params.set('type', item.type)
  if (item.id) params.set('id', item.id)
  const qs = params.toString()
  return qs ? `/admin/action-queue?${qs}` : '/admin/action-queue'
}

/**
 * Review route for a pending approval. Every queue type is reviewed on
 * /admin/action-queue/[id], keyed by the ActionQueueItem id; that page
 * picks the right review component (offer, replacement, company
 * activation, issue, …) and holds the approve/reject actions. The
 * entity pages (e.g. /admin/merchants/[id]) have no approval step.
 */
export function getApprovalHref(item: PendingApproval): string {
  if (!item.id) return fallbackHref(item)

  switch (item.type) {
    case 'NEW_MERCHANT_APPLICATION':
    case 'FIRST_OFFER_APPROVAL':
    case 'OFFER_REPLACEMENT':
    case 'PROFILE_EDIT_REQUEST':
    case 'COMPANY_ACTIVATION':
    case 'ISSUE_REVIEW':
    case 'CSV_IMPORT':
    case 'BRANCH_EDIT_REQUEST':
    case 'ASSET_REVIEW':
      return `/admin/action-queue/${encodeURIComponent(item.id)}`
    default:
      return fallbackHref(item)
  }
}
