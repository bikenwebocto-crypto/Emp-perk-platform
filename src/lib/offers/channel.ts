import { isOnlineBranch, isPhysicalBranch } from "@/lib/branch-helpers";
/**
 * Offer channel (In-store / Online / Both) and branch selection.
 *
 * Stored inside OfferRedemption.configuration (JSON) so no migration is needed
 * and the current mobile API keeps working:
 *   configuration.channel     "IN_STORE" | "ONLINE" | "BOTH"
 *   configuration.allBranches true when the offer applies to every in-store branch
 *   configuration.branchIds   chosen in-store branch ids (when allBranches is false)
 *
 * redemptionType stays the single value the mobile app understands today:
 *   IN_STORE → VIRTUAL_CARD_AUTO_VERIFY
 *   ONLINE   → ONLINE_CODE
 *   BOTH     → ONLINE_CODE (code + booking link); the mobile app will read
 *              `channel` to also show the virtual card once it's updated.
 */
export type OfferChannel = "IN_STORE" | "ONLINE" | "BOTH";

export const OFFER_CHANNELS: ReadonlyArray<{ value: OfferChannel; label: string }> = [
  { value: "IN_STORE", label: "In-store" },
  { value: "ONLINE", label: "Online" },
  { value: "BOTH", label: "Both" },
];

export const BRANCHES_REQUIRED_MESSAGE = "Choose all branches or at least one";
export const NO_IN_STORE_BRANCH_MESSAGE =
  "In-store offers need an active In-store branch. Go to Branches to add or activate it first, then submit this offer.";
export const INVALID_BRANCHES_MESSAGE =
  "Some chosen branches are not available. Refresh and choose again.";

export const MISSING_BRANCHES_CODE = "MISSING_REQUIRED_BRANCH";

/** Active branches the merchant has, by type. */
export interface ActiveBranchCounts {
  inStore: number;
  online: number;
}

/**
 * Branches a channel needs before an offer can be submitted:
 *   In-store → an active In-store branch
 *   Online   → nothing (the offer carries its own website link and code;
 *              redemption happens on the merchant's site)
 *   Both     → an active In-store branch
 */
export function missingBranchTypes(
  channel: OfferChannel,
  counts: ActiveBranchCounts,
): Array<"IN_STORE"> {
  return channel !== "ONLINE" && counts.inStore === 0 ? ["IN_STORE"] : [];
}

const CHANNEL_NAME: Record<OfferChannel, string> = {
  IN_STORE: "In-store",
  ONLINE: "Online",
  BOTH: "In-store + Online (Both)",
};

/** Message telling the merchant which branch(es) to add or activate, or null. */
export function missingBranchesMessage(
  channel: OfferChannel,
  counts: ActiveBranchCounts,
): string | null {
  if (missingBranchTypes(channel, counts).length === 0) return null;
  return `${CHANNEL_NAME[channel]} offers need an active In-store branch. Go to Branches to add or activate it first, then submit this offer.`;
}

/** Count active branches by type from a `/api/merchant/branches?status=active` response. */
export function countActiveBranches(
  rows: Array<{ branchType?: string; status?: string }> | null | undefined,
): ActiveBranchCounts {
  const active = (rows ?? []).filter((b) => b.status === undefined || b.status === "ACTIVE");
  return {
    inStore: active.filter((b) => isPhysicalBranch(b.branchType)).length,
    online: active.filter((b) => isOnlineBranch(b.branchType)).length,
  };
}

/**
 * Branch setup is complete when the merchant has an active In-store branch.
 * Online offers don't need a branch. Returns what is still missing, with a short message.
 */
export function branchSetupStatus(counts: ActiveBranchCounts): {
  complete: boolean;
  missing: Array<"IN_STORE">;
  message: string | null;
} {
  const missing = missingBranchTypes("IN_STORE", counts);
  const message = missing.length
    ? "Add an In-store branch (or activate it) to complete branch setup."
    : null;
  return { complete: missing.length === 0, missing, message };
}

export interface BranchSelection {
  channel: OfferChannel;
  allBranches: boolean;
  branchIds: string[];
}

const isChannel = (v: unknown): v is OfferChannel =>
  v === "IN_STORE" || v === "ONLINE" || v === "BOTH";

/** In-store and Both offers are tied to in-store branches; online offers are not. */
export function channelUsesBranches(channel: OfferChannel): boolean {
  return channel !== "ONLINE";
}

export function channelRedemptionType(channel: OfferChannel): string {
  return channel === "IN_STORE" ? "VIRTUAL_CARD_AUTO_VERIFY" : "ONLINE_CODE";
}

/** Every redemption method a channel supports; stored in OfferRedemption.redemptionTypes. */
export function channelRedemptionTypes(channel: OfferChannel): string[] {
  if (channel === "IN_STORE") return ["VIRTUAL_CARD_AUTO_VERIFY"];
  if (channel === "ONLINE") return ["ONLINE_CODE"];
  return ["ONLINE_CODE", "VIRTUAL_CARD_AUTO_VERIFY"];
}

/**
 * Copy of a redemption configuration with per-method detail blocks:
 *   online  { code, bookingUrl, instructions }       (Online / Both)
 *   inStore { code, allBranches, branchIds }         (In-store / Both — card at the chosen branches)
 * Call it last, after code/bookingUrl/branches are written. No channel → unchanged.
 */
export function withChannelDetails(config: Record<string, unknown>): Record<string, unknown> {
  if (!isChannel(config.channel)) return config;
  const channel = config.channel;
  const next: Record<string, unknown> = { ...config };
  delete next.online;
  delete next.inStore;
  if (channelHasOnlineCode(channel)) {
    next.online = {
      code: config.code ?? null,
      bookingUrl: config.bookingUrl ?? null,
      instructions: config.instructions ?? null,
    };
  }
  if (channelUsesBranches(channel)) {
    next.inStore = {
      code: config.code ?? null,
      allBranches: config.allBranches !== false,
      branchIds: Array.isArray(config.branchIds) ? config.branchIds : [],
    };
  }
  return next;
}

/**
 * Redemption fields for API responses. `redemptionType` keeps its legacy single
 * value for older app builds; `channel` + `redemptionTypes` say what the offer really supports.
 */
export function redemptionResponseFields(
  redemption:
    | { redemptionType?: string | null; redemptionTypes?: string[] | null; configuration?: unknown }
    | null
    | undefined,
): { channel: OfferChannel | null; redemptionTypes: string[] } {
  if (!redemption) return { channel: null, redemptionTypes: [] };
  const cfg = (redemption.configuration ?? {}) as Record<string, unknown>;
  const known = isChannel(cfg.channel) || redemption.redemptionType != null;
  const channel = known ? channelFromRedemption(redemption.redemptionType, redemption.configuration) : null;
  const redemptionTypes =
    redemption.redemptionTypes && redemption.redemptionTypes.length > 0
      ? redemption.redemptionTypes
      : isChannel(cfg.channel)
        ? channelRedemptionTypes(cfg.channel)
        : redemption.redemptionType
          ? [redemption.redemptionType]
          : [];
  return { channel, redemptionTypes };
}

/**
 * True when the offer can be redeemed with `type`. Reads `redemptionTypes`
 * (so "Both" offers count as in-store too), falling back to the legacy single value.
 */
export function offerSupportsRedemptionType(
  redemption:
    | { redemptionType?: string | null; redemptionTypes?: string[] | null; configuration?: unknown }
    | null
    | undefined,
  type: string,
): boolean {
  if (!redemption) return false;
  if (redemption.redemptionType === type) return true;
  return redemptionResponseFields(redemption).redemptionTypes.includes(type);
}

export function channelHasOnlineCode(channel: OfferChannel): boolean {
  return channel !== "IN_STORE";
}

/** Read the channel back from a stored offer; older offers derive it from redemptionType. */
export function channelFromRedemption(
  redemptionType: string | null | undefined,
  configuration: unknown,
): OfferChannel {
  const cfg = (configuration ?? {}) as Record<string, unknown>;
  if (isChannel(cfg.channel)) return cfg.channel;
  return redemptionType === "VIRTUAL_CARD_AUTO_VERIFY" || redemptionType === "IN_STORE_QR"
    ? "IN_STORE"
    : "ONLINE";
}

/** Read the branch selection back from a stored offer. Older offers apply to all branches. */
export function branchSelectionFromConfig(
  redemptionType: string | null | undefined,
  configuration: unknown,
): BranchSelection {
  const cfg = (configuration ?? {}) as Record<string, unknown>;
  const branchIds = Array.isArray(cfg.branchIds)
    ? cfg.branchIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    channel: channelFromRedemption(redemptionType, configuration),
    allBranches: typeof cfg.allBranches === "boolean" ? cfg.allBranches : branchIds.length === 0,
    branchIds,
  };
}

/**
 * Parse channel/branches from a request body.
 *   - no `channel` sent → { ok: true, value: undefined } (leave stored values alone)
 *   - malformed         → { ok: false, error }
 */
export function parseBranchSelection(
  body: Record<string, unknown>,
): { ok: true; value: BranchSelection | undefined } | { ok: false; error: string } {
  if (body.channel === undefined || body.channel === null) return { ok: true, value: undefined };
  if (!isChannel(body.channel)) {
    return { ok: false, error: "channel must be IN_STORE, ONLINE or BOTH" };
  }
  const rawIds = body.branchIds ?? [];
  if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== "string")) {
    return { ok: false, error: "branchIds must be a list of branch ids" };
  }
  const usesBranches = channelUsesBranches(body.channel);
  const allBranches = usesBranches ? body.allBranches !== false : false;
  return {
    ok: true,
    value: {
      channel: body.channel,
      allBranches,
      branchIds: usesBranches && !allBranches ? Array.from(new Set(rawIds as string[])) : [],
    },
  };
}

/** Field error for a selection that can't be submitted, or null. */
export function branchSelectionError(selection: BranchSelection): string | null {
  if (!channelUsesBranches(selection.channel)) return null;
  if (!selection.allBranches && selection.branchIds.length === 0) return BRANCHES_REQUIRED_MESSAGE;
  return null;
}

/** Copy of a redemption configuration with channel/branches written in. */
export function withBranchSelection(
  config: Record<string, unknown>,
  selection: BranchSelection,
): Record<string, unknown> {
  return {
    ...config,
    channel: selection.channel,
    allBranches: selection.allBranches,
    branchIds: selection.branchIds,
  };
}
