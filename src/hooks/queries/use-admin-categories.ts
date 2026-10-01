'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { categoryKeys } from '@/hooks/queries/use-categories'
import type { CreateCategoryInput, UpdateCategoryInput } from '@/features/categories/schemas'
import type { AdminCategoryRow } from '@/features/categories/types'

export const adminCategoryKeys = {
  all: ['admin-categories'] as const,
  list: () => [...adminCategoryKeys.all, 'list'] as const,
  detail: (id: string) => [...adminCategoryKeys.all, 'detail', id] as const,
}

async function request<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) throw new Error(json.error?.message ?? fallback)
  return json.data as T
}

export function useAdminCategories() {
  return useQuery({
    queryKey: adminCategoryKeys.list(),
    queryFn: () => request<AdminCategoryRow[]>('/api/admin/categories', {}, 'Failed to fetch categories'),
  })
}

export function useAdminCategory(id: string | null) {
  return useQuery({
    queryKey: adminCategoryKeys.detail(id ?? ''),
    queryFn: () => request<AdminCategoryRow>(`/api/admin/categories/${id}`, {}, 'Failed to fetch category'),
    enabled: !!id,
  })
}

function useInvalidateCategories() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: adminCategoryKeys.all })
    // Dropdowns elsewhere (merchant forms, filters) read the public list.
    queryClient.invalidateQueries({ queryKey: categoryKeys.all })
  }
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (data: CreateCategoryInput) =>
      request<AdminCategoryRow>(
        '/api/admin/categories',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
        'Failed to create category',
      ),
    onSuccess: invalidate,
  })
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateCategoryInput) =>
      request<AdminCategoryRow>(
        `/api/admin/categories/${id}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
        'Failed to update category',
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories()
  return useMutation({
    mutationFn: (id: string) =>
      request<{ id: string }>(`/api/admin/categories/${id}`, { method: 'DELETE' }, 'Failed to delete category'),
    onSuccess: invalidate,
  })
}
