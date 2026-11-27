'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorType: string;
  actorName: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogFilters {
  search?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

interface AuditLogResponse {
  data: AuditLogRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: async (): Promise<AuditLogResponse> => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) {
        if (v !== undefined && v !== '' && v !== 'ALL') params.set(k, String(v));
      }
      const res = await fetch(`/api/admin/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to fetch audit logs');
      return { data: json.data, meta: json.meta };
    },
    placeholderData: keepPreviousData,
  });
}
