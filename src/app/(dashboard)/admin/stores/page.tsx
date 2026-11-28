'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  MapPin,
  Search,
  Store,
  Building2,
  Phone,
  Mail,
  Star,
  Clock,
  ExternalLink,
  Loader2,
  Navigation,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { GoogleMap, useJsApiLoader, InfoWindow } from '@react-google-maps/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  useAdminStores,
  useAdminStoreFilters,
  type AdminStoreBranch,
  type AdminStoresQueryFilters,
} from '@/hooks/queries/use-store-map'
import { normalizeOpeningHours, formatOpeningHours } from '@/lib/branch-helpers'
import { formatBranchAddress, formatBranchName } from '@/lib/format'

const MAP_LIBRARIES: ('places' | 'marker')[] = ['places', 'marker']

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' }
const MAP_CENTER = { lat: 20.5937, lng: 78.9629 }

export default function AdminStoresPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [filters, setFilters] = useState<AdminStoresQueryFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, error } = useAdminStores(filters)
  const { data: filterOptions, isLoading: filtersLoading } = useAdminStoreFilters()

  const branches = data?.branches ?? []
  const summary = data?.summary ?? { total: 0, active: 0, primary: 0, inactive: 0, cities: 0 }

  const selectedStore = branches.find((b) => b.id === selectedStoreId) ?? null

  useEffect(() => {
    if (selectedStoreId && !branches.some((branch) => branch.id === selectedStoreId)) {
      setSelectedStoreId(null)
    }
  }, [branches, selectedStoreId])

  const handleSelectStore = useCallback((store: AdminStoreBranch) => {
    setSelectedStoreId((prev) => (prev === store.id ? null : store.id))
  }, [])

  const updateFilter = useCallback((key: keyof AdminStoresQueryFilters, value: string | boolean | null) => {
    setFilters((prev) => {
      const next = { ...prev }
      if (value === null || value === '' || value === false) {
        delete next[key]
      } else {
        ;(next as Record<string, unknown>)[key] = value
      }
      return next
    })
  }, [])

  const clearFilters = useCallback(() => setFilters({}), [])

  const activeFilterCount = Object.values(filters).filter((v) => v != null && v !== '').length

  if (isLoading && !data) {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stores</h1>
        <p className="text-sm text-muted-foreground">
          View and manage all registered merchant branches across the platform
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Total Stores" value={summary.total} icon={Store} color="text-blue-600" />
        <SummaryCard label="Active Stores" value={summary.active} icon={MapPin} color="text-emerald-600" />
        <SummaryCard label="Primary Stores" value={summary.primary} icon={Star} color="text-yellow-600" />
        <SummaryCard label="Inactive Stores" value={summary.inactive} icon={Store} color="text-red-600" />
        <SummaryCard label="Cities Covered" value={summary.cities} icon={Building2} color="text-violet-600" />
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search stores..."
              className="pl-9"
              value={filters.search ?? ''}
              onChange={(e) => updateFilter('search', e.target.value || null)}
            />
          </div>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <FilterSelect
                  label="Category"
                  value={filters.category ?? ''}
                  options={filterOptions?.categories ?? []}
                  loading={filtersLoading}
                  onChange={(v) => updateFilter('category', v || null)}
                />
                <FilterSelect
                  label="City"
                  value={filters.city ?? ''}
                  options={filterOptions?.cities ?? []}
                  loading={filtersLoading}
                  onChange={(v) => updateFilter('city', v || null)}
                />
                <FilterSelect
                  label="State"
                  value={filters.state ?? ''}
                  options={filterOptions?.states ?? []}
                  loading={filtersLoading}
                  onChange={(v) => updateFilter('state', v || null)}
                />
                <FilterSelect
                  label="Merchant"
                  value={filters.merchantId ?? ''}
                  options={(filterOptions?.merchants ?? []).map((m) => m.id)}
                  optionLabels={(filterOptions?.merchants ?? []).reduce(
                    (acc, m) => ({ ...acc, [m.id]: m.name }),
                    {} as Record<string, string>
                  )}
                  loading={filtersLoading}
                  onChange={(v) => updateFilter('merchantId', v || null)}
                />
                <FilterSelect
                  label="Status"
                  value={filters.status ?? ''}
                  options={['ACTIVE', 'INACTIVE', 'CLOSED']}
                  optionLabels={{ ACTIVE: 'Active', INACTIVE: 'Inactive', CLOSED: 'Closed' }}
                  onChange={(v) => updateFilter('status', v || null)}
                />
              </div>
              <div className="mt-4">
                <FilterSelect
                  label="Branch Type"
                  value={filters.isPrimary === true ? 'primary' : filters.isPrimary === false ? 'secondary' : ''}
                  options={['primary', 'secondary']}
                  optionLabels={{ primary: 'Primary Only', secondary: 'Secondary Only' }}
                  onChange={(v) =>
                    updateFilter('isPrimary', v === 'primary' ? true : v === 'secondary' ? false : null)
                  }
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main Content */}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Store List */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {branches.length} store{branches.length !== 1 ? 's' : ''}
          </p>
          <div ref={listRef} className="h-[600px] overflow-y-auto space-y-2 pr-1">
            {branches.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Store className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm font-medium">No stores found</p>
                <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters</p>
              </div>
            ) : (
              branches.map((store) => (
                <StoreCard
                  key={store.id}
                  store={store}
                  isSelected={store.id === selectedStoreId}
                  onSelect={handleSelectStore}
                />
              ))
            )}
          </div>
        </div>

        {/* Map */}
        <div className="h-[600px] rounded-lg overflow-hidden border">
          <StoresMap
            branches={branches}
            selectedStore={selectedStore}
            onSelectStore={handleSelectStore}
          />
        </div>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg bg-muted p-2`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  label,
  value,
  options,
  optionLabels,
  loading,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  optionLabels?: Record<string, string>
  loading?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {optionLabels?.[opt] ?? opt}
          </option>
        ))}
      </select>
    </div>
  )
}

function StoreCard({
  store,
  isSelected,
  onSelect,
}: {
  store: AdminStoreBranch
  isSelected: boolean
  onSelect: (store: AdminStoreBranch) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(store)}
      className={`w-full text-left rounded-lg border p-3 transition-all ${
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-9 w-9 flex-shrink-0">
          {store.merchantLogo ? (
            <AvatarImage src={store.merchantLogo} alt={store.merchantName} />
          ) : null}
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
            {store.merchantName?.charAt(0)?.toUpperCase() ?? '?'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{store.merchantName}</p>
            {store.isPrimary && (
              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                <Star className="mr-0.5 h-2.5 w-2.5 fill-yellow-400 text-yellow-500" />
                Primary
              </Badge>
            )}
          </div>
          <p className="break-words text-xs text-muted-foreground">{formatBranchName(store)}</p>
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {formatBranchAddress(store)}
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={store.status} />
            {store.category && (
              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                {store.category}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    ACTIVE: {
      bg: 'bg-emerald-100 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      label: 'Active',
    },
    INACTIVE: {
      bg: 'bg-yellow-100 dark:bg-yellow-950/40',
      text: 'text-yellow-700 dark:text-yellow-400',
      label: 'Inactive',
    },
    CLOSED: {
      bg: 'bg-red-100 dark:bg-red-950/40',
      text: 'text-red-700 dark:text-red-400',
      label: 'Closed',
    },
  }[status] ?? {
    bg: 'bg-gray-100 dark:bg-gray-950/40',
    text: 'text-gray-700 dark:text-gray-400',
    label: status,
  }

  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

function StoresMap({
  branches,
  selectedStore,
  onSelectStore,
}: {
  branches: AdminStoreBranch[]
  selectedStore: AdminStoreBranch | null
  onSelectStore: (store: AdminStoreBranch) => void
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-places',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: MAP_LIBRARIES,
  })

  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map())
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)

  const selectedLatLng = selectedStore?.latitude != null && selectedStore?.longitude != null
    ? { lat: selectedStore.latitude, lng: selectedStore.longitude }
    : null

  const validBranches = useMemo(
    () => branches.filter((b) => b.latitude != null && b.longitude != null),
    [branches]
  )

  function syncMarkers() {
    const map = mapRef.current
    if (!map || !isLoaded) return

    markersRef.current.forEach((marker, id) => {
      if (!branches.find((b) => b.id === id)) {
        marker.map = null
        markersRef.current.delete(id)
      }
    })

    branches.forEach((b) => {
      if (b.latitude == null || b.longitude == null) return
      if (markersRef.current.has(b.id)) {
        markersRef.current.get(b.id)!.position = { lat: b.latitude, lng: b.longitude }
        return
      }
      const pin = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: b.latitude, lng: b.longitude },
        title: formatBranchName(b),
      })
      pin.addListener('click', () => {
        onSelectStore(b)
      })
      markersRef.current.set(b.id, pin)
    })
  }

  useEffect(() => {
    syncMarkers()
  }, [isLoaded, branches])

  useEffect(() => {
    if (!selectedLatLng || !mapRef.current) return
    mapRef.current.panTo(selectedLatLng)
    mapRef.current.setZoom(15)
  }, [selectedLatLng])

  useEffect(() => {
    if (!selectedStore || !mapRef.current) return
    const marker = markersRef.current.get(selectedStore.id)
    if (!marker) return
    infoWindowRef.current?.close()
    const content = buildInfoWindowContent(selectedStore)
    const iw = new google.maps.InfoWindow({ content, maxWidth: 320 })
    iw.open({ anchor: marker, map: mapRef.current })
    infoWindowRef.current = iw
  }, [selectedStore])

  const fitBounds = useCallback(() => {
    const map = mapRef.current
    if (!map || validBranches.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    validBranches.forEach((b) => bounds.extend({ lat: b.latitude!, lng: b.longitude! }))
    map.fitBounds(bounds, 60)
  }, [validBranches])

  useEffect(() => {
    if (!isLoaded) return
    const timer = setTimeout(fitBounds, 200)
    return () => clearTimeout(timer)
  }, [isLoaded, fitBounds])

  function handleMapLoad(map: google.maps.Map) {
    mapRef.current = map
    syncMarkers()
    fitBounds()
  }

  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => (m.map = null))
      markersRef.current.clear()
      infoWindowRef.current?.close()
    }
  }, [])

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30">
        <p className="text-sm text-destructive">Failed to load Google Maps</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={MAP_CENTER}
      zoom={5}
      onLoad={handleMapLoad}
      options={{
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: true,
      }}
    />
  )
}

function buildInfoWindowContent(store: AdminStoreBranch): string {
  const logo = store.merchantLogo
    ? `<img src="${store.merchantLogo}" alt="" class="h-8 w-8 rounded object-cover" />`
    : `<div class="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">${store.merchantName?.charAt(0) ?? '?'}</div>`

  const hours = normalizeOpeningHours(store.openingHours)
  const hoursList = hours
    .map((h) => {
      if (h.closed) return `<li>${h.day.slice(0, 3)}: Closed</li>`
      return `<li>${h.day.slice(0, 3)}: ${h.open} - ${h.close}</li>`
    })
    .join('')

  return `
    <div style="max-width:280px;font-family:system-ui,sans-serif;font-size:13px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        ${logo}
        <div>
          <div style="font-weight:600;font-size:14px;">${store.merchantName}</div>
          <div style="color:#666;font-size:12px;">${formatBranchName(store)}</div>
        </div>
      </div>
      <div style="color:#555;margin-bottom:8px;">${formatBranchAddress(store)}</div>
      <div style="display:flex;gap:12px;margin-bottom:8px;font-size:12px;color:#555;">
        ${store.phone ? `<span>Phone: ${store.phone}</span>` : ''}
        ${store.email ? `<span>Email: ${store.email}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        ${store.isPrimary ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:11px;">Primary</span>' : ''}
        <span style="background:${store.status === 'ACTIVE' ? '#d1fae5;color:#065f46' : store.status === 'INACTIVE' ? '#fef3c7;color:#92400e' : '#fee2e2;color:#991b1b'};padding:2px 6px;border-radius:4px;font-size:11px;">${store.status}</span>
        ${store.category ? `<span style="background:#e0e7ff;color:#3730a3;padding:2px 6px;border-radius:4px;font-size:11px;">${store.category}</span>` : ''}
      </div>
      <div style="font-size:11px;color:#888;margin-bottom:8px;">
        ${store.latitude?.toFixed(6)}, ${store.longitude?.toFixed(6)}
      </div>
      <div style="margin-bottom:8px;">
        <div style="font-size:11px;font-weight:600;color:#444;margin-bottom:4px;">Opening Hours</div>
        <ul style="list-style:none;padding:0;margin:0;font-size:11px;color:#555;columns:2;">
          ${hoursList}
        </ul>
      </div>
      <a href="/admin/merchants/${store.merchantId}" style="display:inline-flex;align-items:center;gap:4px;color:#2563eb;font-size:12px;text-decoration:none;font-weight:500;">
        Open Merchant →
      </a>
    </div>
  `
}
