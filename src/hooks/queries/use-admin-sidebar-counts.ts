import { useQuery } from '@tanstack/react-query'

export interface AdminSidebarCounts {
  actionQueue: number
  replacements: number
  merchants: number
  merchantSuggestions: number
  tickets: number
}

export const adminSidebarCountKeys = {
  all: ['admin-sidebar-counts'] as const,
}

/** Open-work counts for the admin sidebar badges. */
export function useAdminSidebarCounts(enabled = true) {
  return useQuery({
    queryKey: adminSidebarCountKeys.all,
    queryFn: async () => {
      const res = await fetch('/api/admin/sidebar-counts')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch sidebar counts')
      return json.data as AdminSidebarCounts
    },
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}
