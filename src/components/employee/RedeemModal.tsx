"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Gift,
  Info,
  Loader2,
  MapPin,
  Phone,
  Star,
  Store,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { showToast } from "@/hooks/use-toast";
import { type EmployeeOffer } from "./offers/employee-offer";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

/**
 * Shape of the data returned by `POST /api/employee/redeem`. The
 * field union varies by `redemptionType`. The modal renders the
 * subset relevant to the current offer.
 */
interface RedemptionResult {
  id: string;
  type: "ONLINE_CODE" | "BOOKING_LINK" | "IN_STORE_QR" | "VIRTUAL_CARD_AUTO_VERIFY";
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";
  offerCode?: string | null;
  bookingUrl?: string | null;
  merchantWebsite?: string | null;
  instructions?: string | null;
  merchant?: { businessName: string; website?: string | null };
  branch?: {
    name: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state?: string | null;
    postalCode?: string | null;
    phone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    openingHours?: string | null;
    googleMapsUrl?: string | null;
  };
  virtualCard?: {
    code: string | null;
    holderName: string;
    employeeNumber: string | null;
    companyName: string | null;
    merchantName: string;
    offerTitle: string;
    issuedAt: string;
    verified: true;
  };
}

/* ------------------------------------------------------------------ */
/* Formatters                                                           */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
  FLAT: "Flat",
  PERCENTAGE: "% Off",
  BUY_X_GET_Y: "BOGO",
  fixed_amount: "Fixed",
  percentage: "% Off",
  flat_rate: "Flat",
  buy_x_get_y: "BOGO",
};

const REDEMPTION_METHOD_LABELS: Record<string, string> = {
  ONLINE_CODE: "Online Code",
  BOOKING_LINK: "Booking Link",
  IN_STORE_QR: "In-Store (QR Code)",
  VIRTUAL_CARD_AUTO_VERIFY: "Virtual Card",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatDiscount(o: EmployeeOffer): string {
  switch (o.offerType) {
    case "PERCENTAGE":
    case "percentage":
      return `${o.discountPercent ?? Math.round(Number(o.discountValue))}% OFF`;
    case "BUY_X_GET_Y":
    case "buy_x_get_y":
      return "Buy 1 Get 1 Free";
    case "FLAT":
    case "flat_rate":
    case "fixed_amount":
      return `€${Number(o.discountValue).toFixed(2)} OFF`;
    default:
      return `${o.discountValue ?? ""}`;
  }
}

/* ------------------------------------------------------------------ */
/* Cache helpers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Patch every cached `['employee-offers', ...]` query so the affected
 * offer shows `isRedeemed = true` everywhere it's rendered (list
 * cards, featured row on the home page, etc.). Avoids a full refetch
 * — the user gets instant visual feedback.
 */
function patchOffersListCache(
  queryClient: QueryClient,
  offerId: string,
  patch: { isRedeemed?: boolean; currentRedemptions?: number },
) {
  queryClient.setQueriesData<{ data: any[]; meta?: any }>(
    { queryKey: ["employee-offers"] },
    (prev) => {
      if (!prev?.data) return prev;
      const idx = prev.data.findIndex((o) => o.id === offerId);
      if (idx < 0) return prev;
      const next = [...prev.data];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, data: next };
    },
  );
}

/* ------------------------------------------------------------------ */
/* Public component                                                     */
/* ------------------------------------------------------------------ */

export interface RedeemModalProps {
  /**
   * The full offer object. The modal is a pure presentation
   * component: it does NOT fetch offer details. Pass `null` to keep
   * the modal closed.
   */
  offer: EmployeeOffer | null;
  /** Whether the modal is open. The host owns this flag. */
  open: boolean;
  /** Called when the modal requests to open or close. */
  onOpenChange: (open: boolean) => void;
  /**
   * Optional callback fired when the user toggles the saved state.
   * The host is expected to perform the API call + cache update.
   */
  onSavedChange?: (offerId: string, isSaved: boolean) => void;
}

/**
 * Single source of truth for the offer view + redeem experience.
 *
 * - Receives the full `EmployeeOffer` (no fetch).
 * - Opens instantly — zero network round trips.
 * - The only network request issued by this component is the
 *   redemption POST (`POST /api/employee/redeem`).
 *
 * Lifecycle:
 *   1. View the offer details + a single "Redeem Now" button. No
 *      offer code, booking link, or branch info is shown before
 *      the user redeems.
 *   2. On click, the modal POSTs to `/api/employee/redeem`.
 *   3. On success, the button flips to a disabled "Already
 *      Redeemed" and the type-specific redemption details are
 *      revealed in the same modal.
 */
export function RedeemModal({
  offer,
  open,
  onOpenChange,
  onSavedChange,
}: RedeemModalProps) {
  const queryClient = useQueryClient();

  // ── Local state ────────────────────────────────────────────
  // `hasRedeemed` is initialised from the offer so an already-
  // redeemed offer shows the details immediately when the modal
  // opens. `redemptionResult` holds the response from the POST so
  // we can render offer code / booking link / branch info.
  const [hasRedeemed, setHasRedeemed] = useState<boolean>(!!offer?.isRedeemed);
  const [redemptionResult, setRedemptionResult] =
    useState<RedemptionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // ── Review state ───────────────────────────────────────────
  const [existingReview, setExistingReview] = useState<{
    id: string;
    rating: number;
  } | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [savingReview, setSavingReview] = useState(false);

  // After redemption, fetch existing review for this merchant
  // useEffect(() => {
  //   if (!hasRedeemed || !offer?.merchant.id) return
  //   fetch(`/api/employee/reviews?merchantId=${offer.merchant.id}`)
  //     .then((r) => r.json())
  //     .then((json) => {
  //       if (json?.data) {
  //         setExistingReview(json.data)
  //         setReviewRating(json.data.rating)
  //       }
  //     })
  //     .catch(() => {})
  // }, [hasRedeemed, offer?.merchant.id])

  // Tracks whether we've already fired the view analytics request
  // for the current offer. Reset when the offer changes.
  const viewRecordedRef = useRef(false);

  // ── Offer view tracking ───────────────────────────────────
  // Fire POST /api/employee/offers/view once per (offerId, employee).
  // The backend enforces "one view per employee per offer" via
  // offerAnalytics.upsert, so repeated calls are safe (no-ops).
  // This is fire-and-forget — never blocks the UI.
  const recordView = useCallback((offerId: string) => {
    if (viewRecordedRef.current) return;
    viewRecordedRef.current = true;
    console.log("recordView", offerId);
    fetch("/api/employee/offers/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId }),
    }).catch(() => {
      // Silently ignore — analytics must never block the UI.
    });
  }, []);

  // Reset local state every time the host hands us a different
  // offer, so reopening the modal for offer A does not leak the
  // redemption state of offer B.
  useEffect(() => {
    setHasRedeemed(!!offer?.isRedeemed);
    setRedemptionResult(null);
    setCopied(false);
    setExistingReview(null);
    setReviewRating(0);
    setHoverRating(0);
    viewRecordedRef.current = false;
    // Auto-select the sole branch for single-branch IN_STORE_QR offers;
    // require explicit selection for multi-branch (or reset to none).
    const active = (offer?.merchant.branches ?? []).filter((b) => b.isActive);
    if (offer?.redemptionType === "IN_STORE_QR" && active.length === 1) {
      setSelectedBranchId(active[0]!.id);
    } else {
      setSelectedBranchId(null);
    }
  }, [offer?.id, offer?.isRedeemed]);

  // Record a view when the modal opens (employee sees offer details)
  useEffect(() => {
    if (open && offer?.id) {
      recordView(offer.id);
    }
  }, [open, offer?.id, recordView]);

  // ── Derived data ───────────────────────────────────────────
  const canRedeem = !!offer?.isVisible && !hasRedeemed;
  const activeBranches = (offer?.merchant.branches ?? []).filter(
    (b) => b.isActive,
  );
  const initials = offer?.merchant.businessName
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const bannerImage =
    offer?.imageUrls && offer.imageUrls.length > 0 ? offer.imageUrls[0] : null;

  // ── Redeem mutation ───────────────────────────────────────
  // IN_STORE_QR requires a `branchId`. The employee must select
  // from the branch picker when multiple active branches exist.
  const redeemMutation = useMutation({
    mutationFn: async () => {
      const branchId =
        offer?.redemptionType === "IN_STORE_QR" ? selectedBranchId : null;
      const res = await fetch("/api/employee/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer?.id, branchId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message ?? "Failed to redeem");
      }
      return json;
    },
    onSuccess: (json) => {
      const data = json?.data as RedemptionResult | undefined;
      setHasRedeemed(true);
      setRedemptionResult(data ?? null);

      // Patch every cached offers list so the card flips to
      // "Already Redeemed" everywhere it's rendered.
      if (offer?.id) {
        patchOffersListCache(queryClient, offer.id, { isRedeemed: true });
      }

      // Invalidate related queries so subsequent navigations see
      // fresh server data. We intentionally do NOT invalidate
      // ['employee-offers'] — we patched it in place.
      queryClient.invalidateQueries({ queryKey: ["employee-redemptions"] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["employee-saved"] });

      showToast({
        type: "success",
        title: "Redemption confirmed",
        description: "Your offer has been redeemed successfully.",
      });
    },
    onError: (err: any) =>
      showToast({
        type: "error",
        title: "Redemption failed",
        description: err?.message ?? "Please try again.",
      }),
  });

  // ── Clipboard helper ──────────────────────────────────────
  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ────────────────────────────────────────────────
  // If the host passes `open` while there's no offer, stay closed
  // silently. This avoids briefly opening the modal during the
  // close → clear state → next open sequence.
  if (!open || !offer) return null;

  const o = offer;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight">
              {o.merchant.businessName}
            </h2>
            <p className="truncate text-sm text-muted-foreground">{o.title}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Banner ──────────────────────────────────────────── */}
        <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-primary/10 to-primary/5">
          {bannerImage ? (
            <img
              src={bannerImage}
              alt={o.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Gift className="h-16 w-16 text-muted-foreground/30" />
            </div>
          )}
          {(o.isFeatured || o.isExclusive) && (
            <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
              {o.isFeatured && (
                <Badge variant="default" className="text-[10px] shadow-md">
                  <Star className="mr-0.5 h-3 w-3" /> Featured
                </Badge>
              )}
              {o.isExclusive && (
                <Badge variant="secondary" className="text-[10px] shadow-md">
                  <SparklesIcon /> Exclusive
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 p-4">
          {/* ── Visibility warning ─────────────────────────── */}
          {!o.isVisible && (
            <div className="flex items-start gap-2 rounded-md bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  This offer is not currently available
                </p>
                {o.visibilityReason && (
                  <p className="text-xs">{o.visibilityReason}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Merchant + offer summary ───────────────────── */}
          <div className="flex items-center gap-3">
            {o.merchant.logoUrl ? (
              <img
                src={o.merchant.logoUrl}
                alt={o.merchant.businessName}
                className="h-12 w-12 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold">
                {initials || <Store className="h-5 w-5" />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {o.merchant.businessName}
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                <span>{Number(o.merchant.averageRating).toFixed(1)}</span>
                <span className="ml-1">·</span>
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {o.merchant.city ?? "—"}
                  {o.merchant.state ? `, ${o.merchant.state}` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* ── Title + discount + type ────────────────────── */}
          <div>
            <h3 className="text-xl font-bold tracking-tight">{o.title}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
                {formatDiscount(o)}
              </span>
              <Badge variant="secondary">
                {TYPE_LABELS[o.offerType] ?? o.offerType}
              </Badge>
              {o.redemptionType && (
                <Badge variant="outline">
                  {REDEMPTION_METHOD_LABELS[o.redemptionType] ??
                    o.redemptionType}
                </Badge>
              )}
            </div>
          </div>

          {o.shortDescription && (
            <p className="text-sm">{o.shortDescription}</p>
          )}

          {/* ── Description (if present) ────────────────────── */}
          {o.description && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="h-4 w-4" /> About this offer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{o.description}</p>
              </CardContent>
            </Card>
          )}

          {/* ── Gallery (skip the first image — it's the banner) ── */}
          {o.imageUrls && o.imageUrls.length > 1 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {o.imageUrls.slice(1, 4).map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`${o.title} ${i + 2}`}
                  className="h-40 w-full rounded-md border object-cover"
                />
              ))}
            </div>
          )}

          {/* ── Pricing + validity grid ────────────────────── */}
          <Card>
            <CardContent className="grid gap-2 p-3 sm:grid-cols-2">
              <div className="rounded-md border p-2 text-sm">
                <p className="text-xs text-muted-foreground">Valid</p>
                <p className="font-medium">
                  {new Date(o.startDate).toLocaleDateString()} –{" "}
                  {new Date(o.endDate).toLocaleDateString()}
                </p>
              </div>
              {o.maxRedemptions != null && (
                <div className="rounded-md border p-2 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Total redemptions
                  </p>
                  <p className="font-medium">
                    {o.currentRedemptions} / {o.maxRedemptions}
                  </p>
                </div>
              )}
              {o.minimumSpend != null && Number(o.minimumSpend) > 0 && (
                <div className="rounded-md border p-2 text-sm">
                  <p className="text-xs text-muted-foreground">Minimum spend</p>
                  <p className="font-medium">
                    ${Number(o.minimumSpend).toFixed(2)}
                  </p>
                </div>
              )}
              {o.discountMax != null && Number(o.discountMax) > 0 && (
                <div className="rounded-md border p-2 text-sm">
                  <p className="text-xs text-muted-foreground">Max discount</p>
                  <p className="font-medium">
                    ${Number(o.discountMax).toFixed(2)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Available days ─────────────────────────────── */}
          {(() => {
            const days =
              Array.isArray(o.daysOfWeek) && o.daysOfWeek.length > 0
                ? o.daysOfWeek
                : [0, 1, 2, 3, 4, 5, 6];
            const isEveryDay = days.length === 7;
            return (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {isEveryDay
                    ? "Available every day"
                    : `Available ${days
                        .map((d: number) => DAY_LABELS[d] ?? `D${d}`)
                        .join(" • ")}`}
                </span>
              </div>
            );
          })()}

          {/* ── Terms & Conditions ──────────────────────────── */}
          {o.termsAndConditions && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Terms &amp; Conditions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                  {o.termsAndConditions}
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Available branches (informational, non-QR only) ─ */}
          {o.redemptionType !== "IN_STORE_QR" &&
            o.merchant.branches.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4" /> Available at
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {o.merchant.branches.map((b) => (
                      <li key={b.id} className="rounded-md border p-2">
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.addressLine1}, {b.city}
                          {b.state ? `, ${b.state}` : ""} · {b.branchType}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

          {/* ── IN_STORE_QR: Store location / branch picker ──── */}
          {o.redemptionType === "IN_STORE_QR" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4" />{" "}
                  {activeBranches.length === 1
                    ? "Store Location"
                    : "Select a Store"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeBranches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active store locations available for this offer.
                  </p>
                ) : activeBranches.length === 1 ? (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-1">
                    <p className="font-semibold">{activeBranches[0]!.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {activeBranches[0]!.addressLine1},{" "}
                      {activeBranches[0]!.city}
                      {activeBranches[0]!.state
                        ? `, ${activeBranches[0]!.state}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activeBranches[0]!.branchType}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      This merchant has {activeBranches.length} active
                      locations. Choose one to redeem at:
                    </p>
                    {activeBranches.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBranchId(b.id)}
                        className={`w-full rounded-md border p-3 text-left transition-colors ${
                          selectedBranchId === b.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.addressLine1}, {b.city}
                          {b.state ? `, ${b.state}` : ""} · {b.branchType}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ──────────────────────────────────────────────── */}
          {/*   REDEEM BUTTON — single source of the call.      */}
          {/* ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            {o.redemptionType === "IN_STORE_QR" ? (
              hasRedeemed ? (
                <Button size="lg" disabled className="w-full sm:w-auto">
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Already Redeemed
                </Button>
              ) : (
                <div className="flex w-full items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    This offer is redeemed by scanning the in-store QR code at
                    checkout — no action needed here.
                  </span>
                </div>
              )
            ) : hasRedeemed ? (
              <Button size="lg" disabled className="w-full sm:w-auto">
                <CheckCircle2 className="mr-2 h-4 w-4" /> Already Redeemed
              </Button>
            ) : (
              <Button
                size="lg"
                disabled={!canRedeem || redeemMutation.isPending}
                onClick={() => {
                  if (offer?.id) recordView(offer.id);
                  redeemMutation.mutate();
                }}
                className="w-full sm:w-auto"
              >
                {redeemMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Tag className="mr-2 h-4 w-4" /> Redeem Now
                  </>
                )}
              </Button>
            )}
          </div>

          {/* ──────────────────────────────────────────────── */}
          {/*   POST-REDEMPTION REVEAL — shown only after success.*/}
          {/* ──────────────────────────────────────────────── */}
          {hasRedeemed && (
            <>
              {o.redemptionType === "ONLINE_CODE" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Your Offer Code</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between rounded-md border p-4">
                      <div>
                        <p className="text-2xl font-bold tracking-wider">
                          {redemptionResult?.offerCode ?? o.offerCode}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Use this code at checkout on the merchant website
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const code =
                            redemptionResult?.offerCode ?? o.offerCode;
                          if (code) handleCopy(code);
                        }}
                      >
                        <Copy className="mr-1 h-4 w-4" />
                        {copied ? "Copied!" : "Copy Code"}
                      </Button>
                    </div>
                    {(redemptionResult?.merchantWebsite ?? o.bookingUrl) && (
                      <div className="mt-3">
                        <a
                          href={
                            (redemptionResult?.merchantWebsite ??
                              o.bookingUrl) as string
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex animate-pulse items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                        >
                          <ExternalLink className="h-4 w-4" /> Visit merchant
                          website →
                        </a>
                      </div>
                    )}
                    {redemptionResult?.instructions && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {redemptionResult.instructions}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {o.redemptionType === "BOOKING_LINK" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Book This Offer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Click below to complete your booking on the
                      merchant&apos;s platform.
                    </p>
                    <a
                      href={
                        (redemptionResult?.bookingUrl ?? o.bookingUrl) as string
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex animate-pulse items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-bold text-primary-foreground hover:bg-primary/90 shadow-lg"
                    >
                      <ExternalLink className="h-4 w-4" /> Open Link
                    </a>
                    {redemptionResult?.instructions && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {redemptionResult.instructions}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {o.redemptionType === "IN_STORE_QR" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Redemption Confirmed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {redemptionResult?.branch ? (
                      <div className="space-y-3">
                        <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                          <p className="font-semibold">
                            {redemptionResult.branch.name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {redemptionResult.branch.addressLine1}
                            {redemptionResult.branch.addressLine2
                              ? `, ${redemptionResult.branch.addressLine2}`
                              : ""}
                            {redemptionResult.branch.city
                              ? `, ${redemptionResult.branch.city}`
                              : ""}
                            {redemptionResult.branch.state
                              ? `, ${redemptionResult.branch.state}`
                              : ""}
                            {redemptionResult.branch.postalCode
                              ? ` ${redemptionResult.branch.postalCode}`
                              : ""}
                          </p>
                          {redemptionResult.branch.phone && (
                            <p className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-4 w-4" />
                              {redemptionResult.branch.phone}
                            </p>
                          )}
                          {redemptionResult.branch.googleMapsUrl && (
                            <a
                              href={redemptionResult.branch.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              <MapPin className="h-4 w-4" /> Open in Google Maps
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Your redemption is confirmed. Show the redemption code
                          in your My Redemptions list to store staff as proof of
                          redemption.
                        </p>
                        {redemptionResult.instructions && (
                          <p className="text-sm text-muted-foreground">
                            {redemptionResult.instructions}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Your redemption is confirmed. Show the redemption code
                        in your My Redemptions list to store staff as proof of
                        redemption.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {o.redemptionType === "VIRTUAL_CARD_AUTO_VERIFY" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CreditCard className="h-4 w-4" /> Your Virtual Card
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {redemptionResult?.virtualCard ? (
                      <div className="rounded-xl bg-gradient-to-br from-primary to-primary/70 p-5 text-primary-foreground shadow-lg">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs uppercase tracking-wider opacity-80">
                              {redemptionResult.virtualCard.merchantName}
                            </p>
                            <p className="truncate font-semibold">
                              {redemptionResult.virtualCard.offerTitle}
                            </p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </span>
                        </div>
                        <p className="mt-5 font-mono text-2xl font-bold tracking-widest">
                          {redemptionResult.virtualCard.code ?? "—"}
                        </p>
                        <div className="mt-4 flex items-end justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {redemptionResult.virtualCard.holderName}
                            </p>
                            <p className="truncate text-xs opacity-80">
                              {redemptionResult.virtualCard.companyName ?? ""}
                              {redemptionResult.virtualCard.employeeNumber
                                ? ` · #${redemptionResult.virtualCard.employeeNumber}`
                                : ""}
                            </p>
                          </div>
                          <p className="shrink-0 text-xs opacity-80">
                            {new Date(
                              redemptionResult.virtualCard.issuedAt,
                            ).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Your redemption is verified. Your virtual card and code
                        are available in your My Redemptions list.
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Show this card to store staff. Your redemption has been
                      verified automatically.
                    </p>
                    {redemptionResult?.instructions && (
                      <p className="text-sm text-muted-foreground">
                        {redemptionResult.instructions}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Generic post-redemption instructions card — only
                  shown if the API returned instructions but no
                  type-specific card above already displayed them. */}
              {redemptionResult?.instructions &&
                o.redemptionType !== "ONLINE_CODE" &&
                o.redemptionType !== "BOOKING_LINK" &&
                o.redemptionType !== "IN_STORE_QR" &&
                o.redemptionType !== "VIRTUAL_CARD_AUTO_VERIFY" && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">How to redeem</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {redemptionResult.instructions}
                      </p>
                    </CardContent>
                  </Card>
                )}

              {/* ── Review this merchant ─────────────────── */}
              {/* <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    Rate this merchant
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        disabled={savingReview}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={async () => {
                          setSavingReview(true)
                          setReviewRating(star)
                          try {
                            const res = await fetch("/api/employee/reviews", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                merchantId: o.merchant.id,
                                rating: star,
                              }),
                            })
                            const json = await res.json()
                            if (json?.data) {
                              setExistingReview(json.data)
                            }
                          } catch {
                            setReviewRating(existingReview?.rating ?? 0)
                          } finally {
                            setSavingReview(false)
                          }
                        }}
                        className="transition-transform hover:scale-110 disabled:opacity-50"
                      >
                        <Star
                          className={`h-7 w-7 ${
                            (hoverRating || reviewRating) >= star
                              ? "fill-yellow-400 text-yellow-400"
                              : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    ))}
                    {savingReview && (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {existingReview && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {reviewRating > 0
                        ? `You rated this merchant ${reviewRating} out of 5`
                        : "Tap a star above to rate this merchant"}
                    </p>
                  )}
                </CardContent>
              </Card> */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* Sparkles is a small icon not in the lucide-react default bundle
   that we want for the "Exclusive" badge. Defining a tiny wrapper
   keeps the import block above tidy. */
function SparklesIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mr-0.5 inline"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  );
}
