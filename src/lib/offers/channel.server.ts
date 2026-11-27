import type { Prisma } from "@prisma/client";
import { activeInStoreBranchWhere } from '@/lib/branch-helpers';
import { notEndedBy } from '@/lib/offers/end-date';
import { prisma } from "@/lib/prisma";
import {
  branchSelectionError,
  branchSelectionFromConfig,
  channelUsesBranches,
  INVALID_BRANCHES_MESSAGE,
  missingBranchesMessage,
  NO_IN_STORE_BRANCH_MESSAGE,
  type ActiveBranchCounts,
  type BranchSelection,
  type OfferChannel,
} from "./channel";

/**
 * LIVE offers that depend on this branch, so it must not be deactivated or deleted.
 *   - In-store branch: offers (In-store / Both) that picked it, or that apply to
 *     all branches when it is the last active in-store branch left.
 *   - Online branch (legacy): no offers depend on it — online offers carry
 *     their own website link and code.
 */
export async function getLiveOffersLinkedToBranch(
  merchantId: string,
  branch: { id: string; branchType: string },
): Promise<{ id: string; title: string }[]> {
  if (branch.branchType === "ONLINE") return [];
  const offers = await prisma.merchantOffer.findMany({
    where: { merchantId, deletedAt: null, status: "LIVE", AND: [notEndedBy(new Date())] },
    select: {
      id: true,
      title: true,
      redemption: { select: { redemptionType: true, configuration: true } },
    },
  });

  let isLastActiveInStore: boolean | null = null;
  const linked: { id: string; title: string }[] = [];
  for (const offer of offers) {
    const sel = branchSelectionFromConfig(
      offer.redemption?.redemptionType,
      offer.redemption?.configuration,
    );
    if (!channelUsesBranches(sel.channel)) continue;
    if (!sel.allBranches) {
      if (sel.branchIds.includes(branch.id)) linked.push({ id: offer.id, title: offer.title });
      continue;
    }
    if (isLastActiveInStore === null) {
      const others = await prisma.merchantBranch.count({
        where: { ...activeInStoreBranchWhere(merchantId), id: { not: branch.id } },
      });
      isLastActiveInStore = others === 0;
    }
    if (isLastActiveInStore) linked.push({ id: offer.id, title: offer.title });
  }
  return linked;
}

/** Message shown when a branch can't be deactivated/deleted because live offers use it. */
export function linkedOffersMessage(
  action: "deactivate" | "delete",
  offers: { title: string }[],
): string {
  const names = offers.slice(0, 3).map((o) => `"${o.title}"`).join(", ");
  const more = offers.length > 3 ? ` and ${offers.length - 3} more` : "";
  return `This branch can't be ${action === "delete" ? "deleted" : "deactivated"} because it is linked to live offer${offers.length > 1 ? "s" : ""} ${names}${more}. Remove the branch from ${offers.length > 1 ? "these offers" : "this offer"} or end ${offers.length > 1 ? "them" : "it"} first.`;
}

/** Count the merchant's active (not deleted) branches by type. */
export async function getActiveBranchCounts(merchantId: string): Promise<ActiveBranchCounts> {
  const rows = await prisma.merchantBranch.groupBy({
    by: ["branchType"],
    where: { merchantId, status: "ACTIVE", isActive: true, deletedAt: null },
    _count: { _all: true },
  });
  const count = (t: string) => rows.find((r) => r.branchType === t)?._count._all ?? 0;
  // BOTH branches count as in-store and as online.
  return { inStore: count("IN_STORE") + count("BOTH"), online: count("ONLINE") + count("BOTH") };
}

/** Error message when the merchant lacks the active branch(es) the channel needs, else null. */
export async function requiredBranchesError(
  merchantId: string,
  channel: OfferChannel,
): Promise<string | null> {
  return missingBranchesMessage(channel, await getActiveBranchCounts(merchantId));
}

/** In-store branches an offer can be attached to (same rule as mobile + admin review). */
export async function getSelectableBranchIds(merchantId: string): Promise<string[]> {
  const branches = await prisma.merchantBranch.findMany({
    where: activeInStoreBranchWhere(merchantId),
    select: { id: true },
  });
  return branches.map((b) => b.id);
}

/**
 * The branches an offer's in-store card can really be used at right now.
 * "All branches" stores no ids, so it resolves to every active in-store branch.
 * Online-only offers → [].
 */
export async function resolveOfferBranches<S extends Prisma.MerchantBranchSelect>(
  merchantId: string,
  selection: BranchSelection,
  select: S,
) {
  if (!channelUsesBranches(selection.channel)) return [];
  return prisma.merchantBranch.findMany({
    where: {
      ...activeInStoreBranchWhere(merchantId),
      ...(selection.allBranches ? {} : { id: { in: selection.branchIds } }),
    },
    select,
    orderBy: { name: "asc" },
  });
}

/**
 * Check a branch selection against the merchant's branches.
 * `forSubmit` also enforces "all branches or at least one" (drafts may be incomplete).
 * Returns an error message, or null when valid.
 */
export async function validateBranchSelection(
  merchantId: string,
  selection: BranchSelection,
  { forSubmit }: { forSubmit: boolean },
): Promise<string | null> {
  if (!channelUsesBranches(selection.channel)) return null;
  if (forSubmit) {
    const missing = branchSelectionError(selection);
    if (missing) return missing;
  }
  const selectable = await getSelectableBranchIds(merchantId);
  if (forSubmit && selectable.length === 0) return NO_IN_STORE_BRANCH_MESSAGE;
  if (selection.branchIds.some((id) => !selectable.includes(id))) return INVALID_BRANCHES_MESSAGE;
  return null;
}
