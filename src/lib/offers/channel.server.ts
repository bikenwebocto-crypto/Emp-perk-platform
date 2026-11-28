import type { Prisma } from "@prisma/client";
import { activeInStoreBranchWhere, isPhysicalBranch } from '@/lib/branch-helpers';
import { notEndedBy } from '@/lib/offers/end-date';
import { isEvergreenOffer } from '@/lib/offers/evergreen';
import { coverageFromRedemption, getEvergreenCoverage, isBranchCovered } from '@/lib/offers/visible-merchants';
import { prisma } from "@/lib/prisma";
import {
  branchSelectionError,
  branchSelectionFromConfig,
  channelUsesBranches,
  evergreenBranchCoveredMessage,
  evergreenBranchLinkedMessage,
  evergreenBranchLinkMessage,
  evergreenCoverageMessage,
  EVERGREEN_BRANCH_HIDDEN_MESSAGE,
  NO_LIVE_EVERGREEN_BRANCH_MESSAGE,
  withBranchSelection,
  withChannelDetails,
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

// ── Evergreen branch coverage (Doc 1 §05 one-perk rule) ──────────────────────

type Db = Pick<typeof prisma, "merchantBranch" | "merchantOffer" | "offerRedemption">;

/**
 * Names of the merchant's active in-store branches an Evergreen offer would
 * leave uncovered. Non-Evergreen offers never need full coverage → [].
 */
export async function getEvergreenUncoveredBranches(
  db: Db,
  merchantId: string,
  offer: {
    id: string;
    isForever?: boolean | null;
    isFlash?: boolean | null;
    startDate: Date | string;
    endDate: Date | string | null;
  },
  redemption: { redemptionType?: string | null; configuration?: unknown } | null | undefined,
): Promise<string[]> {
  if (!isEvergreenOffer(offer)) return [];
  const coverage = coverageFromRedemption(offer.id, redemption);
  if (coverage.allBranches) return [];
  const branches = await db.merchantBranch.findMany({
    where: activeInStoreBranchWhere(merchantId),
    select: { id: true, name: true, branchType: true },
    orderBy: { name: "asc" },
  });
  return branches.filter((b) => !isBranchCovered(coverage, b)).map((b) => b.name);
}

/** Merchant-facing error when an Evergreen submission leaves branches uncovered, else null. */
export async function evergreenCoverageError(
  db: Db,
  merchantId: string,
  offer: Parameters<typeof getEvergreenUncoveredBranches>[2],
  redemption: Parameters<typeof getEvergreenUncoveredBranches>[3],
): Promise<string | null> {
  const uncovered = await getEvergreenUncoveredBranches(db, merchantId, offer, redemption);
  if (uncovered.length === 0) return null;
  const channel = redemption
    ? branchSelectionFromConfig(redemption.redemptionType, redemption.configuration).channel
    : "IN_STORE";
  return evergreenCoverageMessage(uncovered, channel);
}

export type EvergreenBranchLinkChoice = "LINK" | "LATER";

export type EvergreenBranchLinkResult =
  | { status: "NOT_NEEDED"; message: string | null }
  | { status: "LINK_REQUIRED"; message: string; evergreen: { id: string; title: string } }
  | { status: "LINKED" | "HIDDEN"; message: string; evergreen: { id: string; title: string } };

/**
 * Run when a branch is added or becomes active in-store. Under the one-LIVE-
 * Evergreen rule the merchant can:
 *   LINK  → add the branch to the live Evergreen's chosen branches (live at once)
 *   LATER → keep the branch hidden until a replacement Evergreen covers it
 * No choice sent and the branch would be uncovered → LINK_REQUIRED (ask first).
 * `dryRun` only reports what is needed (used before the branch is saved).
 */
export async function applyEvergreenBranchLink(
  merchantId: string,
  branch: { id: string | null; branchType: string },
  choice: EvergreenBranchLinkChoice | undefined,
  {
    dryRun = false,
    client = prisma,
  }: {
    dryRun?: boolean;
    /** Pass a transaction client so the Evergreen write joins the caller's transaction. */
    client?: Prisma.TransactionClient | typeof prisma;
  } = {},
): Promise<EvergreenBranchLinkResult> {
  if (!isPhysicalBranch(branch.branchType)) return { status: "NOT_NEEDED", message: null };
  const coverage = (await getEvergreenCoverage([merchantId])).get(merchantId);
  if (!coverage) return { status: "NOT_NEEDED", message: NO_LIVE_EVERGREEN_BRANCH_MESSAGE };
  const evergreen = await client.merchantOffer.findUnique({
    where: { id: coverage.offerId },
    select: { id: true, title: true, redemption: { select: { id: true, redemptionType: true, configuration: true } } },
  });
  if (!evergreen) return { status: "NOT_NEEDED", message: null };
  const ref = { id: evergreen.id, title: evergreen.title };
  if (branch.id && isBranchCovered(coverage, { id: branch.id, branchType: branch.branchType })) {
    return {
      status: "NOT_NEEDED",
      message: coverage.allBranches ? evergreenBranchCoveredMessage(evergreen.title) : null,
    };
  }
  if (!choice) return { status: "LINK_REQUIRED", message: evergreenBranchLinkMessage(evergreen.title), evergreen: ref };
  if (choice === "LATER") return { status: "HIDDEN", message: EVERGREEN_BRANCH_HIDDEN_MESSAGE, evergreen: ref };
  if (dryRun || !branch.id) return { status: "LINKED", message: evergreenBranchLinkedMessage(evergreen.title), evergreen: ref };

  const sel = branchSelectionFromConfig(evergreen.redemption?.redemptionType, evergreen.redemption?.configuration);
  if (!evergreen.redemption || !channelUsesBranches(sel.channel)) {
    // Online-only Evergreen has no in-store scope to add to: only a replacement can cover it.
    return { status: "HIDDEN", message: EVERGREEN_BRANCH_HIDDEN_MESSAGE, evergreen: ref };
  }
  const config = withChannelDetails(
    withBranchSelection((evergreen.redemption.configuration ?? {}) as Record<string, unknown>, {
      ...sel,
      allBranches: false,
      branchIds: Array.from(new Set([...sel.branchIds, branch.id])),
    }),
  );
  await client.offerRedemption.update({
    where: { id: evergreen.redemption.id },
    data: { configuration: config as Prisma.InputJsonValue },
  });
  return { status: "LINKED", message: evergreenBranchLinkedMessage(evergreen.title), evergreen: ref };
}

/** Read the merchant's link choice from a request body. */
export function parseEvergreenLinkChoice(body: Record<string, unknown>): EvergreenBranchLinkChoice | undefined {
  return body.evergreenLink === "LINK" || body.evergreenLink === "LATER" ? body.evergreenLink : undefined;
}
