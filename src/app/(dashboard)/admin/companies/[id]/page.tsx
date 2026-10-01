"use client";

import { useCallback, useMemo, useState, useEffect, type ComponentPropsWithoutRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { showToast } from "@/hooks/use-toast";
import {
  useCompanyDetail,
  useUpdateCompanyDetail,
  useDeleteCompany,
  useAddCompanyAdmin,
  useUpdateCompanyAdmin,
} from "@/hooks/queries/use-companies";
import {
  useEmployees,
  employeeKeys,
} from "@/hooks/queries/use-employees";
import {
  useDeactivateCompanyEmployee,
  useReactivateCompanyEmployee,
} from "@/hooks/queries/use-company-employees";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { DataTable } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  ArrowLeft,
  CheckCircle,
  Pause,
  Ban,
  XCircle,
  Send,
  Mail,
  Download,
  CheckCircle2,
  X,
  FileSpreadsheet,
  AlertCircle,
  UserCog,
  UserX,
  Building2,
  Users,
  Activity as ActivityIcon,
  KeyRound,
  UserPlus,
  Edit3,
  PowerOff,
  Power,
  Star,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import type { ColumnDef, CompanyAdminSummary } from "@/types";
import { CSVUploadDropzone } from "@/features/csv-uploads/components/csv-upload-dropzone";

interface CityReadiness {
  city: string | null;
  activeMerchants: number;
  uniqueCategories: number;
  required: { minActiveMerchants: number; minUniqueCategories: number };
  ready: boolean;
  message: string;
}

interface ImportPreview {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  bodyHash: string;
  validRows: Array<{
    rowNumber: number;
    firstName: string;
    lastName: string;
    email: string;
    department: string | null;
  }>;
  invalidRows: Array<{
    rowNumber: number;
    reason: string;
    raw: Record<string, string>;
  }>;
}

interface AdminFormState {
  firstName: string;
  lastName: string;
  email: string;
  role: "OWNER" | "MEMBER";
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY_ADMIN_FORM: AdminFormState = {
  firstName: "",
  lastName: "",
  email: "",
  role: "MEMBER",
  status: "ACTIVE",
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ open, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

type TableActionButtonProps = Omit<ComponentPropsWithoutRef<typeof Button>, 'size'>;

function TableActionButton({ variant = 'ghost', ...props }: TableActionButtonProps) {
  return <Button size="sm" variant={variant} {...props} />;
}

async function fetchReadiness(id: string): Promise<CityReadiness> {
  const res = await fetch(`/api/admin/companies/${id}/city-readiness`);
  const json = await res.json();
  if (!res.ok)
    throw new Error(json.error?.message ?? "Failed to load readiness");
  return json.data;
}

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const queryClient = useQueryClient();

  const { data, isLoading } = useCompanyDetail(id);
  const updateDetail = useUpdateCompanyDetail();
  const deleteCompany = useDeleteCompany();

  const { data: readiness } = useQuery({
    queryKey: ["company-readiness", id],
    queryFn: () => fetchReadiness(id),
    enabled: !!id,
  });

  const company = data?.data;

  const [adminNote, setAdminNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string>("");

  // CSV preview state
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [preview, setPreview] = useState<{
    csv: string;
    data: ImportPreview;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("ALL");
  const {
    page: empPage,
    setPage: setEmpPage,
    pageSize: empPageSize,
  } = useTablePagination({ defaultPageSize: 10 });

  const { data: empData } = useEmployees({
    companyId: id,
    status: employeeStatusFilter !== "ALL" ? employeeStatusFilter : undefined,
    q: employeeSearch || undefined,
    page: empPage,
    pageSize: empPageSize,
  });

  const employees = empData?.data ?? [];
  const empMeta = empData?.meta;

  // Admin management state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminEditing, setAdminEditing] = useState<CompanyAdminSummary | null>(
    null,
  );
  const [adminForm, setAdminForm] = useState<AdminFormState>(EMPTY_ADMIN_FORM);
  const [adminFormErrors, setAdminFormErrors] = useState<
    Partial<Record<keyof AdminFormState, string>>
  >({});
  const [transferPromptOpen, setTransferPromptOpen] = useState(false);
  const [pendingDisableId, setPendingDisableId] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState<string>("");
  const [newPasswordForAdmin, setNewPasswordForAdmin] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const addCompanyAdmin = useAddCompanyAdmin(id);
  const updateCompanyAdmin = useUpdateCompanyAdmin(id);
  const deactivateEmployee = useDeactivateCompanyEmployee();
  const reactivateEmployee = useReactivateCompanyEmployee();

  const handleDeactivateEmployee = useCallback(
    (employeeId: string) => {
      deactivateEmployee.mutate(
        { id: employeeId },
        {
          onSuccess: () => {
            showToast({ type: 'success', title: 'Employee deactivated' });
            queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
          },
          onError: (err: Error) =>
            showToast({ type: 'error', title: 'Deactivate failed', description: err.message }),
        },
      );
    },
    [deactivateEmployee, queryClient],
  );

  const handleReactivateEmployee = useCallback(
    (employeeId: string) => {
      reactivateEmployee.mutate(
        { id: employeeId },
        {
          onSuccess: () => {
            showToast({ type: 'success', title: 'Employee reactivated' });
            queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
          },
          onError: (err: Error) =>
            showToast({ type: 'error', title: 'Reactivate failed', description: err.message }),
        },
      );
    },
    [reactivateEmployee, queryClient],
  );

  const employeeColumns: ColumnDef<any>[] = [
    {
      key: "name",
      header: "Employee",
      render: (e: any) => (
        <span className="font-medium">
          {e.firstName} {e.lastName}
        </span>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (e: any) => <span className="font-mono">{e?.account?.email}</span>,
    },
    {
      key: "department",
      header: "Department",
      render: (e: any) => <span className="font-momo"> {e.department}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (e: any) => <StatusBadge status={e.status} />,
    },
    {
      key: "actions",
      header: "Actions",
      render: (e: any) =>
        e.status === "ACTIVE" ? (
          <TableActionButton
            variant="destructive"
            onClick={() => handleDeactivateEmployee(e.id)}
            title="Deactivate"
          >
            <PowerOff className="mr-1 h-3 w-3" /> Deactivate
          </TableActionButton>
        ) : (
          <TableActionButton
            variant="success"
            onClick={() => handleReactivateEmployee(e.id)}
            title="Activate"
          >
            <Power className="mr-1 h-3 w-3" /> Activate
          </TableActionButton>
        ),
    },
  ];

  const admins: CompanyAdminSummary[] = useMemo(
    () => (company?.admins as CompanyAdminSummary[] | undefined) ?? [],
    [company?.admins],
  );
  const primaryAdmin: CompanyAdminSummary | null =
    (company?.primaryAdmin as CompanyAdminSummary | null) ?? null;

  const handleStatusChange = useCallback((status: string) => {
    setConfirmAction(status);
    setConfirmOpen(true);
  }, []);

  const confirmStatusChange = useCallback(() => {
    if (!confirmAction) return;
    updateDetail.mutate(
      { id, status: confirmAction },
      {
        onSuccess: (res: any) => {
          showToast({
            type: "success",
            title: res.message ?? `Company ${confirmAction.toLowerCase()}`,
          });
          setConfirmOpen(false);
          setConfirmAction("");
          queryClient.invalidateQueries({
            queryKey: ["company-readiness", id],
          });
        },
        onError: (err: Error) => {
          showToast({
            type: "error",
            title: "Update failed",
            description: err.message,
          });
          setConfirmOpen(false);
          setConfirmAction("");
        },
      },
    );
  }, [id, confirmAction, updateDetail, queryClient]);

  const handleSaveNote = useCallback(() => {
    if (!adminNote.trim() && !company?.adminNote) return;
    updateDetail.mutate(
      { id, adminNote },
      {
        onSuccess: () => {
          showToast({ type: "success", title: "Admin note saved" });
          setNoteSaved(true);
          setTimeout(() => setNoteSaved(false), 3000);
        },
        onError: (err: Error) =>
          showToast({
            type: "error",
            title: "Failed to save note",
            description: err.message,
          }),
      },
    );
  }, [id, adminNote, updateDetail, company]);

  const handleBillingStatusChange = useCallback(
    (billingStatus: string) => {
      updateDetail.mutate(
        { id, billingStatus },
        {
          onSuccess: () => {
            showToast({
              type: "success",
              title: `Billing status updated to ${billingStatus}`,
            });
            queryClient.invalidateQueries({
              queryKey: ["company-readiness", id],
            });
          },
          onError: (err: Error) =>
            showToast({
              type: "error",
              title: "Billing update failed",
              description: err.message,
            }),
        },
      );
    },
    [id, updateDetail, queryClient],
  );

  // CSV preview/confirm flow --------------------------------------
  const handleCSVSelected = useCallback(
    async (file: File) => {
      setPreviewLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/admin/companies/${id}/csv-preview`, {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? "Preview failed");

        const csv = await file.text();
        setPreview({ csv, data: json.data });
      } catch (err: any) {
        showToast({
          type: "error",
          title: "Preview failed",
          description: err.message,
        });
      } finally {
        setPreviewLoading(false);
      }
    },
    [id],
  );

  const confirmImport = useMutation({
    mutationFn: async () => {
      if (!preview) throw new Error("No preview to confirm");
      const res = await fetch(`/api/admin/companies/${id}/csv-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: preview.csv,
          bodyHash: preview.data.bodyHash,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Import failed");
      return json;
    },
    onSuccess: (json) => {
      showToast({
        type: "success",
        title: "Import complete",
        description: json.message ?? `${json.data?.imported} imported`,
      });
      setPreview(null);
      setShowCSVUpload(false);
      setConfirmImportOpen(false);
      queryClient.invalidateQueries({ queryKey: ["employees", id] });
    },
    onError: (err: Error) =>
      showToast({
        type: "error",
        title: "Import failed",
        description: err.message,
      }),
  });

  const sendLaunchPack = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/companies/${id}/launch-pack`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to send launch pack");
      return json;
    },
    onSuccess: (json) => {
      showToast({
        type: "success",
        title: "Launch pack sent",
        description: `${json.data?.adminCount ?? 0} admins, ${json.data?.employeeCount ?? 0} employees notified`,
      });
    },
    onError: (err: Error) =>
      showToast({ type: "error", title: "Failed", description: err.message }),
  });

  const sendBillingReminder = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/companies/${id}/billing-reminder`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error?.message ?? "Failed to send reminder");
      return json;
    },
    onSuccess: () =>
      showToast({ type: "success", title: "Billing reminder sent" }),
    onError: (err: Error) =>
      showToast({ type: "error", title: "Failed", description: err.message }),
  });

  // ----- Admin management handlers --------------------------------

  const openAddAdminModal = useCallback(() => {
    setAdminEditing(null);
    setAdminForm(EMPTY_ADMIN_FORM);
    setAdminFormErrors({});
    setAdminModalOpen(true);
  }, []);

  const openEditAdminModal = useCallback((a: CompanyAdminSummary) => {
    setAdminEditing(a);
    setAdminForm({
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      role: a.role,
      status: a.status,
    });
    setAdminFormErrors({});
    setAdminModalOpen(true);
  }, []);

  const closeAdminModal = useCallback(() => {
    setAdminModalOpen(false);
    setAdminEditing(null);
    setAdminForm(EMPTY_ADMIN_FORM);
    setAdminFormErrors({});
  }, []);

  const validateAdminForm = useCallback((): boolean => {
    const errs: Partial<Record<keyof AdminFormState, string>> = {};
    if (!adminForm.firstName.trim()) errs.firstName = "First name is required";
    if (!adminForm.lastName.trim()) errs.lastName = "Last name is required";
    if (!adminForm.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminForm.email))
      errs.email = "Invalid email address";
    setAdminFormErrors(errs);
    return Object.keys(errs).length === 0;
  }, [adminForm]);

  const submitAdminForm = useCallback(() => {
    if (!validateAdminForm()) return;
    if (adminEditing) {
      // Edit flow
      updateCompanyAdmin.mutate(
        {
          adminId: adminEditing.id,
          firstName: adminForm.firstName.trim(),
          lastName: adminForm.lastName.trim(),
          email: adminForm.email.trim().toLowerCase(),
          status: adminForm.status,
        },
        {
          onSuccess: () => {
            showToast({ type: "success", title: "Admin updated" });
            closeAdminModal();
          },
          onError: (err: Error) =>
            showToast({
              type: "error",
              title: "Failed to update admin",
              description: err.message,
            }),
        },
      );
    } else {
      // Add flow
      addCompanyAdmin.mutate(
        {
          firstName: adminForm.firstName.trim(),
          lastName: adminForm.lastName.trim(),
          email: adminForm.email.trim().toLowerCase(),
          role: adminForm.role,
          status: adminForm.status,
        },
        {
          onSuccess: (res: any) => {
            showToast({
              type: "success",
              title: "Admin created",
              description: "Share the temporary password securely.",
            });
            setNewPasswordForAdmin({
              email: adminForm.email.trim().toLowerCase(),
              password: res?.data?.tempPassword ?? "",
            });
            closeAdminModal();
          },
          onError: (err: Error) =>
            showToast({
              type: "error",
              title: "Failed to create admin",
              description: err.message,
            }),
        },
      );
    }
  }, [
    adminEditing,
    adminForm,
    addCompanyAdmin,
    updateCompanyAdmin,
    closeAdminModal,
    validateAdminForm,
  ]);

  const makePrimary = useCallback(
    (admin: CompanyAdminSummary) => {
      if (admin.isPrimary) {
        showToast({ type: "info", title: "Admin is already primary" });
        return;
      }
      updateCompanyAdmin.mutate(
        { adminId: admin.id, makePrimary: true },
        {
          onSuccess: () => {
            showToast({
              type: "success",
              title: `${admin.firstName} ${admin.lastName} is now the primary admin`,
            });
          },
          onError: (err: Error) =>
            showToast({
              type: "error",
              title: "Failed to transfer primary",
              description: err.message,
            }),
        },
      );
    },
    [updateCompanyAdmin],
  );

  const attemptDisable = useCallback(
    (admin: CompanyAdminSummary) => {
      if (!admin.isActive) {
        showToast({ type: "info", title: "Admin is already inactive" });
        return;
      }
      if (admin.isPrimary) {
        // Find other active admins to transfer primary to
        const others = admins.filter((a) => a.id !== admin.id && a.isActive);
        if (others.length === 0) {
          showToast({
            type: "error",
            title: "Cannot disable",
            description:
              "Each company must have at least one active primary administrator.",
          });
          return;
        }
        setPendingDisableId(admin.id);
        setTransferTargetId(others[0]?.id ?? "");
        setTransferPromptOpen(true);
        return;
      }
      updateCompanyAdmin.mutate(
        { adminId: admin.id, status: "INACTIVE" },
        {
          onSuccess: () => {
            showToast({
              type: "success",
              title: `${admin.firstName} ${admin.lastName} disabled`,
            });
          },
          onError: (err: Error) =>
            showToast({
              type: "error",
              title: "Failed to disable admin",
              description: err.message,
            }),
        },
      );
    },
    [admins, updateCompanyAdmin],
  );

  const confirmTransferAndDisable = useCallback(() => {
    if (!pendingDisableId) return;
    if (!transferTargetId) {
      showToast({
        type: "error",
        title: "Select a new primary admin first",
      });
      return;
    }
    // Transfer primary first, then disable
    updateCompanyAdmin.mutate(
      { adminId: transferTargetId, makePrimary: true },
      {
        onSuccess: () => {
          updateCompanyAdmin.mutate(
            { adminId: pendingDisableId, status: "INACTIVE" },
            {
              onSuccess: () => {
                showToast({
                  type: "success",
                  title: "Primary transferred and admin disabled",
                });
                setTransferPromptOpen(false);
                setPendingDisableId(null);
                setTransferTargetId("");
              },
              onError: (err: Error) =>
                showToast({
                  type: "error",
                  title: "Failed to disable admin",
                  description: err.message,
                }),
            },
          );
        },
        onError: (err: Error) =>
          showToast({
            type: "error",
            title: "Failed to transfer primary",
            description: err.message,
          }),
      },
    );
  }, [pendingDisableId, transferTargetId, updateCompanyAdmin]);

  const reactivate = useCallback(
    (admin: CompanyAdminSummary) => {
      updateCompanyAdmin.mutate(
        { adminId: admin.id, status: "ACTIVE" },
        {
          onSuccess: () => {
            showToast({
              type: "success",
              title: `${admin.firstName} ${admin.lastName} reactivated`,
            });
          },
          onError: (err: Error) =>
            showToast({
              type: "error",
              title: "Failed to reactivate admin",
              description: err.message,
            }),
        },
      );
    },
    [updateCompanyAdmin],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center text-muted-foreground py-12">
        Company not found
      </div>
    );
  }

  const billing = company.billing;
  const history = company.statusHistory ?? [];
  const enrolledCount = company._count?.employees ?? 0;
  const cityReadiness = readiness as CityReadiness | undefined;
  const markActiveDisabled =
    !cityReadiness?.ready && company.status !== "ACTIVE";

  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description={`Company Contact: ${company.email} · Created ${new Date(company.createdAt).toLocaleDateString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/admin/companies")}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </div>
        }
      />

      {/* City Readiness Gate */}
      {readiness && !readiness.ready && (
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
      )}

      {/* Company Header */}
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
              <strong className="text-foreground">{enrolledCount}</strong>{" "}
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

      {/* SECTION 1: Company Information (Contact) */}
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
                <select
                  className="rounded border px-2 py-1 text-sm"
                  value={billing?.billingStatus ?? "ACTIVE"}
                  onChange={(e) => handleBillingStatusChange(e.target.value)}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INVOICE_OVERDUE">Invoice Overdue</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>
              </div>
              {billing?.billingStatus === "INVOICE_OVERDUE" && (
                <Button
                  size="sm"
                  variant="warning"
                  onClick={() => sendBillingReminder.mutate()}
                  disabled={sendBillingReminder.isPending}
                >
                  <Mail className="mr-1 h-4 w-4" />
                  {sendBillingReminder.isPending ? "Sending…" : "Send Reminder"}
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

      {/* SECTION 2: Primary Administrator (the login owner) */}
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
              <Button size="sm" variant="default" onClick={openAddAdminModal}>
                <UserPlus className="mr-1 h-4 w-4" /> Assign Primary Admin
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2b: Company Administrators (full management) */}
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
          <Button size="sm" onClick={openAddAdminModal}>
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
                    const isPrimary = a.id === primaryAdmin?.id;
                    return (
                      <tr key={a.id} className="border-b">
                        <td className="py-2 pr-3 font-medium">
                          {a.firstName} {a.lastName}
                          {isPrimary && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              <KeyRound className="h-3 w-3" /> Primary
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
                          <Badge
                            variant={
                              a.role === "OWNER" ? "default" : "secondary"
                            }
                          >
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
                            {!isPrimary && a.isActive && (
                              <TableActionButton
                                onClick={() => makePrimary(a)}
                                disabled={updateCompanyAdmin.isPending}
                                title="Promote to Primary Admin"
                              >
                                <Star className="mr-1 h-3 w-3" /> Make Primary
                              </TableActionButton>
                            )}
                            <TableActionButton onClick={() => openEditAdminModal(a)}>
                              <Edit3 className="mr-1 h-3 w-3" /> Edit
                            </TableActionButton>
                            {a.isActive ? (
                              <TableActionButton
                                onClick={() => attemptDisable(a)}
                                disabled={updateCompanyAdmin.isPending}
                                className="text-destructive hover:text-destructive"
                              >
                                <PowerOff className="mr-1 h-3 w-3" /> Disable
                              </TableActionButton>
                            ) : (
                              <TableActionButton
                                onClick={() => reactivate(a)}
                                disabled={updateCompanyAdmin.isPending}
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

      {/* Admin Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="success"
            onClick={() => handleStatusChange("ACTIVE")}
            disabled={markActiveDisabled}
            title={
              markActiveDisabled
                ? "City readiness not met. Update the city or wait for more merchants to join."
                : undefined
            }
          >
            <CheckCircle className="mr-1 h-4 w-4" />
            Mark Active
          </Button>
          {company.status !== "PAUSED" && (
            <Button
              size="sm"
              variant="warning"
              onClick={() => handleStatusChange("PAUSED")}
            >
              <Pause className="mr-1 h-4 w-4" />
              Pause
            </Button>
          )}
          {company.status !== "SUSPENDED" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleStatusChange("SUSPENDED")}
            >
              <Ban className="mr-1 h-4 w-4" />
              Suspend
            </Button>
          )}
          {company.status !== "CANCELLED" && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleStatusChange("CANCELLED")}
            >
              <XCircle className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendLaunchPack.mutate()}
            disabled={sendLaunchPack.isPending}
          >
            <Send className="mr-1 h-4 w-4" />
            {sendLaunchPack.isPending ? "Sending…" : "Send Launch Pack"}
          </Button>
          <Button size="sm" variant="outline" disabled title="Coming soon">
            <Mail className="mr-1 h-4 w-4" />
            Transfer Admin Email
          </Button>
        </CardContent>
      </Card>

      {/* SECTION 3: Employee Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Employees ({enrolledCount})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCSVUpload(!showCSVUpload)}
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              {showCSVUpload ? "Hide" : "Bulk Upload"} CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCSVUpload && !preview && (
            <>
              <p className="text-xs text-muted-foreground">
                Required columns: <code>firstName</code>, <code>lastName</code>,{" "}
                <code>email</code>, <code>department</code> (optional),{" "}
                <code>jobTitle</code> (optional). Header row is required.
              </p>
              <CSVUploadDropzone
                onUpload={handleCSVSelected}
                isUploading={previewLoading}
                acceptedFormats=".csv"
              />
            </>
          )}

          {preview && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">CSV Preview</h4>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreview(null)}
                >
                  <X className="h-3 w-3" /> Cancel
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded border bg-card p-2">
                  <p className="text-muted-foreground text-xs">Total rows</p>
                  <p className="text-lg font-semibold">
                    {preview.data.totalRows}
                  </p>
                </div>
                <div className="rounded border bg-card p-2">
                  <p className="text-muted-foreground text-xs">Valid</p>
                  <p className="text-lg font-semibold text-green-700">
                    {preview.data.validCount}
                  </p>
                </div>
                <div className="rounded border bg-card p-2">
                  <p className="text-muted-foreground text-xs">Rejected</p>
                  <p className="text-lg font-semibold text-red-700">
                    {preview.data.invalidCount}
                  </p>
                </div>
              </div>

              {preview.data.validCount > 0 && (
                <details className="rounded border bg-card p-2 text-sm" open>
                  <summary className="cursor-pointer font-medium">
                    Valid rows ({preview.data.validCount})
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
                        {preview.data.validRows.map((r) => (
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

              {preview.data.invalidCount > 0 && (
                <details className="rounded border bg-card p-2 text-sm" open>
                  <summary className="cursor-pointer font-medium text-red-700">
                    Invalid rows ({preview.data.invalidCount})
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
                        {preview.data.invalidRows.map((r) => (
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
                <Button variant="outline" onClick={() => setPreview(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setConfirmImportOpen(true)}
                  disabled={preview.data.validCount === 0}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Confirm Import ({preview.data.validCount})
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search employees..."
              className="rounded border px-3 py-1.5 text-sm"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
            />
            <select
              className="rounded border px-2 py-1.5 text-sm"
              value={employeeStatusFilter}
              onChange={(e) => setEmployeeStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INVITED">Invited</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
          <DataTable
            columns={employeeColumns}
            data={employees}
            keyExtractor={(e: any) => e.id}
            isLoading={false}
            emptyMessage="No employees found"
            pagination={{
              page: empPage,
              pageSize: empPageSize,
              total: empMeta?.total ?? employees.length,
              onPageChange: setEmpPage,
            }}
          />
        </CardContent>
      </Card>

      {/* Admin Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin Note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="w-full rounded border p-3 text-sm"
            rows={3}
            maxLength={500}
            placeholder="Add an internal note about this company (max 500 characters). Not visible to the company admin."
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {adminNote.length}/500
            </span>
            <Button
              size="sm"
              onClick={handleSaveNote}
              disabled={updateDetail.isPending}
            >
              {noteSaved
                ? "Saved"
                : updateDetail.isPending
                  ? "Saving..."
                  : "Save Note"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 4: Activity Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ActivityIcon className="h-4 w-4" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No status changes recorded.
            </p>
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
                      <span className="text-muted-foreground">
                        — {h.reason}
                      </span>
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

      <ConfirmDialog
        open={confirmOpen}
        title={`${confirmAction} Company`}
        message={`Are you sure you want to set this company to "${confirmAction}"?`}
        confirmLabel={confirmAction}
        loading={updateDetail.isPending}
        onConfirm={confirmStatusChange}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmAction("");
        }}
      />

      <ConfirmDialog
        open={confirmImportOpen}
        title="Confirm Employee Import"
        message={`This will create ${preview?.data.validCount ?? 0} new employee records. ${preview?.data.invalidCount ?? 0} invalid rows will be skipped. This action cannot be undone.`}
        confirmLabel="Import"
        loading={confirmImport.isPending}
        onConfirm={() => confirmImport.mutate()}
        onCancel={() => setConfirmImportOpen(false)}
      />

      {/* Add / Edit Admin Modal */}
      <Modal open={adminModalOpen} onClose={closeAdminModal}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {adminEditing ? "Edit Admin" : "Add Admin"}
          </h3>
          <button
            type="button"
            onClick={closeAdminModal}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">
                First Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={adminForm.firstName}
                onChange={(e) =>
                  setAdminForm((p) => ({ ...p, firstName: e.target.value }))
                }
                placeholder="Jane"
              />
              {adminFormErrors.firstName && (
                <p className="mt-1 text-xs text-destructive">
                  {adminFormErrors.firstName}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Last Name <span className="text-destructive">*</span>
              </label>
              <Input
                value={adminForm.lastName}
                onChange={(e) =>
                  setAdminForm((p) => ({ ...p, lastName: e.target.value }))
                }
                placeholder="Doe"
              />
              {adminFormErrors.lastName && (
                <p className="mt-1 text-xs text-destructive">
                  {adminFormErrors.lastName}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </label>
            <Input
              type="email"
              value={adminForm.email}
              onChange={(e) =>
                setAdminForm((p) => ({ ...p, email: e.target.value }))
              }
              placeholder="admin@company.com"
            />
            {adminFormErrors.email && (
              <p className="mt-1 text-xs text-destructive">
                {adminFormErrors.email}
              </p>
            )}
          </div>
          {!adminEditing && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">Role</label>
                <select
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                  value={adminForm.role}
                  onChange={(e) =>
                    setAdminForm((p) => ({
                      ...p,
                      role: e.target.value as "OWNER" | "MEMBER",
                    }))
                  }
                >
                  <option value="MEMBER">Member</option>
                  <option value="OWNER">Owner (Primary)</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Role is advisory; primary is determined by the Make Primary
                  action and the auto-fix rule.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select
                  className="w-full rounded border bg-background px-3 py-2 text-sm"
                  value={adminForm.status}
                  onChange={(e) =>
                    setAdminForm((p) => ({
                      ...p,
                      status: e.target.value as "ACTIVE" | "INACTIVE",
                    }))
                  }
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </>
          )}
          {adminEditing && (
            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select
                className="w-full rounded border bg-background px-3 py-2 text-sm"
                value={adminForm.status}
                onChange={(e) =>
                  setAdminForm((p) => ({
                    ...p,
                    status: e.target.value as "ACTIVE" | "INACTIVE",
                  }))
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Disabling the only active primary admin is blocked.
              </p>
            </div>
          )}
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={closeAdminModal}>
            Cancel
          </Button>
          <Button
            onClick={submitAdminForm}
            disabled={addCompanyAdmin.isPending || updateCompanyAdmin.isPending}
          >
            {addCompanyAdmin.isPending || updateCompanyAdmin.isPending
              ? "Saving…"
              : adminEditing
                ? "Save Changes"
                : "Create Admin"}
          </Button>
        </div>
      </Modal>

      {/* New-admin password reveal modal */}
      <Modal
        open={newPasswordForAdmin !== null}
        onClose={() => setNewPasswordForAdmin(null)}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Admin created</h3>
          <button
            type="button"
            onClick={() => setNewPasswordForAdmin(null)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          A temporary password has been generated for{" "}
          <span className="font-medium text-foreground">
            {newPasswordForAdmin?.email}
          </span>
          . Share it securely — it will not be shown again.
        </p>
        <div className="rounded border bg-muted/50 p-3 font-mono text-sm">
          {newPasswordForAdmin?.password}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The admin will be asked to reset this password on first login.
        </p>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setNewPasswordForAdmin(null)}>
            I&apos;ve saved it
          </Button>
        </div>
      </Modal>

      {/* Transfer primary before disable */}
      <Modal
        open={transferPromptOpen}
        onClose={() => {
          setTransferPromptOpen(false);
          setPendingDisableId(null);
          setTransferTargetId("");
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Transfer Primary Admin</h3>
          <button
            type="button"
            onClick={() => {
              setTransferPromptOpen(false);
              setPendingDisableId(null);
              setTransferTargetId("");
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          You&apos;re disabling the only active primary admin. Pick another
          active admin to take over as Primary Admin first.
        </p>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">
            New Primary Admin <span className="text-destructive">*</span>
          </label>
          <select
            className="w-full rounded border bg-background px-3 py-2 text-sm"
            value={transferTargetId}
            onChange={(e) => setTransferTargetId(e.target.value)}
          >
            <option value="">— Select admin —</option>
            {admins
              .filter((a) => a.id !== pendingDisableId && a.isActive)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.firstName} {a.lastName} ({a.email})
                </option>
              ))}
          </select>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setTransferPromptOpen(false);
              setPendingDisableId(null);
              setTransferTargetId("");
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={confirmTransferAndDisable}
            disabled={updateCompanyAdmin.isPending}
          >
            {updateCompanyAdmin.isPending ? "Working…" : "Transfer & Disable"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
