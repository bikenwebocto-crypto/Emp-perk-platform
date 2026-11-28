'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showEmailWarnings } from '@/lib/email-warnings.client';
import type {
  MerchantDashboardFilters,
  MerchantDashboardResponse,
  MerchantHealth,
  MerchantStatus,
} from '@/types';

// ============================================================
// QUERY KEY FACTORY (stable — serialized filters)
// ============================================================

function stableKey(obj: unknown): string {
  return JSON.stringify(obj ?? {});
}

export const merchantKeys = {
  all: ['merchants'] as const,
  lists: () => [...merchantKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...merchantKeys.lists(), stableKey(filters)] as const,
  details: () => [...merchantKeys.all, 'detail'] as const,
  detail: (id: string) => [...merchantKeys.details(), id] as const,
  pending: () => [...merchantKeys.all, 'pending'] as const,
  search: (query: string) => [...merchantKeys.all, 'search', query] as const,
};

// ============================================================
// QUERY HOOKS
// ============================================================

export function useMerchants(filters?: {
  status?: MerchantStatus;
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  return useQuery({
    queryKey: merchantKeys.list(filters ?? {}),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      if (filters?.q) params.set('q', filters.q);

      const url = `/api/admin/merchants?${params}`;
      console.log('[useMerchants] fetching:', url);

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        console.error('[useMerchants] error:', res.status, body);
        throw new Error(`Failed to fetch merchants (${res.status})`);
      }

      const json = await res.json();
      console.log('[useMerchants] received:', json.meta ?? `${json.data?.length ?? 0} items`);
      return json;
    },
  });
}

export function useMerchantDetail(id: string) {
  return useQuery({
    queryKey: merchantKeys.detail(id),
    queryFn: async () => {
      const url = `/api/admin/merchants?merchantId=${id}`;
      console.log('[useMerchantDetail] fetching:', url);

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        console.error('[useMerchantDetail] error:', res.status, body);
        throw new Error(`Failed to fetch merchant (${res.status})`);
      }

      const json = await res.json();
      const merchant = json.data?.find?.((m: any) => m.id === id) ?? null;
      console.log('[useMerchantDetail] found:', merchant ? 'yes' : 'no');
      return { ...json, data: merchant };
    },
    enabled: !!id,
  });
}

export function usePendingMerchants(page = 1, pageSize = 20) {
  const queryKey = [...merchantKeys.pending(), page, pageSize];

  return useQuery({
    queryKey,
    queryFn: async () => {
      const url = `/api/admin/merchants?status=PENDING&page=${page}&pageSize=${pageSize}`;
      console.log('[usePendingMerchants] fetching:', url);

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        console.error('[usePendingMerchants] error:', res.status, body);
        throw new Error(`Failed to fetch pending merchants (${res.status})`);
      }

      const json = await res.json();
      console.log('[usePendingMerchants] received:', json.meta ?? `${json.data?.length ?? 0} items`);
      return json;
    },
    refetchInterval: 30000,
  });
}

export function useMerchantSearch(query: string) {
  return useQuery({
    queryKey: merchantKeys.search(query),
    queryFn: async () => {
      const url = `/api/admin/merchants?q=${encodeURIComponent(query)}`;
      console.log('[useMerchantSearch] fetching:', url);

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        console.error('[useMerchantSearch] error:', res.status, body);
        throw new Error(`Search failed (${res.status})`);
      }

      const json = await res.json();
      console.log('[useMerchantSearch] received:', json.meta ?? `${json.data?.length ?? 0} items`);
      return json;
    },
    enabled: query.length >= 2,
  } as any);
}

// ============================================================
// MUTATION HOOKS
// ============================================================

export function useApproveMerchant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { merchantId: string; status: MerchantStatus; rejectionReason?: string }) => {
      const body = JSON.stringify({
        merchantId: data.merchantId,
        status: data.status,
        rejectionReason: data.rejectionReason,
      });

      const res = await fetch('/api/admin/merchants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      const json = await res.json();
      if (!res.ok) {
        console.log('[useApproveMerchant] error:', res.status, json);
        throw new Error(json.error?.message ?? `Approval failed (${res.status})`);
      }

      console.log('[useApproveMerchant] success:', json.message);
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() });
      queryClient.invalidateQueries({ queryKey: merchantKeys.pending() });
    },
  });
}

export function useMerchantById(id: string) {
  return useQuery({
    queryKey: merchantKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch merchant');
      return json;
    },
    enabled: !!id,
  });
}

export function useMerchantOffers(merchantId: string) {
  return useQuery({
    queryKey: [...merchantKeys.detail(merchantId), 'offers'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}/offers`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch offers');
      return json;
    },
    enabled: !!merchantId,
  });
}

export function useUpdateMerchant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/admin/merchants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update merchant');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() });
      queryClient.invalidateQueries({ queryKey: merchantKeys.details() });
    },
  });
}

export function useDeleteMerchant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/admin/merchants/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete merchant');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() });
      queryClient.invalidateQueries({ queryKey: merchantKeys.pending() });
    },
  });
}

export function useCreateMerchant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/admin/merchants/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      console.log('[useCreateMerchant] Response:', json);
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to create merchant');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() });
    },
  });
}

// ============================================================
// DASHBOARD HOOKS
// ============================================================

export const merchantDashboardKeys = {
  all: ['merchant-dashboard'] as const,
  lists: () => [...merchantDashboardKeys.all, 'list'] as const,
  list: (filters: MerchantDashboardFilters) =>
    [...merchantDashboardKeys.lists(), stableKey(filters)] as const,
}

export function useMerchantDashboard(filters: MerchantDashboardFilters = {}) {
  return useQuery({
    queryKey: merchantDashboardKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      const setIfPresent = (k: string, v: string | number | boolean | undefined) => {
        if (v === undefined || v === null || v === '') return
        params.set(k, String(v))
      }
      setIfPresent('status', filters.status)
      setIfPresent('categoryId', filters.categoryId)
      setIfPresent('city', filters.city)
      setIfPresent('featured', filters.featured)
      setIfPresent('homepage', filters.homepage)
      setIfPresent('health', filters.health)
      setIfPresent('hasLiveOffers', filters.hasLiveOffers)
      setIfPresent('hasPendingOffers', filters.hasPendingOffers)
      setIfPresent('priorityMin', filters.priorityMin)
      setIfPresent('q', filters.q)
      setIfPresent('sortBy', filters.sortBy)
      setIfPresent('sortDir', filters.sortDir)
      setIfPresent('page', filters.page)
      setIfPresent('pageSize', filters.pageSize)

      const url = `/api/admin/merchants/dashboard?${params.toString()}`
      const res = await fetch(url, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch merchant dashboard')
      return json as { success: true; data: MerchantDashboardResponse['data']; summary: MerchantDashboardResponse['summary']; meta: MerchantDashboardResponse['meta'] }
    },
  })
}

export function useUpdateMerchantPriority() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: string; value: number }) => {
      const res = await fetch(`/api/admin/merchants/${vars.id}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'priority', value: vars.value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update priority')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantDashboardKeys.all })
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() })
    },
  })
}

export function useToggleMerchantFeatured() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: string; value: boolean }) => {
      const res = await fetch(`/api/admin/merchants/${vars.id}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'feature', value: vars.value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update feature flag')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantDashboardKeys.all })
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() })
    },
  })
}

export function useToggleMerchantHomepage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: string; value: boolean }) => {
      const res = await fetch(`/api/admin/merchants/${vars.id}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'homepage', value: vars.value }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update homepage flag')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantDashboardKeys.all })
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() })
    },
  })
}

export function useSuspendMerchant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { id: string; reason: string }) => {
      const res = await fetch(`/api/admin/merchants/${vars.id}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suspend', reason: vars.reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to suspend merchant')
      return json
    },
    onSuccess: (json) => {
      showEmailWarnings(json)
      queryClient.invalidateQueries({ queryKey: merchantDashboardKeys.all })
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() })
    },
  })
}

export function useActivateMerchant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/merchants/${id}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to activate merchant')
      return json
    },
    onSuccess: (json) => {
      showEmailWarnings(json)
      queryClient.invalidateQueries({ queryKey: merchantDashboardKeys.all })
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() })
    },
  })
}

export function usePauseMerchant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/admin/merchants/${id}/manage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause', reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to pause merchant')
      return json
    },
    onSuccess: (json) => {
      showEmailWarnings(json)
      queryClient.invalidateQueries({ queryKey: merchantDashboardKeys.all })
      queryClient.invalidateQueries({ queryKey: merchantKeys.lists() })
    },
  })
}
