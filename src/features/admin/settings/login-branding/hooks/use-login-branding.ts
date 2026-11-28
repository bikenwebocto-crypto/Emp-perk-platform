'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { showToast } from '@/hooks/use-toast'
import type { LoginBrandingData } from '../schemas/login-branding.schema'

export function useLoginBranding() {
  const queryClient = useQueryClient()
  const queryKey = ['admin', 'settings', 'login-branding']

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch('/api/admin/settings/login-branding')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load branding')
      return json.data as LoginBrandingData
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: Partial<LoginBrandingData>) => {
      const res = await fetch('/api/admin/settings/login-branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save branding')
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      showToast({ type: 'success', title: 'Branding saved successfully' })
    },
    onError: (error: Error) => {
      showToast({ type: 'error', title: error.message })
    },
  })
  return {
    branding: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    saveBranding: mutation.mutateAsync,
    isSaving: mutation.isPending,
  }
}
