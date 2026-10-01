'use client';

import { useQuery } from '@tanstack/react-query';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  userType: string;
  role: string | null;
  companyName?: string | null;
  companyId?: string | null;
  avatarUrl: string | null;
}

export const currentUserKeys = {
  all: ['currentUser'] as const,
};

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKeys.all,
    queryFn: async (): Promise<CurrentUser> => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error('Failed to fetch current user');
      const body = await res.json();
      if (!body.success || !body.data) throw new Error(body.error ?? 'No user data');
      return body.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
