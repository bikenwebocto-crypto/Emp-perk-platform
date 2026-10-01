import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export const actionQueueKeys = {
  all: ['action-queue'] as const,
  lists: () => [...actionQueueKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...actionQueueKeys.lists(), filters] as const,
  detail: (id: string) => [...actionQueueKeys.all, 'detail', id] as const,
};

export interface ActionQueueFilters {
  status?: string;
  type?: string;
  queueType?: string;
  tab?: string;
  priority?: string;
  page?: number;
  pageSize?: number;
  q?: string;
}

export function useActionQueue(filters?: ActionQueueFilters) {
  return useQuery({
    queryKey: actionQueueKeys.list(filters as unknown as Record<string, unknown> ?? {}),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.type && filters.type !== 'ALL') params.set('type', filters.type);
      if (filters?.queueType) params.set('queueType', filters.queueType);
      if (filters?.tab) params.set('tab', filters.tab);
      if (filters?.priority && filters.priority !== 'ALL') params.set('priority', filters.priority);
      if (filters?.page) params.set('page', String(filters.page));
      if (filters?.pageSize) params.set('pageSize', String(filters.pageSize));
      if (filters?.q) params.set('q', filters.q);

      const res = await fetch(`/api/admin/action-queue?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to fetch action queue');
      return json;
    },
  });
}

export function useActionQueueItem(id: string) {
  return useQuery({
    queryKey: actionQueueKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/admin/action-queue/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to fetch item');
      return json.data;
    },
    enabled: !!id,
  });
}

export function useActionQueueAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      action: 'APPROVE' | 'REJECT' | 'REMARK' | 'EDIT_AND_APPROVE';
      remark?: string;
      rejectionReason?: string;
      edits?: Record<string, unknown>;
    }) => {
      const res = await fetch(`/api/admin/action-queue/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Action failed');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: actionQueueKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: actionQueueKeys.lists() });
    },
  });
}

export function useUpdateActionQueueItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; status?: string; assignedTo?: string | null }) => {
      const res = await fetch('/api/admin/action-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to update item');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: actionQueueKeys.lists() });
    },
  });
}

export function useActionQueueStats() {
  return useQuery({
    queryKey: [...actionQueueKeys.all, 'stats'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/admin/action-queue/stats');
        const json = await res.json();
        if (!res.ok) return null;
        return json.data;
      } catch {
        return null;
      }
    },
    retry: false,
  });
}

export function useReviewItemNavigation() {
  return useCallback((item: { id: string }) => {
    return `/admin/action-queue/${item.id}`;
  }, []);
}
