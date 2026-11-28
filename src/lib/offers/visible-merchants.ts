import { prisma } from '@/lib/prisma';
import { isPhysicalBranch } from '@/lib/branch-helpers';
import { notEndedBy } from '@/lib/offers/end-date';
import { isEvergreenOffer } from '@/lib/offers/evergreen';
import { branchSelectionFromConfig, channelUsesBranches } from '@/lib/offers/channel';

/**
 * Where a merchant's LIVE Evergreen offer is valid (Doc 1 §05 one-perk rule):
 * the Evergreen's branch scope decides which branches show in the employee app.
 *   allBranches → every physical branch is covered
 *   otherwise   → only the chosen physical branches
 * Online-type branches carry no branch scope, so any LIVE Evergreen covers them.
 * An Online-only Evergreen has no in-store scope, so it covers no physical branch.
 */
export interface EvergreenCoverage {
  offerId: string;
  allBranches: boolean;
  branchIds: Set<string>;
}

/** Coverage from a stored offer's redemption row. No redemption row (legacy) → all branches. */
export function coverageFromRedemption(
  offerId: string,
  redemption: { redemptionType?: string | null; configuration?: unknown } | null | undefined,
): EvergreenCoverage {
  if (!redemption) return { offerId, allBranches: true, branchIds: new Set() };
  const sel = branchSelectionFromConfig(redemption.redemptionType, redemption.configuration);
  if (!channelUsesBranches(sel.channel)) return { offerId, allBranches: false, branchIds: new Set() };
  return { offerId, allBranches: sel.allBranches, branchIds: new Set(sel.branchIds) };
}

/** True when this branch is covered by the merchant's LIVE Evergreen. */
export function isBranchCovered(
  coverage: EvergreenCoverage | null | undefined,
  branch: { id: string; branchType?: string | null },
): boolean {
  if (!coverage) return false;
  if (!isPhysicalBranch(branch.branchType)) return true;
  return coverage.allBranches || coverage.branchIds.has(branch.id);
}

/**
 * LIVE Evergreen coverage per merchant, for Evergreens inside their validity
 * window. A merchant whose first Evergreen is still awaiting approval has none.
 *
 * Evergreen = forever flag OR ≥1-year range, non-flash (see isEvergreenOffer),
 * which Prisma can't express, so candidates are filtered in memory.
 */
export async function getEvergreenCoverage(
  merchantIds?: string[],
  now: Date = new Date(),
): Promise<Map<string, EvergreenCoverage>> {
  const offers = await prisma.merchantOffer.findMany({
    where: {
      status: 'LIVE',
      isFlash: false,
      deletedAt: null,
      startDate: { lte: now },
      AND: [notEndedBy(now)],
      ...(merchantIds ? { merchantId: { in: merchantIds } } : {}),
    },
    select: {
      id: true,
      merchantId: true,
      isForever: true,
      isFlash: true,
      startDate: true,
      endDate: true,
      redemption: { select: { redemptionType: true, configuration: true } },
    },
  });
  const map = new Map<string, EvergreenCoverage>();
  for (const o of offers) {
    if (!isEvergreenOffer(o) || map.has(o.merchantId)) continue;
    map.set(o.merchantId, coverageFromRedemption(o.id, o.redemption));
  }
  return map;
}

/**
 * Merchants shown in the employee app: only those with a LIVE Evergreen offer
 * inside its validity window.
 */
export async function getVisibleMerchantIds(
  merchantIds?: string[],
  now: Date = new Date(),
): Promise<string[]> {
  return [...(await getEvergreenCoverage(merchantIds, now)).keys()];
}

/** True when this merchant should be visible in the employee app. */
export async function isMerchantVisible(merchantId: string, now: Date = new Date()) {
  return (await getVisibleMerchantIds([merchantId], now)).length > 0;
}

/**
 * What the employee app may show: visible merchants plus the active branches
 * their LIVE Evergreen covers. Use `branchIds` in Prisma `where` clauses so a
 * branch with no LIVE Evergreen never reaches the app.
 */
export async function getVisibleScope(
  now: Date = new Date(),
  merchantIds?: string[],
): Promise<{ merchantIds: string[]; branchIds: string[] }> {
  const coverage = await getEvergreenCoverage(merchantIds, now);
  const ids = [...coverage.keys()];
  if (ids.length === 0) return { merchantIds: [], branchIds: [] };
  const branches = await prisma.merchantBranch.findMany({
    where: { merchantId: { in: ids }, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, merchantId: true, branchType: true },
  });
  const branchIds = branches
    .filter((b) => isBranchCovered(coverage.get(b.merchantId), b))
    .map((b) => b.id);
  return { merchantIds: ids, branchIds };
}
