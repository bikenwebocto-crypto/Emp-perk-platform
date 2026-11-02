"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  FileSpreadsheet,
  Mail,
  Pause,
  Power,
  PowerOff,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { showToast } from "@/hooks/use-toast";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { useUpdateCompanyDetail } from "@/hooks/queries/use-companies";
import {
  useDeactivateCompanyEmployee,
  useReactivateCompanyEmployee,
} from "@/hooks/queries/use-company-employees";
import {
  companyDetailEndpoints,
  useAddCompanyDetailAdmin,
  useCompanyDetailData,
  useCompanyDetailEmployees,
  useConfirmCompanyCsvImport,
  useInvalidateCompanyDetail,
  usePromoteCompanyDetailEmployee,
  useRevertCompanyDetailAdmin,
  useUpdateCompanyDetailAdmin,
} from "@/hooks/queries/use-company-detail-view";
import { CSVUploadDropzone } from "@/features/csv-uploads/components/csv-upload-dropzone";
import type { ColumnDef, CompanyAdminSummary } from "@/types";
import {
  ActionImpact,
  deactivateEmployeeCopy,
  disableAdminCopy,
  PROMOTED_BADGE_TOOLTIP,
  promoteCopy,
  reactivateAdminCopy,
  reactivateEmployeeCopy,
  revertCopy,
} from "@/features/employees/components/action-impact";
import { TableActionButton } from "./primitives";
import {
  ActivityLogCard,
  AdministratorsCard,
  CityReadinessBanner,
  CompanyHeaderCard,
  CompanyInfoCard,
  CsvPreviewPanel,
  PrimaryAdminCard,
} from "./sections";
import { AdminFormModal, PasswordRevealModal, TransferPrimaryModal } from "./admin-modals";
import {
  EMPTY_ADMIN_FORM,
  permissionsFor,
  type AdminFormState,
  type CityReadiness,
  type CompanyDetailScope,
  type ImportPreview,
} from "./types";

async function fetchReadiness(id: string): Promise<CityReadiness> {
  const res = await fetch(`/api/admin/companies/${id}/city-readiness`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to load readiness");
  return json.data;
}

interface CompanyDetailViewProps {
  scope: CompanyDetailScope;
  /** Required for Super Admin. Ignored for Company Admin, whose company comes from the session. */
  companyId?: string;
}

/**
 * The Company Detail page, shared by Super Admin (/admin/companies/[id])
 * and Company Admin (/company). Both see the same sections; `scope`
 * decides which API is called and which platform-only controls show.
 */
export function CompanyDetailView({ scope, companyId: companyIdProp = "" }: CompanyDetailViewProps) {
  const router = useRouter();
  const isSuperAdmin = scope === "super_admin";

  const { data, isLoading } = useCompanyDetailData(scope, companyIdProp);
  const company = data?.data;
  // Company Admin learns its company id from the server response.
  const id: string = isSuperAdmin ? companyIdProp : (company?.id ?? "");
  const endpoints = companyDetailEndpoints(scope, id);
  const invalidate = useInvalidateCompanyDetail(scope, companyIdProp);

  const updateDetail = useUpdateCompanyDetail();

  const { data: readiness } = useQuery({
    queryKey: ["company-readiness", id],
    queryFn: () => fetchReadiness(id),
    enabled: isSuperAdmin && !!id,
  });

  const [adminNote, setAdminNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string>("");

  // CSV preview state
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [preview, setPreview] = useState<{ csv: string; data: ImportPreview } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState("ALL");
  const { page: empPage, setPage: setEmpPage, pageSize: empPageSize } = useTablePagination({
    defaultPageSize: 10,
  });

  const { data: empData } = useCompanyDetailEmployees(scope, companyIdProp, {
    status: employeeStatusFilter !== "ALL" ? employeeStatusFilter : undefined,
    q: employeeSearch || undefined,
    page: empPage,
    pageSize: empPageSize,
  });
  const employees = empData?.data ?? [];
  const empMeta = empData?.meta;

  // Admin management state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminEditing, setAdminEditing] = useState<CompanyAdminSummary | null>(null);
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

  const addCompanyAdmin = useAddCompanyDetailAdmin(scope, companyIdProp);
  const updateCompanyAdmin = useUpdateCompanyDetailAdmin(scope, companyIdProp);
  const revertAdmin = useRevertCompanyDetailAdmin(scope, companyIdProp);
  const [revertingAdmin, setRevertingAdmin] = useState<CompanyAdminSummary | null>(null);
  const promoteEmployee = usePromoteCompanyDetailEmployee(scope, companyIdProp);
  const [promotingEmployee, setPromotingEmployee] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    status?: string;
  } | null>(null);
  // One confirmation for the admin/employee actions that would otherwise run
  // on a single click.
  type PendingConfirm =
    | { kind: "disableAdmin" | "reactivateAdmin"; admin: CompanyAdminSummary }
    | { kind: "deactivateEmployee" | "reactivateEmployee"; employee: { id: string; firstName: string; lastName: string } };
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const promoteDialogCopy = promoteCopy({
    name: promotingEmployee ? `${promotingEmployee.firstName} ${promotingEmployee.lastName}` : "this employee",
    companyName: company?.name ?? "this company",
    employeeStatus: promotingEmployee?.status,
  });
  const revertDialogCopy = revertCopy(
    revertingAdmin ? `${revertingAdmin.firstName} ${revertingAdmin.lastName}` : "this admin",
  );
  const deactivateEmployee = useDeactivateCompanyEmployee();
  const reactivateEmployee = useReactivateCompanyEmployee();

  const admins: CompanyAdminSummary[] = useMemo(
    () => (company?.admins as CompanyAdminSummary[] | undefined) ?? [],
    [company?.admins],
  );
  // A promoted employee's account is no longer an EMPLOYEE account; fall back to
  // the admin list (CompanyAdmin.id === account id) if the role isn't loaded.
  const adminAccountIds = useMemo(() => new Set(admins.map((a) => a.id)), [admins]);
  const isPromotedEmployee = (e: { accountId?: string | null; account?: { role?: string } | null }) =>
    e.account?.role ? e.account.role !== "EMPLOYEE" : !!e.accountId && adminAccountIds.has(e.accountId);
  const primaryAdmin: CompanyAdminSummary | null =
    (company?.primaryAdmin as CompanyAdminSummary | null) ?? null;

  const viewerAdminId: string | null = company?.viewerAdminId ?? null;
  const permissions = permissionsFor(scope, {
    adminId: viewerAdminId,
    isPrimary: !!viewerAdminId && viewerAdminId === primaryAdmin?.id,
  });

  const handleDeactivateEmployee = useCallback(
    (employeeId: string) => {
      deactivateEmployee.mutate(
        { id: employeeId },
        {
          onSuccess: () => {
            showToast({ type: "success", title: "Employee deactivated" });
            invalidate.employees();
          },
          onError: (err: Error) =>
            showToast({ type: "error", title: "Deactivate failed", description: err.message }),
        },
      );
    },
    [deactivateEmployee, invalidate],
  );

  const handleReactivateEmployee = useCallback(
    (employeeId: string) => {
      reactivateEmployee.mutate(
        { id: employeeId },
        {
          onSuccess: () => {
            showToast({ type: "success", title: "Employee reactivated" });
            invalidate.employees();
          },
          onError: (err: Error) =>
            showToast({ type: "error", title: "Reactivate failed", description: err.message }),
        },
      );
    },
    [reactivateEmployee, invalidate],
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
      render: (e: any) =>
        isPromotedEmployee(e) ? (
          <span title={PROMOTED_BADGE_TOOLTIP} className="inline-flex cursor-help items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            <ShieldCheck className="h-3 w-3" /> Promoted to Admin
          </span>
        ) : (
          <StatusBadge status={e.status} />
        ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (e: any) => (
        isPromotedEmployee(e) ? null : (
        <div className="inline-flex flex-wrap items-center gap-1">
          {(e.status === "ACTIVE" || e.status === "INACTIVE") && (
              <TableActionButton
                onClick={() => setPromotingEmployee(e)}
                disabled={promoteEmployee.isPending}
                title="Promote to Company Admin"
              >
                <ShieldCheck className="mr-1 h-3 w-3" /> Make Admin
              </TableActionButton>
            )}
          {e.status === "ACTIVE" ? (
            <TableActionButton
              variant="destructive"
              onClick={() => setPendingConfirm({ kind: "deactivateEmployee", employee: e })}
              title="Deactivate"
            >
              <PowerOff className="mr-1 h-3 w-3" /> Deactivate
            </TableActionButton>
          ) : (
            <TableActionButton
              variant="success"
              onClick={() => setPendingConfirm({ kind: "reactivateEmployee", employee: e })}
              title="Activate"
            >
              <Power className="mr-1 h-3 w-3" /> Activate
            </TableActionButton>
          )}
        </div>
        )
      ),
    },
  ];

  // ----- Super Admin only: status, note, billing ------------------

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
          invalidate.detail();
        },
        onError: (err: Error) => {
          showToast({ type: "error", title: "Update failed", description: err.message });
          setConfirmOpen(false);
          setConfirmAction("");
        },
      },
    );
  }, [id, confirmAction, updateDetail, invalidate]);

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
          showToast({ type: "error", title: "Failed to save note", description: err.message }),
      },
    );
  }, [id, adminNote, updateDetail, company]);

  const handleBillingStatusChange = useCallback(
    (billingStatus: string) => {
      updateDetail.mutate(
        { id, billingStatus },
        {
          onSuccess: () => {
            showToast({ type: "success", title: `Billing status updated to ${billingStatus}` });
          },
          onError: (err: Error) =>
            showToast({ type: "error", title: "Billing update failed", description: err.message }),
        },
      );
    },
    [id, updateDetail],
  );

  const sendLaunchPack = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/companies/${id}/launch-pack`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to send launch pack");
      return json;
    },
    onSuccess: (json) => {
      showToast({
        type: "success",
        title: "Launch pack sent",
        description: `${json.data?.adminCount ?? 0} admins, ${json.data?.employeeCount ?? 0} employees notified`,
      });
    },
    onError: (err: Error) => showToast({ type: "error", title: "Failed", description: err.message }),
  });

  const sendBillingReminder = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/companies/${id}/billing-reminder`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Failed to send reminder");
      return json;
    },
    onSuccess: () => showToast({ type: "success", title: "Billing reminder sent" }),
    onError: (err: Error) => showToast({ type: "error", title: "Failed", description: err.message }),
  });

  // ----- CSV preview/confirm flow ---------------------------------

  const handleCSVSelected = useCallback(
    async (file: File) => {
      setPreviewLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(endpoints.csvPreview, { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? "Preview failed");

        const csv = await file.text();
        setPreview({ csv, data: json.data });
      } catch (err: any) {
        showToast({ type: "error", title: "Preview failed", description: err.message });
      } finally {
        setPreviewLoading(false);
      }
    },
    [endpoints.csvPreview],
  );

  const confirmImport = useConfirmCompanyCsvImport(scope, companyIdProp);
  const runConfirmImport = useCallback(() => {
    if (!preview) return;
    confirmImport.mutate(
      { csv: preview.csv, bodyHash: preview.data.bodyHash },
      {
        onSuccess: (json: any) => {
          showToast({
            type: "success",
            title: "Import complete",
            description: json.message ?? `${json.data?.imported} imported`,
          });
          setPreview(null);
          setShowCSVUpload(false);
          setConfirmImportOpen(false);
        },
        onError: (err: Error) =>
          showToast({ type: "error", title: "Import failed", description: err.message }),
      },
    );
  }, [preview, confirmImport]);

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
      const editingSelf = adminEditing.id === permissions.selfAdminId;
      updateCompanyAdmin.mutate(
        {
          adminId: adminEditing.id,
          firstName: adminForm.firstName.trim(),
          lastName: adminForm.lastName.trim(),
          email: adminForm.email.trim().toLowerCase(),
          status: editingSelf ? undefined : adminForm.status,
        },
        {
          onSuccess: () => {
            showToast({ type: "success", title: "Admin updated" });
            closeAdminModal();
          },
          onError: (err: Error) =>
            showToast({ type: "error", title: "Failed to update admin", description: err.message }),
        },
      );
    } else {
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
            showToast({ type: "error", title: "Failed to create admin", description: err.message }),
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
    permissions.selfAdminId,
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
            showToast({ type: "error", title: "Failed to transfer primary", description: err.message }),
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
        if (!permissions.transferPrimary) {
          showToast({
            type: "error",
            title: "Cannot disable",
            description: "Only the primary administrator can transfer the primary role.",
          });
          return;
        }
        // Find other active admins to transfer primary to
        const others = admins.filter((a) => a.id !== admin.id && a.isActive);
        if (others.length === 0) {
          showToast({
            type: "error",
            title: "Cannot disable",
            description: "Each company must have at least one active primary administrator.",
          });
          return;
        }
        setPendingDisableId(admin.id);
        setTransferTargetId(others[0]?.id ?? "");
        setTransferPromptOpen(true);
        return;
      }
      setPendingConfirm({ kind: "disableAdmin", admin });
    },
    [admins, permissions.transferPrimary],
  );

  const disableAdmin = useCallback(
    (admin: CompanyAdminSummary, onDone: () => void) => {
      updateCompanyAdmin.mutate(
        { adminId: admin.id, status: "INACTIVE" },
        {
          onSuccess: () => {
            showToast({
              type: "success",
              title: `${admin.firstName} ${admin.lastName} disabled`,
              description: admin.hasEmployeeRecord
                ? "To make them an employee again, choose Revert to Employee."
                : undefined,
            });
            onDone();
          },
          onError: (err: Error) =>
            showToast({ type: "error", title: "Failed to disable admin", description: err.message }),
        },
      );
    },
    [updateCompanyAdmin],
  );

  const closeTransferPrompt = useCallback(() => {
    setTransferPromptOpen(false);
    setPendingDisableId(null);
    setTransferTargetId("");
  }, []);

  const confirmTransferAndDisable = useCallback(() => {
    if (!pendingDisableId) return;
    if (!transferTargetId) {
      showToast({ type: "error", title: "Select a new primary admin first" });
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
                showToast({ type: "success", title: "Primary transferred and admin disabled" });
                closeTransferPrompt();
              },
              onError: (err: Error) =>
                showToast({ type: "error", title: "Failed to disable admin", description: err.message }),
            },
          );
        },
        onError: (err: Error) =>
          showToast({ type: "error", title: "Failed to transfer primary", description: err.message }),
      },
    );
  }, [pendingDisableId, transferTargetId, updateCompanyAdmin, closeTransferPrompt]);

  const reactivate = useCallback(
    (admin: CompanyAdminSummary, onDone: () => void) => {
      updateCompanyAdmin.mutate(
        { adminId: admin.id, status: "ACTIVE" },
        {
          onSuccess: () => {
            showToast({ type: "success", title: `${admin.firstName} ${admin.lastName} reactivated` });
            onDone();
          },
          onError: (err: Error) =>
            showToast({ type: "error", title: "Failed to reactivate admin", description: err.message }),
        },
      );
    },
    [updateCompanyAdmin],
  );

  const confirmCopy = useMemo(() => {
    if (!pendingConfirm) return null;
    if ("admin" in pendingConfirm) {
      const { admin } = pendingConfirm;
      const params = { name: `${admin.firstName} ${admin.lastName}`, hasEmployeeRecord: admin.hasEmployeeRecord };
      return pendingConfirm.kind === "disableAdmin" ? disableAdminCopy(params) : reactivateAdminCopy(params);
    }
    const name = `${pendingConfirm.employee.firstName} ${pendingConfirm.employee.lastName}`;
    return pendingConfirm.kind === "deactivateEmployee"
      ? deactivateEmployeeCopy(name)
      : reactivateEmployeeCopy(name);
  }, [pendingConfirm]);

  const runPendingConfirm = useCallback(() => {
    if (!pendingConfirm) return;
    const done = () => setPendingConfirm(null);
    switch (pendingConfirm.kind) {
      case "disableAdmin":
        return disableAdmin(pendingConfirm.admin, done);
      case "reactivateAdmin":
        return reactivate(pendingConfirm.admin, done);
      case "deactivateEmployee":
        handleDeactivateEmployee(pendingConfirm.employee.id);
        return done();
      case "reactivateEmployee":
        handleReactivateEmployee(pendingConfirm.employee.id);
        return done();
    }
  }, [pendingConfirm, disableAdmin, reactivate, handleDeactivateEmployee, handleReactivateEmployee]);

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
    return <div className="text-center text-muted-foreground py-12">Company not found</div>;
  }

  const history = company.statusHistory ?? [];
  const enrolledCount = company._count?.employees ?? 0;
  const cityReadiness = readiness as CityReadiness | undefined;
  const markActiveDisabled = !cityReadiness?.ready && company.status !== "ACTIVE";

  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description={`Company Contact: ${company.email} · Created ${new Date(company.createdAt).toLocaleDateString()}`}
        actions={
          isSuperAdmin ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push("/admin/companies")}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            </div>
          ) : undefined
        }
      />

      {permissions.manageCompanyStatus && cityReadiness && !cityReadiness.ready && (
        <CityReadinessBanner readiness={cityReadiness} />
      )}

      <CompanyHeaderCard company={company} />

      {/* SECTION 1: Company Information (Contact) */}
      <CompanyInfoCard
        company={company}
        canManageBilling={permissions.manageBilling}
        onBillingStatusChange={handleBillingStatusChange}
        onSendBillingReminder={() => sendBillingReminder.mutate()}
        sendingReminder={sendBillingReminder.isPending}
      />

      {/* SECTION 2: Primary Administrator (the login owner) */}
      <PrimaryAdminCard primaryAdmin={primaryAdmin} onAssign={openAddAdminModal} />

      {/* SECTION 2b: Company Administrators (full management) */}
      <AdministratorsCard
        admins={admins}
        primaryAdminId={primaryAdmin?.id ?? null}
        permissions={permissions}
        busy={updateCompanyAdmin.isPending || revertAdmin.isPending}
        onAdd={openAddAdminModal}
        onEdit={openEditAdminModal}
        onMakePrimary={makePrimary}
        onDisable={attemptDisable}
        onReactivate={(admin) => setPendingConfirm({ kind: "reactivateAdmin", admin })}
        onRevertToEmployee={setRevertingAdmin}
      />

      {/* Admin Actions (platform-level company lifecycle) */}
      {permissions.manageCompanyStatus && (
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
              <Button size="sm" variant="warning" onClick={() => handleStatusChange("PAUSED")}>
                <Pause className="mr-1 h-4 w-4" />
                Pause
              </Button>
            )}
            {company.status !== "SUSPENDED" && (
              <Button size="sm" variant="destructive" onClick={() => handleStatusChange("SUSPENDED")}>
                <Ban className="mr-1 h-4 w-4" />
                Suspend
              </Button>
            )}
            {company.status !== "CANCELLED" && (
              <Button size="sm" variant="destructive" onClick={() => handleStatusChange("CANCELLED")}>
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
      )}

      {/* SECTION 3: Employee Summary */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Employees ({enrolledCount})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowCSVUpload(!showCSVUpload)}>
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
            <CsvPreviewPanel
              preview={preview.data}
              onCancel={() => setPreview(null)}
              onConfirm={() => setConfirmImportOpen(true)}
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search employees..."
              className="w-full rounded border px-3 py-1.5 text-sm sm:w-auto"
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

      {/* Admin Note (internal to the platform team) */}
      {permissions.viewAdminNote && (
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
              <span className="text-xs text-muted-foreground">{adminNote.length}/500</span>
              <Button size="sm" onClick={handleSaveNote} disabled={updateDetail.isPending}>
                {noteSaved ? "Saved" : updateDetail.isPending ? "Saving..." : "Save Note"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 4: Activity Log */}
      <ActivityLogCard history={history} />

      {permissions.manageCompanyStatus && (
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
      )}

      <ConfirmDialog
        open={confirmImportOpen}
        title="Confirm Employee Import"
        message={`This will create ${preview?.data.validCount ?? 0} new employee records. ${preview?.data.invalidCount ?? 0} invalid rows will be skipped. This action cannot be undone.`}
        confirmLabel="Import"
        loading={confirmImport.isPending}
        onConfirm={runConfirmImport}
        onCancel={() => setConfirmImportOpen(false)}
      />

      <AdminFormModal
        open={adminModalOpen}
        editing={adminEditing}
        form={adminForm}
        setForm={setAdminForm}
        errors={adminFormErrors}
        saving={addCompanyAdmin.isPending || updateCompanyAdmin.isPending}
        lockStatus={!!adminEditing && adminEditing.id === permissions.selfAdminId}
        onClose={closeAdminModal}
        onSubmit={submitAdminForm}
      />

      <ConfirmDialog
        open={!!promotingEmployee}
        title="Promote to Company Admin"
        variant="default"
        confirmLabel="Promote"
        loading={promoteEmployee.isPending}
        message={promoteDialogCopy.message}
        onConfirm={() => {
          if (!promotingEmployee) return;
          promoteEmployee.mutate(
            { employeeId: promotingEmployee.id },
            {
              onSuccess: () => {
                showToast({ type: "success", title: "Employee promoted to Company Admin" });
                setPromotingEmployee(null);
              },
              onError: (err: Error) =>
                showToast({ type: "error", title: "Promotion failed", description: err.message }),
            },
          );
        }}
        onCancel={() => setPromotingEmployee(null)}
      >
        <ActionImpact copy={promoteDialogCopy} />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!pendingConfirm && !!confirmCopy}
        title={
          pendingConfirm?.kind === "disableAdmin"
            ? "Disable Administrator"
            : pendingConfirm?.kind === "reactivateAdmin"
              ? "Reactivate Administrator"
              : pendingConfirm?.kind === "deactivateEmployee"
                ? "Deactivate Employee"
                : "Reactivate Employee"
        }
        variant={
          pendingConfirm?.kind === "disableAdmin" || pendingConfirm?.kind === "deactivateEmployee"
            ? "destructive"
            : "default"
        }
        confirmLabel={
          pendingConfirm?.kind === "disableAdmin"
            ? "Disable"
            : pendingConfirm?.kind === "deactivateEmployee"
              ? "Deactivate"
              : "Reactivate"
        }
        loading={updateCompanyAdmin.isPending || deactivateEmployee.isPending || reactivateEmployee.isPending}
        message={confirmCopy?.message ?? ""}
        onConfirm={runPendingConfirm}
        onCancel={() => setPendingConfirm(null)}
      >
        {confirmCopy && <ActionImpact copy={confirmCopy} />}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!revertingAdmin}
        title="Revert to Employee"
        variant="default"
        confirmLabel="Revert"
        loading={revertAdmin.isPending}
        message={revertDialogCopy.message}
        onConfirm={() => {
          if (!revertingAdmin) return;
          revertAdmin.mutate(
            { adminId: revertingAdmin.id },
            {
              onSuccess: () => {
                showToast({ type: "success", title: "Admin reverted to employee" });
                setRevertingAdmin(null);
              },
              onError: (err: Error) =>
                showToast({ type: "error", title: "Revert failed", description: err.message }),
            },
          );
        }}
        onCancel={() => setRevertingAdmin(null)}
      >
        <ActionImpact copy={revertDialogCopy} />
      </ConfirmDialog>

      <PasswordRevealModal value={newPasswordForAdmin} onClose={() => setNewPasswordForAdmin(null)} />

      <TransferPrimaryModal
        open={transferPromptOpen}
        admins={admins}
        pendingDisableId={pendingDisableId}
        targetId={transferTargetId}
        setTargetId={setTransferTargetId}
        busy={updateCompanyAdmin.isPending}
        onClose={closeTransferPrompt}
        onConfirm={confirmTransferAndDisable}
      />
    </div>
  );
}
