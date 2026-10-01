'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const offerKeys = {
  all: ['merchant-offers'] as const,
  lists: () => [...offerKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...offerKeys.lists(), filters] as const,
  details: () => [...offerKeys.all, 'detail'] as const,
  detail: (id: string) => [...offerKeys.details(), id] as const,
  currentLive: () => [...offerKeys.all, 'current-live'] as const,
  history: () => [...offerKeys.all, 'history'] as const,
}

export function useMerchantOffers(filters?: { page?: number; pageSize?: number; status?: string; q?: string; scope?: string }) {
  const params = new URLSearchParams()
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize))
  if (filters?.status) params.set('status', filters.status)
  if (filters?.q) params.set('q', filters.q)
  if (filters?.scope) params.set('scope', filters.scope)
  const qs = params.toString()

  return useQuery({
    queryKey: offerKeys.list(filters),
    queryFn: async () => {
      const res = await fetch(`/api/merchant/offers${qs ? `?${qs}` : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch offers')
      return json
    },
  })
}

export function useMerchantOfferById(id: string) {
  return useQuery({
    queryKey: offerKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/merchant/offers/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch offer')
      return json
    },
    enabled: !!id,
  })
}

export function useCreateMerchantOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      merchantId,
      ...data
    }: { merchantId?: string } & Record<string, unknown>) => {
      const url = merchantId
        ? `/api/merchant/offers?merchantId=${encodeURIComponent(merchantId)}`
        : '/api/merchant/offers'

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to create offer')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: offerKeys.currentLive() })
    },
  })
}


export function useUpdateMerchantOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      merchantId,
      ...data
    }: { id: string; merchantId?: string } & Record<string, unknown>) => {
      const url = merchantId
        ? `/api/merchant/offers/${id}?merchantId=${encodeURIComponent(merchantId)}`
        : `/api/merchant/offers/${id}`

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update offer')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: offerKeys.details() })
      queryClient.invalidateQueries({ queryKey: offerKeys.currentLive() })
    },
  })
}

export function useBulkDeleteMerchantOffers() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`/api/merchant/offers?ids=${ids.join(',')}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete offers')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: offerKeys.currentLive() })
    },
  })
}

export function useDeleteMerchantOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/merchant/offers/${id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to delete offer')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: offerKeys.currentLive() })
      queryClient.invalidateQueries({ queryKey: offerKeys.details() })
    },
  })
}

export function useRevokeMerchantOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/merchant/offers/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to revoke offer')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: offerKeys.currentLive() })
      queryClient.invalidateQueries({ queryKey: offerKeys.details() })
    },
  })
}

export function useSubmitMerchantOffer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      merchantId,
      ...data
    }: { id: string; merchantId?: string } & Record<string, unknown>) => {
      const url = merchantId
        ? `/api/merchant/offers/${id}/submit?merchantId=${encodeURIComponent(merchantId)}`
        : `/api/merchant/offers/${id}/submit`

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to submit offer')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: offerKeys.currentLive() })
    },
  })
}
