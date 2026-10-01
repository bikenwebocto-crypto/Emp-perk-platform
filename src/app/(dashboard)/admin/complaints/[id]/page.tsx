"use client";

import { use, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { showToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Link2,
  Clock,
  XCircle,
  CheckCircle2,
  Ban,
} from "lucide-react";
import { PRIORITY_STYLES } from "@/features/complaints/constants";

interface ComplaintAction {
  id: string;
  actionType: string;
  note: string | null;
  createdAt: string;
}

interface ComplaintDetail {
  id: string;
  complaintType: string;
  status: string;
  priority: string;
  description: string;
  evidenceUrls: string[] | null;
  escalationNote: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  offer: { id: string; title: string };
  merchant: { id: string; businessName: string };
  employee: { id: string; firstName: string; lastName: string };
  company: { id: string; name: string };
  actions: ComplaintAction[];
  escalations?: { status: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  CLARIFICATION_REQ: "bg-purple-100 text-purple-800",
  ESCALATED: "bg-orange-100 text-orange-800",
  RESOLVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Complaint Filed",
  REVIEW_STARTED: "Review Started",
  CLARIFICATION_REQ: "Clarification Requested",
  EMPLOYEE_RESPONDED: "Employee Responded",
  ESCALATED: "Escalated to Admin",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  MERCHANT_RESPONDED: "Merchant Responded",
};

export default function AdminComplaintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [resolutionError, setResolutionError] = useState(false);
  const [rejectError, setRejectError] = useState(false);
  const resolutionRef = useRef<HTMLTextAreaElement>(null);
  const rejectRef = useRef<HTMLTextAreaElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-complaint", id],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/admin/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load");
      return json as { success: boolean; data: ComplaintDetail };
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (body: { status: string; resolutionNotes: string }) => {
      const res = await fetch(`/api/complaints/admin/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to update");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-complaint", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-complaints"] });
      setResolutionNotes("");
      setRejectReason("");
      showToast({
        type: "success",
        title: "Updated",
        description: "Complaint status has been updated.",
      });
    },
    onError: (e: Error) =>
      showToast({ type: "error", title: "Failed", description: e.message }),
  });

  function handleResolve() {
    setRejectError(false);
    if (!resolutionNotes.trim()) {
      setResolutionError(true);
      resolutionRef.current?.focus();
      resolutionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      showToast({
        type: "error",
        title: "Required",
        description: "Please provide resolution notes.",
      });
      return;
    }
    setResolutionError(false);
    resolveMutation.mutate({
      status: "RESOLVED",
      resolutionNotes: resolutionNotes.trim(),
    });
  }

  function handleReject() {
    setResolutionError(false);
    if (!rejectReason.trim()) {
      setRejectError(true);
      rejectRef.current?.focus();
      rejectRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      showToast({
        type: "error",
        title: "Required",
        description: "Please provide a reason for rejection.",
      });
      return;
    }
    setRejectError(false);
    resolveMutation.mutate({
      status: "REJECTED",
      resolutionNotes: rejectReason.trim(),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <XCircle className="h-10 w-10 text-muted-foreground" />
        <p className="mt-4 text-lg font-medium">Complaint not found</p>
        <Link href="/admin/complaints" className="mt-4">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>
      </div>
    );
  }

  const c = data.data;
  const canResolve = c.status === "UNDER_REVIEW" || c.status === "ESCALATED";
  const isTerminal = c.status === "RESOLVED" || c.status === "REJECTED";

  return (
    <div className="space-y-6">
      <Link
        href="/admin/complaints"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Complaints
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Complaint Details</span>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[c.priority]}`}
              >
                {c.priority}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status]}`}
              >
                {c.status.replace(/_/g, " ")}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Employee
              </p>
              <p className="mt-0.5 text-sm font-medium">
                {c.employee?.firstName} {c.employee?.lastName}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Company
              </p>
              <p className="mt-0.5 text-sm font-medium">
                {c.company?.name ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Complaint Type
              </p>
              <p className="mt-0.5 text-sm capitalize">
                {c.complaintType.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Offer</p>
              <p className="mt-0.5 text-sm font-medium">
                {c.offer?.title ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Merchant
              </p>
              <p className="mt-0.5 text-sm font-medium">
                {c.merchant?.businessName ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Submitted
              </p>
              <p className="mt-0.5 text-sm">
                {new Date(c.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Description
            </p>
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/30 p-3 text-sm">
              {c.description}
            </p>
          </div>

          {c.evidenceUrls && c.evidenceUrls.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Evidence
              </p>
              <div className="mt-1 space-y-1">
                {c.evidenceUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Link2 className="h-3 w-3" /> {url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {c.escalationNote && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-medium text-orange-700">
                Escalation Note
              </p>
              <p className="mt-1 text-sm text-orange-800">{c.escalationNote}</p>
            </div>
          )}

          {c.resolutionNotes && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs font-medium text-green-700">
                Resolution Notes
              </p>
              <p className="mt-1 text-sm text-green-800">{c.resolutionNotes}</p>
            </div>
          )}

          {c.resolvedAt && (
            <p className="flex items-center gap-1 text-xs text-green-700">
              <Clock className="h-3 w-3" /> Resolved at{" "}
              {new Date(c.resolvedAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {canResolve && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Resolution Notes
              </label>
              <textarea
                ref={resolutionRef}
                rows={3}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  resolutionError
                    ? "border-red-500 ring-2 ring-red-500 animate-pulse"
                    : ""
                }`}
                value={resolutionNotes}
                onChange={(e) => {
                  setResolutionNotes(e.target.value);
                  if (resolutionError) setResolutionError(false);
                }}
                placeholder="Describe the resolution..."
              />
              <p
                className={`mt-1 text-xs ${
                  resolutionError
                    ? "font-medium text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                {resolutionError
                  ? "Resolution notes are required to mark this complaint as Resolved."
                  : "Used when marking this complaint as Resolved."}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Rejection Reason
              </label>
              <textarea
                ref={rejectRef}
                rows={3}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  rejectError
                    ? "border-red-500 ring-2 ring-red-500 animate-pulse"
                    : ""
                }`}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError(false);
                }}
                placeholder="Explain why this complaint is being rejected..."
              />
              <p
                className={`mt-1 text-xs ${
                  rejectError
                    ? "font-medium text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                {rejectError
                  ? "A rejection reason is required."
                  : "Used when marking this complaint as Rejected."}
              </p>
            </div>

            {canResolve && c.escalations?.some((e) => e.status === "PENDING") && (
              <p className="text-xs text-muted-foreground">
                This complaint was escalated by a company admin. Resolving or
                rejecting it will notify them of the outcome.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="destructive"
                disabled={resolveMutation.isPending}
                onClick={handleReject}
              >
                {resolveMutation.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Ban className="mr-1 h-4 w-4" />
                )}
                Reject
              </Button>
              <Button
                variant="default"
                disabled={resolveMutation.isPending}
                onClick={handleResolve}
              >
                {resolveMutation.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                )}
                Resolve
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {c.status === "CLARIFICATION_REQ" && (
        <Card className="border-muted-foreground/20 bg-muted/20">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Waiting on the employee to respond. This complaint returns to Under
            Review once they reply.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Actions Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!c.actions || c.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No actions recorded yet.
            </p>
          ) : (
            <div className="relative space-y-0">
              {c.actions.map((action, i) => (
                <div key={action.id} className="flex gap-4 pb-6 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                        i === c.actions.length - 1
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30 bg-background text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </div>
                    {i < c.actions.length - 1 && (
                      <div className="mt-1 w-px flex-1 bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm font-medium">
                      {ACTION_LABELS[action.actionType] ??
                        action.actionType.replace(/_/g, " ")}
                    </p>
                    {action.note && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {action.note}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(action.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
