"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { showToast } from "@/hooks/use-toast";
import {
  ShoppingBag,
  TrendingUp,
  Award,
  MapPin,
  Search,
  ExternalLink,
  Check,
  X,
  Loader2,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import {
  METHOD_LABELS,
  type RedemptionStatus,
  type RedemptionMethod,
} from "@/lib/redemption-status";

interface RedemptionRow {
  id: string;
  redemptionCode: string;
  discountAmount: number | string;
  savingsAmount: number | string;
  redeemedAt: string;
  branchId: string | null;
  employee: { id: string; firstName: string; lastName: string; email: string };
  company: { id: string; name: string };
  offer: {
    id: string;
    title: string;
    offerType: string;
    pricing?: { configuration?: Record<string, unknown> };
    redemption?: {
      redemptionType?: string | null;
      configuration?: Record<string, unknown>;
      maxRedemptions?: number | null;
      currentRedemptions?: number;
    };
    capacity?: { maxRedemptions: number | null; redeemedCount: number } | null;
  };
  branch: { id: string; name: string; branchType: string } | null;
  status: RedemptionStatus;
  method: RedemptionMethod | null;
  merchantNotes: string | null;
  offerLimit: number | null;
  offerRedeemed: number;
  offerRemaining: number | null;
  offerCapacityStatus: 'ACTIVE' | 'ENDED';
}

interface Metrics {
  today: number;
  thisWeek: number;
  thisMonth: number;
  topOffer: { offerId: string; title: string; redemptions: number } | null;
  topBranch: {
    branchId: string | null;
    name: string;
    redemptions: number;
  } | null;
}

interface ApiResponse {
  data: RedemptionRow[];
  metrics: Metrics;
  topOffers: {
    offerId: string;
    title: string;
    redemptions: number;
    totalDiscount: number;
    totalSavings: number;
  }[];
  topBranches: {
    branchId: string | null;
    name: string;
    redemptions: number;
    totalSavings: number;
  }[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

async function fetchRedemptions(params: URLSearchParams): Promise<ApiResponse> {
  const res = await fetch(`/api/merchant/redemptions?${params.toString()}`);
  const json = await res.json();
  if (!res.ok)
    throw new Error(json.error?.message ?? "Failed to load redemptions");
  return json;
}

function formatCurrency(n: number | string) {
  return `€${Number(n).toFixed(2)}`;
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString();
}

function methodLabel(r: RedemptionRow) {
  if (r.method) return METHOD_LABELS[r.method];
  if (r.branch?.branchType === "ONLINE" || (!r.branchId && !r.branch))
    return "Online";
  return "In-Store";
}

const STATUS_STYLES: Record<RedemptionStatus, string> = {
  PENDING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  CONFIRMED:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  CANCELLED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  EXPIRED:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  REDEEMED:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

const CAPACITY_STATUS_STYLES: Record<'ACTIVE' | 'ENDED', string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  ENDED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function formatLimit(r: RedemptionRow) {
  if (r.offerLimit == null) return "Unlimited";
  return String(r.offerLimit);
}

function formatRemaining(r: RedemptionRow) {
  if (r.offerRemaining == null) return "Unlimited";
  return String(r.offerRemaining);
}

function formatExpiryDate(iso: string | null) {
  if (!iso) return "No expiry";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function mapErrorCode(code: string) {
  switch (code) {
    case "VOUCHER_NOT_FOUND":
      return {
        title: "Code Not Found",
        message: "The redemption code you entered was not found. Please check and try again.",
      };
    case "ALREADY_REDEEMED":
      return {
        title: "Already Redeemed",
        message: "This code has already been redeemed and cannot be used again.",
      };
    case "VOUCHER_EXPIRED":
    case "VOUCHER_NOT_STARTED":
      return {
        title: "Expired",
        message: "This voucher code has expired or is not yet valid.",
      };
    case "INVALID_REQUEST":
      return {
        title: "Invalid Code",
        message: "The code provided is invalid. Please check and try again.",
      };
    case "USER_NOT_ELIGIBLE":
    case "COMPANY_NOT_ELIGIBLE":
    case "MERCHANT_NOT_ELIGIBLE":
      return {
        title: "Not Eligible",
        message: "This code is not eligible for redemption at this time.",
      };
    case "RATE_LIMIT_EXCEEDED":
      return {
        title: "Rate Limit Exceeded",
        message: "Too many verification attempts. Please try again later.",
      };
    case "VOUCHER_INACTIVE":
      return {
        title: "Voucher Inactive",
        message: "This voucher is not currently active.",
      };
    case "VOUCHER_USAGE_LIMIT_REACHED":
      return {
        title: "Usage Limit Reached",
        message: "This voucher has reached its maximum redemption limit.",
      };
    case "MERCHANT_ACCESS_DENIED":
      return {
        title: "Access Denied",
        message: "You are not authorized to redeem this offer.",
      };
    case "OFFER_REFERENCE_MISSING":
      return {
        title: "Offer Unavailable",
        message: "The redemption code exists, but the associated offer record is unavailable. Please contact support.",
      };
    case "SUSPICIOUS_ACTIVITY":
      return {
        title: "Suspicious Activity",
        message: "Verification blocked due to suspicious activity.",
      };
    default:
      return {
        title: "Verification Failed",
        message: "An unexpected error occurred. Please try again.",
      };
  }
}

export default function MerchantRedemptionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rejectFor, setRejectFor] = useState<RedemptionRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    voucher: { title: string; merchant: string; expiresAt: string };
  } | null>(null);
  const [verificationError, setVerificationError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [redeemError, setRedeemError] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", "25");
  if (search) params.set("q", search);
  if (status) params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading, error } = useQuery({
    queryKey: ["merchant-redemptions", params.toString()],
    queryFn: () => fetchRedemptions(params),
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      action,
      rejectionReason,
    }: {
      id: string;
      action: "CONFIRM" | "REJECT";
      rejectionReason?: string;
    }) => {
      const res = await fetch(`/api/merchant/redemptions/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, rejectionReason }),
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to update status");
      return json;
    },
    onSuccess: (_json, vars) => {
      queryClient.invalidateQueries({ queryKey: ["merchant-redemptions"] });
      showToast({
        type: "success",
        title:
          vars.action === "CONFIRM"
            ? "Redemption confirmed"
            : "Redemption rejected",
      });
    },
    onError: (e: any) =>
      showToast({ type: "error", title: "Failed", description: e?.message }),
  });

  async function handleRedeem() {
    if (!verificationResult) return;
    setIsRedeeming(true);
    setRedeemError(null);

    try {
      const res = await fetch("/api/merchant/redemptions/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const json = await res.json();

      if (res.ok) {
        setRedeemSuccess(true);
      } else {
        const msg = json.error?.message || "Failed to process redemption";
        setRedeemError({ title: "Redemption Failed", message: msg });
      }
    } catch {
      setRedeemError({
        title: "Redemption Failed",
        message: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsRedeeming(false);
    }
  }

  async function handleVerify() {
    const trimmed = code.trim();
    if (!trimmed) {
      setValidationError("Please enter a redemption code");
      return;
    }
    setValidationError(null);
    setVerificationResult(null);
    setVerificationError(null);
    setRedeemSuccess(false);
    setRedeemError(null);
    setIsVerifying(true);

    try {
      const res = await fetch("/api/vouchers/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json();

      if (json.valid) {
        setVerificationResult(json);
      } else {
        setVerificationError(mapErrorCode(json.error?.code));
      }
    } catch {
      setVerificationError({
        title: "Verification Failed",
        message: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Redemptions"
        description="Track who redeemed your offers, where, and when"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ShoppingBag className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-xs text-muted-foreground">Today</p>
              <p className="text-2xl font-bold">{data?.metrics?.today ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">This Week</p>
              <p className="text-2xl font-bold">
                {data?.metrics?.thisWeek ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Award className="h-8 w-8 text-amber-600" />
            <div>
              <p className="text-xs text-muted-foreground">This Month</p>
              <p className="text-2xl font-bold">
                {data?.metrics?.thisMonth ?? 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <MapPin className="h-8 w-8 text-purple-600" />
            <div>
              <p className="text-xs text-muted-foreground">Top Branch</p>
              <p className="truncate text-sm font-semibold">
                {data?.metrics?.topBranch?.name ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {data?.metrics?.topBranch?.redemptions ?? 0} redemptions
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Voucher Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Redemption Code</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Enter redemption code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleVerify();
                  }}
                  disabled={isVerifying}
                  className="sm:flex-1"
                />
                <Button
                  onClick={handleVerify}
                  disabled={isVerifying || !code.trim()}
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Code"
                  )}
                </Button>
              </div>
              {validationError && (
                <p className="text-xs text-destructive">{validationError}</p>
              )}
            </div>

            {verificationError && (
              <Alert
                variant="error"
                title={verificationError.title}
                description={verificationError.message}
              />
            )}

            {redeemSuccess && (
              <Alert variant="success" title="Reward Redeemed Successfully">
                <p className="mt-2 text-sm">
                  The redemption has been completed and notification emails have been sent.
                </p>
              </Alert>
            )}

            {verificationResult && !redeemSuccess && (
              <>
                <Alert variant="success" title="✓ Code Valid">
                  <div className="mt-2 space-y-1 text-sm">
                    <p>
                      <strong>Voucher:</strong>{" "}
                      {verificationResult.voucher.title}
                    </p>
                    <p>
                      <strong>Merchant:</strong>{" "}
                      {verificationResult.voucher.merchant}
                    </p>
                    <p>
                      <strong>Expires:</strong>{" "}
                      {formatExpiryDate(verificationResult.voucher.expiresAt)}
                    </p>
                    <p>
                      <strong>Status:</strong> Eligible for Redemption
                    </p>
                  </div>
                </Alert>
                <Button
                  onClick={handleRedeem}
                  disabled={isRedeeming}
                  className="w-full sm:w-auto"
                >
                  {isRedeeming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Marking...
                    </>
                  ) : (
                    "Mark Redeemed"
                  )}
                </Button>
                {redeemError && (
                  <Alert
                    variant="error"
                    title={redeemError.title}
                    description={redeemError.message}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Performing Offers</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topOffers && data.topOffers.length > 0 ? (
              <ul className="space-y-2">
                {data.topOffers.map((o, i) => (
                  <li
                    key={o.offerId}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span className="truncate">
                      <strong>#{i + 1}</strong> {o.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {o.redemptions} redemptions ·{" "}
                      {formatCurrency(o.totalSavings)} saved
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No redemptions yet.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Branches</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topBranches && data.topBranches.length > 0 ? (
              <ul className="space-y-2">
                {data.topBranches.map((b, i) => (
                  <li
                    key={b.branchId ?? "online"}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span className="truncate">
                      <strong>#{i + 1}</strong> {b.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {b.redemptions} redemptions ·{" "}
                      {formatCurrency(b.totalSavings)} saved
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No branch data yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Redemptions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search employee / company / code…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-7"
              />
            </div>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setStatus("");
                setFrom("");
                setTo("");
                setPage(1);
              }}
            >
              Reset
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">
              Failed to load redemptions.
            </p>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Receipt className="h-5 w-5 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium">No offer redemptions found</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {search || status || from || to
                  ? "No redemptions match the current filters. Try adjusting your search or clearing filters."
                  : "Once employees redeem your offers, they will appear here."}
              </p>
              {(search || status || from || to) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => {
                    setSearch("");
                    setStatus("");
                    setFrom("");
                    setTo("");
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="p-2">Code</th>
                      <th className="p-2">Employee</th>
                      <th className="p-2">Company</th>
                      <th className="p-2">Offer</th>
                      <th className="p-2">Branch</th>
                      <th className="p-2">Method</th>
                      <th className="p-2 text-right">Limit</th>
                      <th className="p-2 text-right">Redeemed</th>
                      <th className="p-2 text-right">Remaining</th>
                      <th className="p-2">Offer Status</th>
                      <th className="p-2">Status</th>
                      <th className="p-2 text-right">Discount</th>
                      <th className="p-2 text-right">Savings</th>
                      <th className="p-2">Date</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((r) => (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="p-2 font-mono text-xs">
                          {r.redemptionCode}
                        </td>
                        <td className="p-2">
                          <div>
                            <p className="font-medium">
                              {r.employee.firstName} {r.employee.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {r.employee.email}
                            </p>
                          </div>
                        </td>
                        <td className="p-2">{r.company.name}</td>
                        <td className="p-2">
                          <Link
                            href={`/merchant/offers/${r.offer.id}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {r.offer.title} <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                        <td className="p-2">{r.branch?.name ?? "—"}</td>
                        <td className="p-2">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {methodLabel(r)}
                          </span>
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatLimit(r)}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {r.offerRedeemed}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {formatRemaining(r)}
                        </td>
                        <td className="p-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CAPACITY_STATUS_STYLES[r.offerCapacityStatus]}`}
                            title={
                              r.offerCapacityStatus === 'ENDED'
                                ? 'Redemption limit reached'
                                : 'Offer is active and redeemable'
                            }
                          >
                            {r.offerCapacityStatus === 'ENDED' ? 'Ended' : 'Active'}
                          </span>
                        </td>
                        <td className="p-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(r.discountAmount)}
                        </td>
                        <td className="p-2 text-right">
                          {formatCurrency(r.savingsAmount)}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {formatDateTime(r.redeemedAt)}
                        </td>
                        <td className="p-2">
                          {r.status === "PENDING" ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-green-700 hover:bg-green-50"
                                onClick={() =>
                                  updateStatus.mutate({
                                    id: r.id,
                                    action: "CONFIRM",
                                  })
                                }
                                disabled={updateStatus.isPending}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  setRejectFor(r);
                                  setRejectReason("");
                                }}
                                disabled={updateStatus.isPending}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-xs text-muted-foreground">
                  Showing {(page - 1) * 25 + 1}–
                  {Math.min(page * 25, data.meta.total)} of {data.meta.total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage((p) => Math.min(data.meta.totalPages, p + 1))
                    }
                    disabled={page >= data.meta.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!rejectFor}
        title="Reject Redemption"
        message={
          rejectFor
            ? `Reject redemption for ${rejectFor.employee.firstName} ${rejectFor.employee.lastName} on "${rejectFor.offer.title}"?`
            : ""
        }
        confirmLabel="Reject"
        variant="destructive"
        loading={updateStatus.isPending}
        onConfirm={async () => {
          if (!rejectFor || !rejectReason.trim()) {
            showToast({ type: "error", title: "A reason is required" });
            return;
          }
          try {
            await updateStatus.mutateAsync({
              id: rejectFor.id,
              action: "REJECT",
              rejectionReason: rejectReason.trim(),
            });
            setRejectFor(null);
            setRejectReason("");
          } catch {
            // toast already shown
          }
        }}
        onCancel={() => {
          setRejectFor(null);
          setRejectReason("");
        }}
      >
        {rejectFor && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium">
              Rejection reason *
            </label>
            <textarea
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why…"
              required
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
