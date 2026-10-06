'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leadKeys } from './use-leads';

export const companyKeys = {
  all: ['companies'] as const,
  lists: () => [...companyKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...companyKeys.lists(), filters] as const,
  details: () => [...companyKeys.all, 'detail'] as const,
  detail: (id: string) => [...companyKeys.details(), id] as const,
};

export function useCompanies(filters?: {
  status?: string;
  adminStatus?: string;
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  return useQuery({
    queryKey: companyKeys.list(filters ?? {}),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status && filters.status !== 'ALL') params.set('status', filters.status);
      if (filters?.adminStatus && filters.adminStatus !== 'ALL') params.set('adminStatus', filters.adminStatus);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      if (filters?.q) params.set('q', filters.q);

      const res = await fetch(`/api/admin/companies?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch companies');
      return json;
    },
  });
}

export function useUpdateCompanyStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { companyId: string; status: string; reason?: string }) => {
      const res = await fetch('/api/admin/companies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update company status');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
    },
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    // `leadId` in data converts that lead; it is sent through unchanged.
    mutationFn: async (data: Record<string, unknown> & { leadId?: string }) => {
      const res = await fetch('/api/admin/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to create company');
      return json;
    },
    onSuccess: (_res, data) => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      if (data.leadId) queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

export function useCompanyDetail(id: string) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/admin/companies/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch company');
      return json;
    },
    enabled: !!id,
  });
}

export function useUpdateCompanyDetail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; reason?: string; adminNote?: string; billingStatus?: string }) => {
      const res = await fetch(`/api/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update company');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
      queryClient.invalidateQueries({ queryKey: companyKeys.details() });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/companies?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete company');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() });
    },
  });
}

export function useAddCompanyAdmin(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      firstName: string
      lastName: string
      email: string
      role?: 'OWNER' | 'MEMBER'
      status?: 'ACTIVE' | 'INACTIVE'
    }) => {
      const res = await fetch(`/api/admin/companies/${companyId}/admins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to add admin')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.detail(companyId) })
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() })
    },
  })
}

export function useUpdateCompanyAdmin(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      adminId,
      ...data
    }: {
      adminId: string
      firstName?: string
      lastName?: string
      email?: string
      status?: 'ACTIVE' | 'INACTIVE'
      makePrimary?: boolean
    }) => {
      const res = await fetch(
        `/api/admin/companies/${companyId}/admins/${adminId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update admin')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyKeys.detail(companyId) })
      queryClient.invalidateQueries({ queryKey: companyKeys.lists() })
    },
  })
}
