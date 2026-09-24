import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, fromCurrentUser } from "@/services/audit-log.service";
import { getCurrentUser } from "@/lib/supabase/server";
import { QUEUE_TYPE_MAP, type QueueTabKey, getPriorityLabel } from "@/lib/action-queue-types";
import { getStaleOfferQueueItemIds } from "@/lib/action-queue-stale";
import { publishBusinessToAdmins } from "@/services/business-notification.service";

function unauthorized() {
  return NextResponse.json(
    { success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
    { status: 401 },
  );
}

function internalError(error: unknown) {
  console.error("Action Queue API error:", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL", message: "Internal server error" } },
    { status: 500 },
  );
}

// ---------------- Helpers ----------------

type Where = Record<string, unknown>;
type TabFilter = QueueTabKey | "ALL";
type PriorityLabel = "HIGH" | "MEDIUM" | "STANDARD" | "LOW";

const MATCH_NONE: Where = { id: { in: [] } };

function and(...parts: (Where | undefined)[]): Where {
  const p = parts.filter(Boolean) as Where[];
  return p.length ? { AND: p } : {};
}

const VALID_TABS = new Set<string>(
  Object.values(QUEUE_TYPE_MAP).map((m) => m.tabCategory),
);

function isQueueTab(value: string): value is QueueTabKey {
  return VALID_TABS.has(value);
}

function normalizeTab(tabParam: string | null): TabFilter {
  const raw = tabParam?.trim().toUpperCase() || "ALL";
  return isQueueTab(raw) ? raw : "ALL";
}

function resolveTypeFilter(
  queueTypeParam: string | null,
  typeParam: string | null,
): string[] | undefined {
  if (queueTypeParam) return QUEUE_TYPE_MAP[queueTypeParam] ? [queueTypeParam] : [];
  if (typeParam && typeParam.trim().toUpperCase() !== "ALL") {
    return typeParam.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return undefined;
}

const PRIORITY_RANGES: Record<PriorityLabel, [number, number]> = {
  HIGH: [4, 100],
  MEDIUM: [3, 3],
  STANDARD: [2, 2],
  LOW: [0, 1],
};

function isPriorityLabel(value: string): value is PriorityLabel {
  return value in PRIORITY_RANGES;
}

// ---------------- GET ----------------

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.userType !== "admin") return unauthorized();

    const sp = new URL(request.url).searchParams;
    const status = sp.get("status")?.trim().toUpperCase() || null;
    const priority = sp.get("priority")?.trim().toUpperCase() || null;
    const tab = normalizeTab(sp.get("tab")); // "All", "", missing, unknown → "ALL"
    const q = sp.get("q")?.trim();
    const page = Math.max(1, parseInt(sp.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") ?? "50") || 50));

    // ---- Status ----
    // No tab → all records. Tab selected → PENDING only.
    // Explicit status (not ALL) always wins.
    const explicitStatus = status && status !== "ALL" ? status : null;

    const allTabStatusWhere: Where | undefined = explicitStatus
      ? { status: explicitStatus }
      : undefined;

    const tabStatusWhere: Where = explicitStatus
      ? { status: explicitStatus }
      : { status: "PENDING" };

    const statusWhere = tab === "ALL" ? allTabStatusWhere : tabStatusWhere;

    // ---- Type (queueType / type params) ----
    const queueTypes = resolveTypeFilter(sp.get("queueType"), sp.get("type"));
    const typeWhere: Where | undefined =
      queueTypes === undefined
        ? undefined
        : queueTypes.length
          ? { type: { in: queueTypes } }
          : MATCH_NONE;

    // ---- Tab (ALL → no filter) ----
    let tabWhere: Where | undefined;
    if (tab !== "ALL") {
      const tabTypes = Object.entries(QUEUE_TYPE_MAP)
        .filter(([, m]) => m.tabCategory === tab)
        .map(([k]) => k);
      tabWhere = { type: { in: tabTypes } };
    }

    // ---- Priority ----
    const range = priority && isPriorityLabel(priority) ? PRIORITY_RANGES[priority] : undefined;
    const priorityWhere: Where | undefined = range
      ? { priority: { gte: range[0], lte: range[1] } }
      : undefined;

    // ---- Search ----
    const searchWhere: Where | undefined = q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined;

    // ---- Soft-delete guard ----
    const staleIds = await getStaleOfferQueueItemIds();
    const staleWhere: Where | undefined = staleIds.length
      ? { id: { notIn: staleIds } }
      : undefined;

    // ---- List + priority buckets follow the current tab's status rule ----
    const listWhere = and(statusWhere, typeWhere, tabWhere, priorityWhere, searchWhere, staleWhere);
    const priorityCountWhere = and(statusWhere, typeWhere, tabWhere, searchWhere, staleWhere);

    // ---- Tab badges: ALL uses all statuses, each tab uses PENDING ----
    const allBadgeWhere = and(allTabStatusWhere, typeWhere, priorityWhere, searchWhere, staleWhere);
    const tabBadgeWhere = and(tabStatusWhere, typeWhere, priorityWhere, searchWhere, staleWhere);

    const [items, total, priorityCounts, allCount, typeCounts] = await Promise.all([
      prisma.actionQueueItem.findMany({
        where: listWhere as any,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { merchant: { select: { id: true, businessName: true } } },
      }),
      prisma.actionQueueItem.count({ where: listWhere as any }),
      prisma.actionQueueItem.groupBy({
        by: ["priority"],
        _count: { _all: true },
        where: priorityCountWhere as any,
      }),
      prisma.actionQueueItem.count({ where: allBadgeWhere as any }),
      prisma.actionQueueItem.groupBy({
        by: ["type"],
        _count: { _all: true },
        where: tabBadgeWhere as any,
      }),
    ]);

    // ---- Priority buckets ----
    const priorityBuckets: Record<PriorityLabel, number> = {
      HIGH: 0,
      MEDIUM: 0,
      STANDARD: 0,
      LOW: 0,
    };
    for (const p of priorityCounts) {
      const label = getPriorityLabel(p.priority) as PriorityLabel;
      priorityBuckets[label] += p._count._all;
    }

    // ---- Tab counts ----
    const tabCounts: Record<TabFilter, number> = {
      ALL: allCount,
      OFFER_APPROVAL: 0,
      COMPANY_ACTIVATION: 0,
      ISSUES: 0,
      ALERTS: 0,
    };
    for (const row of typeCounts) {
      const cat = QUEUE_TYPE_MAP[row.type]?.tabCategory;
      if (cat) tabCounts[cat] += row._count._all;
    }

    return NextResponse.json({
      success: true,
      data: items,
      meta: {
        tab,
        priorityBuckets,
        tabCounts,
        count: total,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: page * pageSize < total,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    return internalError(error);
  }
}