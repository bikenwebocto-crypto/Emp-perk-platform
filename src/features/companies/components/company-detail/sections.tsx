"use client";

import {
  Activity as ActivityIcon,
  AlertCircle,
  Building2,
  CheckCircle2,
  Edit3,
  KeyRound,
  Mail,
  Power,
  PowerOff,
  ShieldAlert,
  Star,
  UserCog,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CompanyAdminSummary } from "@/types";
import { TableActionButton } from "./primitives";
import type { CityReadiness, CompanyDetailPermissions, ImportPreview } from "./types";

export function CityReadinessBanner({ readiness }: { readiness: CityReadiness }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-medium">City readiness not met</p>
        <p className="mt-1 text-xs">{readiness.message}</p>
        <p className="mt-1 text-xs">
          Mark Active is disabled until{" "}
          {readiness.required.minActiveMerchants} active merchants and{" "}
          {readiness.required.minUniqueCategories} unique categories are
          present in {readiness.city || "this city"}.
        </p>
      </div>
    </div>
  );
}

export function CompanyHeaderCard({ company }: { company: any }) {
  const billing = company.billing;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-bold">{company.name}</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Contact:</span>{" "}
              {company.email}
            </p>
          </div>
          <StatusBadge status={company.status} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            <strong className="text-foreground">{company._count?.employees ?? 0}</strong>{" "}
            employees
          </span>
          {company.city && <span>· {company.city}</span>}
          {company.approvedAt && (
            <span>
              · Activated {new Date(company.approvedAt).toLocaleDateString()}
            </span>
          )}
          {billing?.renewalDate && (
            <span>
              · Renews {new Date(billing.renewalDate).toLocaleDateString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface CompanyInfoCardProps {
  company: any;
  canManageBilling: boolean;
  onBillingStatusChange: (status: string) => void;
  onSendBillingReminder: () => void;
  sendingReminder: boolean;
}

export function CompanyInfoCard({
  company,
  canManageBilling,
  onBillingStatusChange,
  onSendBillingReminder,
  sendingReminder,
}: CompanyInfoCardProps) {
  const billing = company.billing;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" />
          Company Information
          <span className="text-xs font-normal text-muted-foreground">
            (organization contact details — not the login email)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Company Name</p>
            <p className="font-medium">{company.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Contact Email</p>
            <p className="flex items-center gap-1 font-medium">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              {company.email}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <div>
              <StatusBadge status={company.status} />
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p className="font-medium">{company.phone || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Website</p>
            <p className="font-medium">
              {company.website ? (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {company.website}
                </a>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Industry</p>
            <p className="font-medium">{company.industry || "—"}</p>
          </div>
          <div className="md:col-span-3">
            <p className="text-muted-foreground">Address</p>
            <p className="font-medium">
              {[
                company.addressLine1,
                company.addressLine2,
                [company.city, company.state].filter(Boolean).join(", "),
                company.postalCode,
                company.country,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Billing Information
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {canManageBilling ? (
                <select
                  className="rounded border px-2 py-1 text-sm"
                  value={billing?.billingStatus ?? "ACTIVE"}
                  onChange={(e) => onBillingStatusChange(e.target.value)}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INVOICE_OVERDUE">Invoice Overdue</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>
              ) : (
                <StatusBadge status={billing?.billingStatus ?? "ACTIVE"} />
              )}
            </div>
            {canManageBilling && billing?.billingStatus === "INVOICE_OVERDUE" && (
              <Button
                size="sm"
                variant="warning"
                onClick={onSendBillingReminder}
                disabled={sendingReminder}
              >
                <Mail className="mr-1 h-4 w-4" />
                {sendingReminder ? "Sending…" : "Send Reminder"}
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              Plan: <strong>{billing?.plan ?? "—"}</strong>
            </span>
            <span className="text-sm text-muted-foreground">
              Cycle: <strong>{billing?.billingCycle ?? "—"}</strong>
            </span>
            {billing?.billingEmail && (
              <span className="text-sm text-muted-foreground">
                Billing Email: <strong>{billing.billingEmail}</strong>
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Price / Employee</p>
              <p className="font-medium">
                ${Number(billing?.pricePerEmployee ?? 0).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Next Renewal</p>
              <p className="font-medium">
                {billing?.renewalDate
                  ? new Date(billing.renewalDate).toLocaleDateString()
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Trial</p>
              <p className="font-medium">
                {billing?.isTrial
                  ? `Until ${billing.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString() : "—"}`
                  : "No"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Currency</p>
              <p className="font-medium">{billing?.currency ?? "—"}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface PrimaryAdminCardProps {
  primaryAdmin: CompanyAdminSummary | null;
  onAssign: () => void;
}

export function PrimaryAdminCard({ primaryAdmin, onAssign }: PrimaryAdminCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-4 w-4 text-amber-500" />
          Primary Administrator
          <span className="text-xs font-normal text-muted-foreground">
            (owns the company login and dashboard access)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {primaryAdmin ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">
                  {primaryAdmin.firstName} {primaryAdmin.lastName}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="flex items-center gap-1 font-medium">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {primaryAdmin.email}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Role</p>
                <div>
                  <Badge variant="default">OWNER</Badge>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <div>
                  <StatusBadge status={primaryAdmin.status} />
                </div>
              </div>
              <div>
                <p className="text-muted-foreground">Last Login</p>
                <p className="text-xs font-medium">
                  {primaryAdmin.lastLoginAt
                    ? new Date(primaryAdmin.lastLoginAt).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <div className="md:col-span-3">
                <p className="text-muted-foreground">Badge</p>
                <div>
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                    <KeyRound className="h-3 w-3" /> Primary Admin
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">No Active Admin Assigned</p>
                <p className="text-xs">
                  This company has no active administrator. Add an admin to
                  grant access to the company dashboard.
                </p>
              </div>
            </div>
            <Button size="sm" variant="default" onClick={onAssign}>
              <UserPlus className="mr-1 h-4 w-4" /> Assign Primary Admin
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AdministratorsCardProps {
  admins: CompanyAdminSummary[];
  primaryAdminId: string | null;
  permissions: CompanyDetailPermissions;
  busy: boolean;
  onAdd: () => void;
  onEdit: (admin: CompanyAdminSummary) => void;
  onMakePrimary: (admin: CompanyAdminSummary) => void;
  onDisable: (admin: CompanyAdminSummary) => void;
  onReactivate: (admin: CompanyAdminSummary) => void;
}

export function AdministratorsCard({
  admins,
  primaryAdminId,
  permissions,
  busy,
  onAdd,
  onEdit,
  onMakePrimary,
  onDisable,
  onReactivate,
}: AdministratorsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4" />
          Company Administrators
          <span className="text-xs font-normal text-muted-foreground">
            ({admins.length} total · {admins.filter((a) => a.isActive).length}{" "}
            active)
          </span>
        </CardTitle>
        <Button size="sm" onClick={onAdd}>
          <UserPlus className="mr-1 h-4 w-4" /> Add Admin
        </Button>
      </CardHeader>
      <CardContent>
        {admins.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserX className="h-4 w-4" /> No administrators assigned.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Primary Admin Login</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Last Login</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const isPrimary = a.id === primaryAdminId;
                  const isSelf = a.id === permissions.selfAdminId;
                  return (
                    <tr key={a.id} className="border-b">
                      <td className="py-2 pr-3 font-medium">
                        {a.firstName} {a.lastName}
                        {isPrimary && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            <KeyRound className="h-3 w-3" /> Primary
                          </span>
                        )}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{a.email}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={a.role === "OWNER" ? "default" : "secondary"}>
                          {a.role}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {a.lastLoginAt
                          ? new Date(a.lastLoginAt).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1">
                          {permissions.transferPrimary && !isPrimary && a.isActive && (
                            <TableActionButton
                              onClick={() => onMakePrimary(a)}
                              disabled={busy}
                              title="Promote to Primary Admin"
                            >
                              <Star className="mr-1 h-3 w-3" /> Make Primary
                            </TableActionButton>
                          )}
                          <TableActionButton onClick={() => onEdit(a)}>
                            <Edit3 className="mr-1 h-3 w-3" /> Edit
                          </TableActionButton>
                          {a.isActive ? (
                            !isSelf && (
                              <TableActionButton
                                onClick={() => onDisable(a)}
                                disabled={busy}
                                className="text-destructive hover:text-destructive"
                              >
                                <PowerOff className="mr-1 h-3 w-3" /> Disable
                              </TableActionButton>
                            )
                          ) : (
                            <TableActionButton
                              onClick={() => onReactivate(a)}
                              disabled={busy}
                            >
                              <Power className="mr-1 h-3 w-3" /> Reactivate
                            </TableActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface CsvPreviewPanelProps {
  preview: ImportPreview;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CsvPreviewPanel({ preview, onCancel, onConfirm }: CsvPreviewPanelProps) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">CSV Preview</h4>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3 w-3" /> Cancel
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded border bg-card p-2">
          <p className="text-muted-foreground text-xs">Total rows</p>
          <p className="text-lg font-semibold">{preview.totalRows}</p>
        </div>
        <div className="rounded border bg-card p-2">
          <p className="text-muted-foreground text-xs">Valid</p>
          <p className="text-lg font-semibold text-green-700">{preview.validCount}</p>
        </div>
        <div className="rounded border bg-card p-2">
          <p className="text-muted-foreground text-xs">Rejected</p>
          <p className="text-lg font-semibold text-red-700">{preview.invalidCount}</p>
        </div>
      </div>

      {preview.validCount > 0 && (
        <details className="rounded border bg-card p-2 text-sm" open>
          <summary className="cursor-pointer font-medium">
            Valid rows ({preview.validCount})
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-1">Row</th>
                  <th className="p-1">Name</th>
                  <th className="p-1">Email</th>
                  <th className="p-1">Department</th>
                </tr>
              </thead>
              <tbody>
                {preview.validRows.map((r) => (
                  <tr key={`v-${r.rowNumber}`} className="border-b">
                    <td className="p-1">{r.rowNumber}</td>
                    <td className="p-1">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="p-1">{r.email}</td>
                    <td className="p-1">{r.department ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {preview.invalidCount > 0 && (
        <details className="rounded border bg-card p-2 text-sm" open>
          <summary className="cursor-pointer font-medium text-red-700">
            Invalid rows ({preview.invalidCount})
          </summary>
          <div className="mt-2 max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-1">Row</th>
                  <th className="p-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {preview.invalidRows.map((r) => (
                  <tr key={`i-${r.rowNumber}`} className="border-b">
                    <td className="p-1">{r.rowNumber}</td>
                    <td className="p-1 text-red-700">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={preview.validCount === 0}>
          <CheckCircle2 className="mr-1 h-4 w-4" />
          Confirm Import ({preview.validCount})
        </Button>
      </div>
    </div>
  );
}

export function ActivityLogCard({ history }: { history: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ActivityIcon className="h-4 w-4" />
          Activity Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No status changes recorded.</p>
        ) : (
          <div className="space-y-2">
            {history.map((h: any) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded border px-4 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge status={h.fromStatus ?? "—"} />
                  <span>→</span>
                  <StatusBadge status={h.toStatus} />
                  {h.reason && (
                    <span className="text-muted-foreground">— {h.reason}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {h.changedByType} · {new Date(h.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
