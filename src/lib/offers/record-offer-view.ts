import { prisma } from '@/lib/prisma'
import { isOfferVisibleToEmployees } from '@/lib/offer-visibility'

export type RecordOfferViewResult =
  | { recorded: true; firstView: boolean }
  | { recorded: false; reason: string }

/**
 * Records that an employee viewed an offer. Single source of truth for
 * `OfferAnalytics.viewCount`, which counts UNIQUE employee views.
 *
 *   - Visibility uses `isOfferVisibleToEmployees`, the same rule the offer
 *     detail route uses, so any offer an employee can open is countable.
 *   - One `OfferView` row per (offerId, employeeId), enforced by the
 *     unique constraint. Re-opening never increments.
 *   - `viewCount` is upserted, so a missing analytics row is created.
 *
 * Safe to call repeatedly and from several routes for the same open.
 */
export async function recordOfferView(
  offerId: string,
  employeeId: string,
  options: { skipVisibilityCheck?: boolean } = {},
): Promise<RecordOfferViewResult> {
  if (!options.skipVisibilityCheck) {
    const visibility = await isOfferVisibleToEmployees(offerId)
    if (!visibility.visible) {
      return { recorded: false, reason: visibility.reason ?? 'not_visible' }
    }
  }

  const inserted = await prisma.offerView.createMany({
    data: [{ offerId, employeeId }],
    skipDuplicates: true,
  })

  if (inserted.count > 0) {
    await prisma.offerAnalytics.upsert({
      where: { offerId },
      create: { offerId, viewCount: 1 },
      update: { viewCount: { increment: 1 } },
    })
  }

  return { recorded: true, firstView: inserted.count > 0 }
}
