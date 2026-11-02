"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CompanyAdminSummary } from "@/types";
import { Modal, ModalHeader } from "./primitives";
import type { AdminFormState } from "./types";

interface AdminFormModalProps {
  open: boolean;
  editing: CompanyAdminSummary | null;
  form: AdminFormState;
  setForm: Dispatch<SetStateAction<AdminFormState>>;
  errors: Partial<Record<keyof AdminFormState, string>>;
  saving: boolean;
  /** Hide the status select when the viewer is editing their own login. */
  lockStatus?: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

function StatusSelect({ form, setForm }: Pick<AdminFormModalProps, "form" | "setForm">) {
  return (
    <select
      className="w-full rounded border bg-background px-3 py-2 text-sm"
      value={form.status}
      onChange={(e) =>
        setForm((p) => ({ ...p, status: e.target.value as "ACTIVE" | "INACTIVE" }))
      }
    >
      <option value="ACTIVE">Active</option>
      <option value="INACTIVE">Inactive</option>
    </select>
  );
}

export function AdminFormModal({
  open,
  editing,
  form,
  setForm,
  errors,
  saving,
  lockStatus,
  onClose,
  onSubmit,
}: AdminFormModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader title={editing ? "Edit Admin" : "Add Admin"} onClose={onClose} />
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">
              First Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.firstName}
              onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
              placeholder="Jane"
            />
            {errors.firstName && (
              <p className="mt-1 text-xs text-destructive">{errors.firstName}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Last Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.lastName}
              onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
              placeholder="Doe"
            />
            {errors.lastName && (
              <p className="mt-1 text-xs text-destructive">{errors.lastName}</p>
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Email <span className="text-destructive">*</span>
          </label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="admin@company.com"
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
        {!editing && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">Role</label>
              <select
                className="w-full rounded border bg-background px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) =>
                  setForm((p) => ({ ...p, role: e.target.value as "OWNER" | "MEMBER" }))
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
              <StatusSelect form={form} setForm={setForm} />
            </div>
          </>
        )}
        {editing && !lockStatus && (
          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <StatusSelect form={form} setForm={setForm} />
            <p className="mt-1 text-xs text-muted-foreground">
              Disabling the only active primary admin is blocked.
            </p>
          </div>
        )}
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save Changes" : "Create Admin"}
        </Button>
      </div>
    </Modal>
  );
}

interface PasswordRevealModalProps {
  value: { email: string; password: string } | null;
  onClose: () => void;
}

export function PasswordRevealModal({ value, onClose }: PasswordRevealModalProps) {
  return (
    <Modal open={value !== null} onClose={onClose}>
      <ModalHeader title="Admin created" onClose={onClose} />
      <p className="mb-3 text-sm text-muted-foreground">
        A temporary password has been generated for{" "}
        <span className="font-medium text-foreground">{value?.email}</span>
        . Share it securely — it will not be shown again.
      </p>
      <div className="rounded border bg-muted/50 p-3 font-mono text-sm">{value?.password}</div>
      <p className="mt-3 text-xs text-muted-foreground">
        The admin will be asked to reset this password on first login.
      </p>
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>I&apos;ve saved it</Button>
      </div>
    </Modal>
  );
}

interface TransferPrimaryModalProps {
  open: boolean;
  admins: CompanyAdminSummary[];
  pendingDisableId: string | null;
  targetId: string;
  setTargetId: (id: string) => void;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function TransferPrimaryModal({
  open,
  admins,
  pendingDisableId,
  targetId,
  setTargetId,
  busy,
  onClose,
  onConfirm,
}: TransferPrimaryModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader title="Transfer Primary Admin" onClose={onClose} />
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
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
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
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? "Working…" : "Transfer & Disable"}
        </Button>
      </div>
    </Modal>
  );
}
