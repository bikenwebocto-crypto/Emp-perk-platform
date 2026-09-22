'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { companyDashboardKeys } from './use-company-dashboard'

export function useCompanyProfile() {
  return useQuery({
    queryKey: ['company', 'profile'],
    queryFn: async () => {
      const res = await fetch('/api/company/settings/profile')
      const body = await res.json()
      if (!res.ok || !body.success) {
        const code = body.error?.code
        const msg = body.error?.message ?? 'Failed to fetch company profile'
        const err = new Error(msg) as Error & { code?: string }
        err.code = code
        throw err
      }
      return body
    },
  })
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/company/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to update profile')
      return body
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company'] }),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await fetch('/api/company/settings/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to change password')
      return body
    },
  })
}

export function useChangeEmail() {
  return useMutation({
    mutationFn: async (data: { newEmail: string; otp?: string }) => {
      const res = await fetch('/api/company/settings/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to change email')
      return body
    },
  })
}

export function useLogoutAllDevices() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/company/settings/logout-all', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to logout all devices')
      return body
    },
  })
}

export function useExportCompanyData() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/company/settings/export-data', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to export data')
      return body
    },
  })
}

export function useRequestCancellation() {
  return useMutation({
    mutationFn: async (data: { reason: string }) => {
      const res = await fetch('/api/company/settings/request-cancellation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error?.message ?? 'Failed to request cancellation')
      return body
    },
  })
}
