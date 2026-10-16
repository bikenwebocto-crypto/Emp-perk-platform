'use client'

import type { QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth-store'

/**
 * Forget everything the browser cached about the signed-in user: React Query
 * data (including the current user and its userType/role) and the persisted
 * auth store. Call on logout and right after login so a role change — e.g. an
 * employee promoted to company admin — is never served from stale client state.
 */
export function clearClientSession(queryClient: QueryClient) {
  queryClient.clear()
  useAuthStore.getState().logout()
  try {
    useAuthStore.persist.clearStorage()
  } catch {
    // Storage can be unavailable (private mode); nothing else to clear.
  }
}
