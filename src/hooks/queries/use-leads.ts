'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type LeadType = 'MERCHANT' | 'EMPLOYER';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'REJECTED' | 'CONVERTED';

export interface Lead {
  id: string;
  type: LeadType;
  source: string;
  status: LeadStatus;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  companyName: string;
  hearAbout: string | null;
  message: string | null;
  consentAt: string | null;
  consentVersion: string | null;
  industry: string | null;
  cities: string[];
  websiteUrl: string | null;
  socialUrl: string | null;
  companySize: string | null;
  hqCountry: string | null;
  role: string | null;
  merchantId: string | null;
  companyId: string | null;
  merchant?: { id: string; businessName: string } | null;
  company?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export const leadKeys = {
  all: ['leads'] as const,
  lists: () => [...leadKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...leadKeys.lists(), filters] as const,
  newCount: () => [...leadKeys.all, 'new-count'] as const,
  details: () => [...leadKeys.all, 'detail'] as const,
  detail: (id: string) => [...leadKeys.details(), id] as const,
};

export function useLeads(filters?: { type?: string; status?: string; q?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: leadKeys.list(filters ?? {}),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.type) params.set('type', filters.type);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.q) params.set('q', filters.q);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));

      const res = await fetch(`/api/admin/leads?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch leads');
      return json as { data: Lead[]; meta: { total: number } };
    },
  });
}

/** Count of NEW leads for the sidebar badge. */
export function useNewLeadCount(enabled = true) {
  return useQuery({
    queryKey: leadKeys.newCount(),
    queryFn: async () => {
      const res = await fetch('/api/admin/leads?status=NEW&pageSize=1');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch lead count');
      return (json.meta?.total ?? 0) as number;
    },
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useLead(id: string | null | undefined) {
  return useQuery({
    queryKey: leadKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await fetch(`/api/admin/leads/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch lead');
      return json.data as Lead;
    },
    enabled: !!id,
  });
}

export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status: 'CONTACTED' | 'REJECTED'; note?: string }) => {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update lead');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}
