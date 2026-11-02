'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface EmployeeListItem {
  id: string
  firstName: string
  lastName: string
  email: string
  department: string | null
  jobTitle: string | null
  status: string
  employeeId: string | null
  createdAt: string
  invitedAt: string | null
  lastLoginAt: string | null
  joinMethod: string | null
  accountId: string | null
  account: {
    email: string
    role: string
  } | null
  _count: { redemptions: number }
}

export const companyEmployeeKeys = {
  all: ['companyEmployees'] as const,
  list: (filters: Record<string, any>) => ['companyEmployees', 'list', filters] as const,
}

export function useCompanyEmployees(filters?: Record<string, any>) {
  const params = new URLSearchParams()
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize))
  if (filters?.status && filters.status !== 'ALL') params.set('status', filters.status)
  if (filters?.q) params.set('q', filters.q)
  if (filters?.sortBy) params.set('sortBy', filters.sortBy)
  if (filters?.sortOrder) params.set('sortOrder', filters.sortOrder)

  return useQuery({
    queryKey: companyEmployeeKeys.list(filters ?? {}),
    queryFn: async () => {
      const res = await fetch(`/api/company/employees?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch employees')
      const body = await res.json()
      if (!body.success) throw new Error(body.error?.message ?? 'Failed to fetch employees')
      return { data: body.data as EmployeeListItem[], meta: body.meta }
    },
  })
}

export function useCreateCompanyEmployee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/company/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to create employee')
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyEmployeeKeys.all })
      queryClient.invalidateQueries({ queryKey: companyDashboardKeys.all })
    },
  })
}

export function useDeactivateCompanyEmployee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await fetch(`/api/company/employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to deactivate employee')
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyEmployeeKeys.all })
      queryClient.invalidateQueries({ queryKey: companyDashboardKeys.all })
    },
  })
}

export function useReactivateCompanyEmployee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await fetch(`/api/company/employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to reactivate employee')
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyEmployeeKeys.all })
      queryClient.invalidateQueries({ queryKey: companyDashboardKeys.all })
    },
  })
}

export function useUpdateCompanyEmployee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Record<string, unknown>) => {
      const res = await fetch(`/api/company/employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to update employee')
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyEmployeeKeys.all })
      queryClient.invalidateQueries({ queryKey: companyDashboardKeys.all })
    },
  })
}

/**
 * Promote an ACTIVE employee of the signed-in company admin's own company to
 * a Company Admin. The company is taken from the session server-side. On
 * success refresh the employee lists and the company detail (administrators).
 */
export function usePromoteCompanyEmployee() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await fetch(`/api/company/employees/${id}/promote`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to promote employee')
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companyEmployeeKeys.all })
      queryClient.invalidateQueries({ queryKey: companyDashboardKeys.all })
      queryClient.invalidateQueries({ queryKey: ['company-self'] })
      queryClient.invalidateQueries({ queryKey: ['company-detail-employees'] })
      queryClient.invalidateQueries({ queryKey: companyKeys.all })
    },
  })
}

export function useEmployeeExport() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/company/employees/export')
      if (!res.ok) throw new Error('Failed to export employees')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `employees-export-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      return true
    },
  })
}

import { companyDashboardKeys } from './use-company-dashboard'
import { companyKeys } from './use-companies'
