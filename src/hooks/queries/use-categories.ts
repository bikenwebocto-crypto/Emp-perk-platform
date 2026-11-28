'use client'

import { useQuery } from '@tanstack/react-query'
import type { Category } from '@/types'

export const categoryKeys = {
  all: ['categories'] as const,
}

export function useCategories() {
  return useQuery({
    queryKey: categoryKeys.all,
    queryFn: async (): Promise<Category[]> => {
      const res = await fetch('/api/categories', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch categories')
      const body = await res.json()
      if (!body.success) throw new Error(body.error?.message ?? 'Failed to fetch categories')
      return body.data
    },
    staleTime: 0,
  })
}
