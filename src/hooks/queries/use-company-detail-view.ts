'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companyKeys } from './use-companies';
import { employeeKeys } from './use-employees';
import { companyEmployeeKeys } from './use-company-employees';

/**
 * Hooks behind the shared Company Detail view. Super Admin passes the
 * company id and talks to /api/admin/companies/[id]/...; Company Admin
 * passes nothing and talks to /api/company/..., where the server takes
 * the company from the session.
 */
export type CompanyDetailScope = 'super_admin' | 'company_admin';

export function companyDetailEndpoints(scope: CompanyDetailScope, companyId: string) {
  if (scope === 'super_admin') {
    const base = `/api/admin/companies/${companyId}`;
    return {
      detail: base,
      admins: `${base}/admins`,
      csvPreview: `${base}/csv-preview`,
      csvConfirm: `${base}/csv-confirm`,
      employees: '/api/admin/employees',
    };
  }
  return {
    detail: '/api/company/detail',
    admins: '/api/company/admins',
    csvPreview: '/api/company/employees/csv-preview',
    csvConfirm: '/api/company/employees/csv-confirm',
    employees: '/api/company/employees',
  };
}

export const companyDetailViewKeys = {
  detail: (scope: CompanyDetailScope, companyId: string) =>
    scope === 'super_admin' ? companyKeys.detail(companyId) : (['company-self', 'detail'] as const),
  employees: (scope: CompanyDetailScope, companyId: string) =>
    ['company-detail-employees', scope, companyId] as const,
};

async function request(url: string, init: RequestInit | undefined, fallback: string) {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? fallback);
  return json;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function useCompanyDetailData(scope: CompanyDetailScope, companyId: string) {
  return useQuery({
    queryKey: companyDetailViewKeys.detail(scope, companyId),
    queryFn: () =>
      request(companyDetailEndpoints(scope, companyId).detail, undefined, 'Failed to fetch company'),
    enabled: scope === 'company_admin' || !!companyId,
  });
}

export function useCompanyDetailEmployees(
  scope: CompanyDetailScope,
  companyId: string,
  filters: { status?: string; q?: string; page: number; pageSize: number },
) {
  return useQuery({
    queryKey: [...companyDetailViewKeys.employees(scope, companyId), filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (scope === 'super_admin') params.set('companyId', companyId);
      if (filters.status) params.set('status', filters.status);
      if (filters.q) params.set('q', filters.q);
      params.set('page', String(filters.page));
      params.set('pageSize', String(filters.pageSize));
      return request(
        `${companyDetailEndpoints(scope, companyId).employees}?${params}`,
        undefined,
        'Failed to fetch employees',
      );
    },
    enabled: scope === 'company_admin' || !!companyId,
  });
}

/** Invalidate every cache the Company Detail view reads from. */
export function useInvalidateCompanyDetail(scope: CompanyDetailScope, companyId: string) {
  const queryClient = useQueryClient();
  return {
    detail: () => {
      queryClient.invalidateQueries({ queryKey: companyDetailViewKeys.detail(scope, companyId) });
      if (scope === 'super_admin') queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
    },
    employees: () => {
      queryClient.invalidateQueries({ queryKey: companyDetailViewKeys.employees(scope, companyId) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: companyEmployeeKeys.all });
      queryClient.invalidateQueries({ queryKey: companyDetailViewKeys.detail(scope, companyId) });
    },
  };
}

export function useAddCompanyDetailAdmin(scope: CompanyDetailScope, companyId: string) {
  const invalidate = useInvalidateCompanyDetail(scope, companyId);
  return useMutation({
    mutationFn: (data: {
      firstName: string;
      lastName: string;
      email: string;
      role?: 'OWNER' | 'MEMBER';
      status?: 'ACTIVE' | 'INACTIVE';
    }) =>
      request(companyDetailEndpoints(scope, companyId).admins, jsonInit('POST', data), 'Failed to add admin'),
    onSuccess: invalidate.detail,
  });
}

export function useUpdateCompanyDetailAdmin(scope: CompanyDetailScope, companyId: string) {
  const invalidate = useInvalidateCompanyDetail(scope, companyId);
  return useMutation({
    mutationFn: ({
      adminId,
      ...data
    }: {
      adminId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      status?: 'ACTIVE' | 'INACTIVE';
      makePrimary?: boolean;
    }) =>
      request(
        `${companyDetailEndpoints(scope, companyId).admins}/${adminId}`,
        jsonInit('PATCH', data),
        'Failed to update admin',
      ),
    onSuccess: invalidate.detail,
  });
}

/** Promote an active or deactivated employee of this company to a Company Admin. */
export function usePromoteCompanyDetailEmployee(scope: CompanyDetailScope, companyId: string) {
  const invalidate = useInvalidateCompanyDetail(scope, companyId);
  return useMutation({
    mutationFn: ({ employeeId }: { employeeId: string }) =>
      request(
        scope === 'super_admin'
          ? `/api/admin/employees/${employeeId}/promote`
          : `/api/company/employees/${employeeId}/promote`,
        { method: 'POST' },
        'Failed to promote employee',
      ),
    onSuccess: () => {
      invalidate.detail();
      invalidate.employees();
    },
  });
}

/** Revert a deactivated admin (promoted from an employee) back to an employee. */
export function useRevertCompanyDetailAdmin(scope: CompanyDetailScope, companyId: string) {
  const invalidate = useInvalidateCompanyDetail(scope, companyId);
  return useMutation({
    mutationFn: ({ adminId }: { adminId: string }) =>
      request(
        `${companyDetailEndpoints(scope, companyId).admins}/${adminId}/revert`,
        { method: 'POST' },
        'Failed to revert admin to employee',
      ),
    onSuccess: () => {
      invalidate.detail();
      invalidate.employees();
    },
  });
}

export function useConfirmCompanyCsvImport(scope: CompanyDetailScope, companyId: string) {
  const invalidate = useInvalidateCompanyDetail(scope, companyId);
  return useMutation({
    mutationFn: (data: { csv: string; bodyHash: string }) =>
      request(companyDetailEndpoints(scope, companyId).csvConfirm, jsonInit('POST', data), 'Import failed'),
    onSuccess: invalidate.employees,
  });
}
