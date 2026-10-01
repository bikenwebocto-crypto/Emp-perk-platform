"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { Plus, AlertTriangle } from "lucide-react";
import { PRIORITY_STYLES } from "@/features/complaints/constants";

interface Complaint {
  id: string;
  complaintType: string;
  category: string | null;
  status: string;
  priority: string;
  createdAt: string;
  offer: { id: string; title: string };
  merchant: { id: string; businessName: string };
  employee: { id: string; firstName: string; lastName: string } | null;
}

interface ComplaintsResponse {
  success: boolean;
  data: Complaint[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_FILTERS = [
  { value: "", label: "All Statuses" },
  { value: "OPEN", label: "Open" },
  { value: "UNDER_REVIEW", label: "Under Review" },
  { value: "CLARIFICATION_REQ", label: "Clarification Required" },
  { value: "ESCALATED", label: "Escalated" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "REJECTED", label: "Rejected" },
];

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-800",
  CLARIFICATION_REQ: "bg-purple-100 text-purple-800",
  ESCALATED: "bg-orange-100 text-orange-800",
  RESOLVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

const CATEGORY_LABELS: Record<string, string> = {
  BILLING: "Billing",
  TECHNICAL: "Technical",
  ACCOUNT: "Account",
  OTHER: "Other",
};

export default function CompanyComplaintsPage() {
  const { page, setPage, pageSize, resetPage } = useTablePagination({
    defaultPageSize: 10,
  });
  const [statusFilter, setStatusFilter] = useState("");

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (statusFilter) p.set("status", statusFilter);
    return p;
  }, [page, pageSize, statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ["company-complaints", params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/complaints?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to load");
      return json as ComplaintsResponse;
    },
  });

  const complaints = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints"
        description="Complaints filed by your team and by you"
        actions={
          <Link href="/company/complaints/new">
            <Button>
              <Plus className="mr-1 h-4 w-4" /> File Application Support
            </Button>
          </Link>
        }
      />

      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            resetPage();
          }}
        >
          {STATUS_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : complaints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No complaints found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No complaints have been filed yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">Raised By</th>
                  <th className="px-4 py-3">Offer</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() =>
                      (window.location.href = `/company/complaints/${c.id}`)
                    }
                  >
                    <td className="px-4 py-3 font-medium">
                      {c.employee
                        ? `${c.employee.firstName} ${c.employee.lastName}`
                        : "You (Company Admin)"}
                    </td>
                    <td className="px-4 py-3">{c.offer?.title ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.merchant?.businessName ?? "—"}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {c.complaintType?.replace(/_/g, " ").toLowerCase()}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {c.category
                        ? (CATEGORY_LABELS[c.category] ?? c.category)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? ""}`}
                      >
                        {c.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[c.priority] ?? ""}`}
                      >
                        {c.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-muted-foreground">
                Page {page} of {meta.totalPages} ({meta.total} total)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() =>
                    setPage((p) => Math.min(meta.totalPages, p + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}