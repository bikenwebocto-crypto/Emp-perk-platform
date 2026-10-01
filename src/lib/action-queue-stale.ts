import { prisma } from '@/lib/prisma'

const OFFER_QUEUE_TYPES = ['FIRST_OFFER_APPROVAL', 'OFFER_REPLACEMENT'] as const
const ACTIVE_STATUSES = ['PENDING', 'IN_PROGRESS'] as const

/**
 * Soft-delete guard for the admin approval queue.
 *
 * Offer approvals flow as action-queue items (FIRST_OFFER_APPROVAL /
 * OFFER_REPLACEMENT) that reference their offer via metadata
 * ({ offerId } / { newOfferId }). A merchant is allowed to delete an
 * AWAITING_APPROVAL offer — that soft-deletes the offer but leaves the
 * queue item behind. Those items must not appear in the queue list,
 * tab counts, or badge numbers: the underlying offer no longer exists
 * for review (acting on it 404s).
 *
 * Returns the IDs of PENDING/IN_PROGRESS offer-type queue items whose
 * referenced offer has been soft-deleted, so callers can exclude them.
 *
 * Read-only — two indexed queries, no writes, no schema changes.
 */
export async function getStaleOfferQueueItemIds(): Promise<string[]> {
  const items = await prisma.actionQueueItem.findMany({
    where: {
      status: { in: [...ACTIVE_STATUSES] },
      type: { in: [...OFFER_QUEUE_TYPES] },
    },
    select: { id: true, type: true, metadata: true },
  })

  const itemToOffer = new Map<string, string>()
  const offerIds: string[] = []
  for (const it of items) {
    const meta = (it.metadata ?? {}) as Record<string, unknown>
    const offerId =
      it.type === 'OFFER_REPLACEMENT'
        ? (meta.newOfferId as string | undefined)
        : (meta.offerId as string | undefined)
    if (offerId && typeof offerId === 'string') {
      itemToOffer.set(it.id, offerId)
      offerIds.push(offerId)
    }
  }
  if (offerIds.length === 0) return []

  const live = await prisma.merchantOffer.findMany({
    where: { id: { in: offerIds }, deletedAt: null },
    select: { id: true },
  })
  const liveIds = new Set(live.map((o) => o.id))

  return [...itemToOffer.entries()]
    .filter(([, offerId]) => !liveIds.has(offerId))
    .map(([itemId]) => itemId)
}
