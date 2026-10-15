export type { CompanyDetailScope } from "@/hooks/queries/use-company-detail-view";
import type { CompanyDetailScope } from "@/hooks/queries/use-company-detail-view";

export interface CityReadiness {
  city: string | null;
  activeMerchants: number;
  uniqueCategories: number;
  required: { minActiveMerchants: number; minUniqueCategories: number };
  ready: boolean;
  message: string;
}

export interface ImportPreview {
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

export interface AdminFormState {
  firstName: string;
  lastName: string;
  email: string;
  role: "OWNER" | "MEMBER";
  status: "ACTIVE" | "INACTIVE";
}

export const EMPTY_ADMIN_FORM: AdminFormState = {
  firstName: "",
  lastName: "",
  email: "",
  role: "MEMBER",
  status: "ACTIVE",
};

/**
 * What the viewer may do on the Company Detail view. The server enforces
 * the same rules; these only decide which controls are shown.
 */
export interface CompanyDetailPermissions {
  /** Status changes, launch pack, city readiness gate. */
  manageCompanyStatus: boolean;
  /** Billing status select and payment reminders. */
  manageBilling: boolean;
  /** Internal platform note (never shown to the company). */
  viewAdminNote: boolean;
  /** Promote another admin to primary. */
  transferPrimary: boolean;
  /** Admin id of the viewer, whose own login cannot be disabled. */
  selfAdminId: string | null;
}

export function permissionsFor(
  scope: CompanyDetailScope,
  viewer?: { adminId: string | null; isPrimary: boolean },
): CompanyDetailPermissions {
  if (scope === "super_admin") {
    return {
      manageCompanyStatus: true,
      manageBilling: true,
      viewAdminNote: true,
      transferPrimary: true,
      selfAdminId: null,
    };
  }
  return {
    manageCompanyStatus: false,
    manageBilling: false,
    viewAdminNote: false,
    transferPrimary: viewer?.isPrimary ?? false,
    selfAdminId: viewer?.adminId ?? null,
  };
}
