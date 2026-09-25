'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companyEmployeeKeys } from '@/hooks/queries/use-company-employees';
import type { BulkRowInput, ValidatedBulkRow } from '@/lib/employees/bulk-validate';

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...employeeKeys.lists(), filters] as const,
};

export function useEmployees(filters?: {
  status?: string;
  companyId?: string;
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  return useQuery({
    queryKey: employeeKeys.list(filters ?? {}),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'ALL') params.set('status', filters.status);
      if (filters?.companyId && filters.companyId !== 'ALL') params.set('companyId', filters.companyId);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      if (filters?.q) params.set('q', filters.q);

      const res = await fetch(`/api/admin/employees?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch employees');
      return json;
    },
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to create employee');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}

export function useBulkUpdateEmployees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { employeeIds: string[]; status: string; reason?: string }) => {
      const res = await fetch('/api/admin/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update employees');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/admin/employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update employee');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}

export interface BulkValidateResponse {
  rows: ValidatedBulkRow[];
  summary: { total: number; valid: number; invalid: number };
  seatsRemaining?: number;
}

export interface BulkCreateResponse {
  summary: { total: number; created: number; failed: number };
  results: {
    clientId: string;
    sourceRow?: number;
    email: string;
    status: 'CREATED' | 'FAILED';
    reason?: string;
    employeeId?: string;
    emailSent?: boolean;
  }[];
}

async function postJson<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message ?? fallback);
  return json.data as T;
}

/** Parse + validate a bulk upload (no writes). Pass either `csv` or `rows`. */
export function useValidateBulkEmployees() {
  return useMutation({
    mutationFn: (data: { companyId: string; csv?: string; rows?: BulkRowInput[] }) =>
      postJson<BulkValidateResponse>('/api/admin/employees/bulk/validate', data, 'Failed to validate rows'),
  });
}

export function useCreateBulkEmployees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { companyId: string; rows: BulkRowInput[] }) =>
      postJson<BulkCreateResponse>('/api/admin/employees/bulk', data, 'Failed to upload employees'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
      queryClient.invalidateQueries({ queryKey: companyEmployeeKeys.all });
    },
  });
}

export function useBulkDeleteEmployees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`/api/admin/employees?ids=${ids.join(',')}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete employees');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.lists() });
    },
  });
}
