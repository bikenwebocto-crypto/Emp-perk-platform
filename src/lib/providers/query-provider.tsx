'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { adminSidebarCountKeys } from '@/hooks/queries/use-admin-sidebar-counts';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

const STALE_TIME = 30 * 1000; // 30 seconds
const GC_TIME = 5 * 60 * 1000; // 5 minutes

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
        // Any successful mutation (approve, reject, status change…) can change
        // open-work totals, so refresh the sidebar badges right away. Only
        // active (mounted) count queries refetch, so non-admins pay nothing.
        mutationCache: new MutationCache({
          onSuccess: () => {
            void client.invalidateQueries({ queryKey: adminSidebarCountKeys.all });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: STALE_TIME,
            gcTime: GC_TIME,
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
