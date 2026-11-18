import { useQuery } from '@tanstack/react-query'

export interface StoreBranch {
  id: string
  merchantId: string
  merchantName: string
  branchName: string
  address: {
    line1: string
    line2: string | null
    city: string
    state: string | null
    postalCode: string
    country: string
  }
  latitude: number | null
  longitude: number | null
  phone: string | null
  email: string | null
  category: string | null
  logo: string | null
  distanceKm: number | null
  isOpen: boolean
  openingHours: unknown
  googleMapsUrl: string | null
  isPrimary: boolean
  status: string
  createdAt: string
}

export interface NearbyFilters {
  lat?: number | null
  lng?: number | null
  category?: string | null
  maxDistance?: number | null
  openNow?: boolean
}

export const storeMapKeys = {
  all: ['store-map'] as const,
  nearby: (role: string, filters: NearbyFilters) => [...storeMapKeys.all, role, filters] as const,
  merchant: (merchantId: string) => [...storeMapKeys.all, 'merchant', merchantId] as const,
}

export function useNearbyStores(role: 'employee' | 'company', filters: NearbyFilters = {}) {
  const params = new URLSearchParams()
  if (filters.lat != null) params.set('lat', String(filters.lat))
  if (filters.lng != null) params.set('lng', String(filters.lng))
  if (filters.category) params.set('category', filters.category)
  if (filters.maxDistance != null) params.set('maxDistance', String(filters.maxDistance))
  if (filters.openNow) params.set('openNow', 'true')

  const qs = params.toString()
  const url = role === 'employee' ? `/api/employee/near-stores${qs ? `?${qs}` : ''}` : `/api/company/near-stores${qs ? `?${qs}` : ''}`

  return useQuery<StoreBranch[]>({
    queryKey: storeMapKeys.nearby(role, filters),
    queryFn: async () => {
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to fetch stores')
      return json.data
    },
  })
}

export function useMerchantStoreMap() {
  return useQuery<StoreBranch[]>({
    queryKey: storeMapKeys.merchant('self'),
    queryFn: async () => {
      const res = await fetch('/api/merchant/store-map')
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to fetch branches')
      return json.data
    },
  })
}

export function useAdminMerchantStoreMap(merchantId: string) {
  return useQuery<StoreBranch[]>({
    queryKey: storeMapKeys.merchant(merchantId),
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchants/${merchantId}/store-map`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to fetch branches')
      return json.data
    },
    enabled: !!merchantId,
  })
}

export interface AdminStoreBranch {
  id: string
  merchantId: string
  merchantName: string
  merchantLogo: string | null
  merchantStatus: string
  category: string | null
  branchName: string
  address: {
    line1: string
    line2: string | null
    city: string
    state: string | null
    postalCode: string
    country: string
  }
  latitude: number | null
  longitude: number | null
  phone: string | null
  email: string | null
  openingHours: unknown
  isPrimary: boolean
  status: string
  createdAt: string
}

export interface AdminStoresSummary {
  total: number
  active: number
  primary: number
  inactive: number
  cities: number
}

export interface AdminStoresResponse {
  branches: AdminStoreBranch[]
  summary: AdminStoresSummary
}

export interface AdminStoreFilters {
  categories: string[]
  cities: string[]
  states: string[]
  merchants: { id: string; name: string }[]
}

export interface AdminStoresQueryFilters {
  category?: string | null
  city?: string | null
  state?: string | null
  merchantId?: string | null
  status?: string | null
  isPrimary?: boolean | null
  search?: string | null
}

export const adminStoreKeys = {
  all: ['admin-stores'] as const,
  list: (filters: AdminStoresQueryFilters) => [...adminStoreKeys.all, 'list', filters] as const,
  filters: () => [...adminStoreKeys.all, 'filters'] as const,
}

export function useAdminStores(filters: AdminStoresQueryFilters = {}) {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.city) params.set('city', filters.city)
  if (filters.state) params.set('state', filters.state)
  if (filters.merchantId) params.set('merchantId', filters.merchantId)
  if (filters.status) params.set('status', filters.status)
  if (filters.isPrimary != null) params.set('isPrimary', String(filters.isPrimary))
  if (filters.search) params.set('search', filters.search)

  const qs = params.toString()

  return useQuery<AdminStoresResponse>({
    queryKey: adminStoreKeys.list(filters),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const res = await fetch(`/api/admin/stores${qs ? `?${qs}` : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to fetch stores')
      return json.data
    },
  })
}

export function useAdminStoreFilters() {
  return useQuery<AdminStoreFilters>({
    queryKey: adminStoreKeys.filters(),
    queryFn: async () => {
      const res = await fetch('/api/admin/stores/filters')
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to fetch filters')
      return json.data
    },
  })
}
