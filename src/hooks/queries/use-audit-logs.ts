'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: string;
  actorId: string | null;
  actorName: string;
  companyId: string | null;
  companyName: string | null;
  outcome: string | null;
  reason: string | null;
  hasChanges: boolean;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  search?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  actorType?: string;
  actorId?: string;
  companyId?: string;
  outcome?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

interface AuditLogResponse {
  data: AuditLogRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
  hasBefore: boolean;
  hasAfter: boolean;
}

export type AuditChangeView =
  | { kind: 'none' }
  | { kind: 'diff'; fields: AuditFieldChange[] }
  | { kind: 'snapshot'; values: Record<string, unknown> }
  | { kind: 'raw'; value: unknown };

export interface AuditLogDetail extends Omit<AuditLogRow, 'hasChanges' | 'ipAddress'> {
  changes: AuditChangeView;
  metadata: Record<string, unknown> | null;
  request: { ipAddress: string | null; userAgent: string | null; requestId: string | null };
}

export interface AuditFilterOptions {
  entityTypes: { value: string; count: number }[];
  actions: { value: string; count: number }[];
  actorTypes: { value: string; count: number }[];
  companies: { value: string; label: string }[];
}

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? fallback);
  return json as T;
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: async (): Promise<AuditLogResponse> => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== '' && v !== 'ALL') params.set(k, String(v));
      }
      const json = await getJson<AuditLogResponse>(
        `/api/admin/audit-logs?${params.toString()}`,
        'Failed to fetch audit logs',
      );
      return { data: json.data, meta: json.meta };
    },
    placeholderData: keepPreviousData,
  });
}

export function useAuditLogFilterOptions() {
  return useQuery({
    queryKey: ['admin', 'audit-logs', 'filters'],
    queryFn: async () =>
      (await getJson<{ data: AuditFilterOptions }>('/api/admin/audit-logs/filters', 'Failed to load filters')).data,
    staleTime: 5 * 60_000,
  });
}

export function useAuditLogDetail(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', 'detail', id],
    enabled: !!id,
    queryFn: async () =>
      (await getJson<{ data: AuditLogDetail }>(`/api/admin/audit-logs/${id}`, 'Failed to load audit entry')).data,
  });
}
