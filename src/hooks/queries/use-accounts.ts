'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminRoleValue } from '@/lib/access/account-access';

/** Row shape returned by GET /api/admin/accounts. */
export interface AccountRow {
  id: string;
  name: string;
  email: string;
  role: AdminRoleValue;
  status: 'ACTIVE' | 'INACTIVE' | 'INVITE_PENDING';
  lastLoginAt: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface AccountsResponse {
  success: boolean;
  data: AccountRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AccountsFilters {
  q?: string;
  role?: string;
  page?: number;
  pageSize?: number;
}

export const accountKeys = {
  all: ['admin-accounts'] as const,
  list: (filters: AccountsFilters) => [...accountKeys.all, 'list', filters] as const,
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new Error(body.error?.message ?? 'Request failed');
  return body as T;
}

export function useAccounts(filters: AccountsFilters = {}) {
  return useQuery({
    queryKey: accountKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.role) params.set('role', filters.role);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
      return api<AccountsResponse>(`/api/admin/accounts?${params.toString()}`);
    },
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { firstName: string; lastName: string; email: string; role: AdminRoleValue }) =>
      api<{ success: boolean; message: string }>('/api/admin/accounts', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: AdminRoleValue; isActive?: boolean }) =>
      api<{ success: boolean; message: string }>(`/api/admin/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.all }),
  });
}

export function useResendInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ success: boolean; message: string }>(`/api/admin/accounts/${id}/resend-invite`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.all }),
  });
}
