import { prisma } from '@/lib/prisma';
import { notEndedBy } from '@/lib/offers/end-date';
import { isEvergreenOffer } from '@/lib/offers/evergreen';

/**
 * Merchants shown in the employee app: only those with a LIVE Evergreen offer
 * inside its validity window. A merchant whose first Evergreen is still
 * awaiting admin approval stays hidden.
 *
 * Evergreen = forever flag OR ≥1-year range, non-flash (see isEvergreenOffer),
 * which Prisma can't express, so candidates are filtered in memory.
 */
export async function getVisibleMerchantIds(
  merchantIds?: string[],
  now: Date = new Date(),
): Promise<string[]> {
  const offers = await prisma.merchantOffer.findMany({
    where: {
      status: 'LIVE',
      isFlash: false,
      deletedAt: null,
      startDate: { lte: now },
      AND: [notEndedBy(now)],
      ...(merchantIds ? { merchantId: { in: merchantIds } } : {}),
    },
    select: { merchantId: true, isForever: true, isFlash: true, startDate: true, endDate: true },
  });
  const ids = new Set<string>();
  for (const o of offers) if (isEvergreenOffer(o)) ids.add(o.merchantId);
  return [...ids];
}

/** True when this merchant should be visible in the employee app. */
export async function isMerchantVisible(merchantId: string, now: Date = new Date()) {
  return (await getVisibleMerchantIds([merchantId], now)).length > 0;
}
