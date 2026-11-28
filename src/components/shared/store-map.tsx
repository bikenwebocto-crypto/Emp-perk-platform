'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MapPin, Navigation, Phone, ExternalLink, Star, Clock, Store, Loader2 } from 'lucide-react'
import type { StoreBranch } from '@/hooks/queries/use-store-map'
import { formatBranchAddress, formatBranchName } from '@/lib/format'

const MAP_LIBRARIES: ('places' | 'marker')[] = ['places', 'marker']

interface StoreMapProps {
  branches: StoreBranch[]
  loading?: boolean
  showSearch?: boolean
  showFilters?: boolean
  showDistance?: boolean
  showCurrentLocation?: boolean
  showEditLink?: boolean
  editBasePath?: string
  onBranchSelect?: (branch: StoreBranch) => void
  role: 'employee' | 'company' | 'merchant' | 'admin'
}

function formatDistance(km: number | null): string {
  if (km == null) return ''
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

export function StoreMap({
  branches,
  loading = false,
  showSearch = true,
  showFilters = true,
  showDistance = true,
  showCurrentLocation = true,
  showEditLink = false,
  editBasePath = '/merchant/branches',
  onBranchSelect,
  role,
}: StoreMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-places',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: MAP_LIBRARIES,
  })

  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map())
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [maxDistance, setMaxDistance] = useState<number | null>(null)
  const [openNow, setOpenNow] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [primaryFilter, setPrimaryFilter] = useState<boolean | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  const filteredBranches = branches.filter((b) => {
    if (search) {
      const q = search.toLowerCase()
      const haystack = `${b.merchantName} ${formatBranchName(b)} ${formatBranchAddress(b)}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (categoryFilter && b.category !== categoryFilter) return false
    if (maxDistance != null && b.distanceKm != null && b.distanceKm > maxDistance) return false
    if (openNow && !b.isOpen) return false
    if (statusFilter && b.status !== statusFilter) return false
    if (primaryFilter != null && b.isPrimary !== primaryFilter) return false
    return true
  })

  const categories = [...new Set(branches.map((b) => b.category).filter(Boolean))] as string[]

  const hasLocation = role === 'employee' || role === 'company'

  useEffect(() => {
    if (!hasLocation || !showCurrentLocation) return
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }, [hasLocation, showCurrentLocation])

  const fitBounds = useCallback(() => {
    const map = mapRef.current
    if (!map || filteredBranches.length === 0) return
    const validBranches = filteredBranches.filter((b) => b.latitude != null && b.longitude != null)
    if (validBranches.length === 0) return
    const bounds = new google.maps.LatLngBounds()
    validBranches.forEach((b) => bounds.extend({ lat: b.latitude!, lng: b.longitude! }))
    if (userLocation) bounds.extend(userLocation)
    map.fitBounds(bounds, 60)
  }, [filteredBranches, userLocation])

  useEffect(() => {
    if (!isLoaded) return
    const timer = setTimeout(fitBounds, 200)
    return () => clearTimeout(timer)
  }, [isLoaded, fitBounds])

  function syncMarkers() {
    const map = mapRef.current
    if (!map || !isLoaded) return

    markersRef.current.forEach((marker, id) => {
      if (!filteredBranches.find((b) => b.id === id)) {
        marker.map = null
        markersRef.current.delete(id)
      }
    })

    filteredBranches.forEach((b) => {
      if (!b.latitude || !b.longitude) return
      if (markersRef.current.has(b.id)) {
        markersRef.current.get(b.id)!.position = { lat: b.latitude, lng: b.longitude }
        return
      }
      const pin = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: b.latitude, lng: b.longitude },
        title: b.branchName,
      })
      pin.addListener('click', () => {
        setSelectedId(b.id)
        showInfoWindow(b, pin)
        onBranchSelect?.(b)
      })
      markersRef.current.set(b.id, pin)
    })
  }

  useEffect(() => {
    syncMarkers()
  }, [isLoaded, filteredBranches, onBranchSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isLoaded || !userLocation) return
    if (userMarkerRef.current) {
      userMarkerRef.current.position = userLocation
    } else {
      const el = document.createElement('div')
      el.style.width = '16px'
      el.style.height = '16px'
      el.style.borderRadius = '50%'
      el.style.background = '#4285f4'
      el.style.border = '3px solid white'
      el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)'
      userMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: userLocation,
        content: el,
        title: 'Your location',
      })
    }
  }, [isLoaded, userLocation])

  useEffect(() => {
    if (!selectedId) {
      infoWindowRef.current?.close()
      return
    }
    const marker = markersRef.current.get(selectedId)
    const branch = filteredBranches.find((b) => b.id === selectedId)
    if (marker && branch) {
      showInfoWindow(branch, marker)
      mapRef.current?.panTo({ lat: branch.latitude!, lng: branch.longitude! })
    }
  }, [selectedId, filteredBranches])

  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => (m.map = null))
      markersRef.current.clear()
      if (userMarkerRef.current) userMarkerRef.current.map = null
      infoWindowRef.current?.close()
    }
  }, [])

  function showInfoWindow(branch: StoreBranch, marker: google.maps.marker.AdvancedMarkerElement) {
    if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow()
    const iw = infoWindowRef.current
    let html = `<div style="max-width:260px;font-family:system-ui,sans-serif;font-size:13px">`
    if (branch.logo) html += `<img src="${branch.logo}" style="width:32px;height:32px;border-radius:6px;margin-bottom:6px" />`
    html += `<div style="font-weight:600;margin-bottom:2px">${branch.merchantName}</div>`
    html += `<div style="color:#666;margin-bottom:4px">${formatBranchName(branch)}</div>`
    if (showDistance && branch.distanceKm != null) html += `<div style="margin-bottom:4px">${formatDistance(branch.distanceKm)}</div>`
    html += `<div style="color:#666;margin-bottom:4px">${formatBranchAddress(branch)}</div>`
    if (branch.phone) html += `<div style="margin-bottom:4px"><a href="tel:${branch.phone}" style="color:#1a73e8">${branch.phone}</a></div>`
    if (branch.isOpen) html += `<div style="color:#0d904f;margin-bottom:4px">Open now</div>`
    else html += `<div style="color:#d93025;margin-bottom:4px">Closed</div>`
    if (branch.isPrimary) html += `<div style="color:#f9ab00;margin-bottom:4px">★ Primary</div>`
    if (role === 'employee' && branch.merchantId) {
      html += `<a href="/employee/offers?merchant=${branch.merchantId}" style="color:#1a73e8;text-decoration:none">View Offers →</a>`
    } else if (role === 'company') {
      html += `<a href="/merchant/branches/${branch.id}" style="color:#1a73e8;text-decoration:none">View Merchant →</a>`
    } else if (showEditLink) {
      html += `<a href="${editBasePath}/${branch.id}/edit" style="color:#1a73e8;text-decoration:none">Edit Branch →</a>`
    }
    html += `</div>`
    iw.setContent(html)
    iw.open({ anchor: marker, map: mapRef.current, shouldFocus: false })
  }

  function handleMapLoad(map: google.maps.Map) {
    mapRef.current = map
    syncMarkers()
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        Map failed to load. Check your Google Maps API key.
      </div>
    )
  }

  const uniqueId = 'store-map'

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="relative min-h-[400px] overflow-hidden rounded-lg border">
        {!isLoaded ? (
          <div className="flex h-[400px] items-center justify-center bg-muted/30 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading map…
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%', minHeight: '400px' }}
            center={userLocation ?? (filteredBranches[0]?.latitude ? { lat: filteredBranches[0].latitude!, lng: filteredBranches[0].longitude! } : { lat: 51.5074, lng: -0.1278 })}
            zoom={12}
            onLoad={handleMapLoad}
            options={{ mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID, disableDefaultUI: true, zoomControl: true }}
          />
        )}
      </div>

      <div className="flex max-h-[500px] flex-col rounded-lg border">
        {(showSearch || showFilters) && (
          <div className="space-y-2 border-b p-3">
            {showSearch && (
              <div className="relative">
                <Input
                  placeholder="Search stores…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            )}
            {showFilters && (
              <div className="flex flex-wrap gap-2">
                {hasLocation && (
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={maxDistance ?? ''}
                    onChange={(e) => setMaxDistance(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Any distance</option>
                    <option value="5">Within 5 km</option>
                    <option value="10">Within 10 km</option>
                    <option value="25">Within 25 km</option>
                    <option value="50">Within 50 km</option>
                  </select>
                )}
                {categories.length > 0 && (
                  <select
                    className="rounded border bg-background px-2 py-1 text-xs"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c!}>{c}</option>
                    ))}
                  </select>
                )}
                {hasLocation && (
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} className="h-3 w-3" />
                    Open now
                  </label>
                )}
                {!hasLocation && (
                  <>
                    <select
                      className="rounded border bg-background px-2 py-1 text-xs"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="">All status</option>
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                    <select
                      className="rounded border bg-background px-2 py-1 text-xs"
                      value={primaryFilter === null ? '' : String(primaryFilter)}
                      onChange={(e) => setPrimaryFilter(e.target.value === '' ? null : e.target.value === 'true')}
                    >
                      <option value="">All branches</option>
                      <option value="true">Primary only</option>
                      <option value="false">Non-primary</option>
                    </select>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : filteredBranches.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No stores found.</div>
          ) : (
            filteredBranches.map((b) => (
              <div
                key={b.id}
                className={`cursor-pointer border-b p-3 transition-colors hover:bg-muted/50 ${selectedId === b.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                onClick={() => {
                  setSelectedId(b.id)
                  onBranchSelect?.(b)
                }}
              >
                <div className="flex items-start gap-3">
                  {b.logo ? (
                    <img src={b.logo} alt="" className="h-8 w-8 rounded object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-muted text-muted-foreground">
                      <Store className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="truncate text-sm font-medium">{b.merchantName}</p>
                      {b.isPrimary && <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" />}
                    </div>
                    <p className="break-words text-xs text-muted-foreground">{formatBranchName(b)}</p>
                    {showDistance && b.distanceKm != null && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Navigation className="h-3 w-3" /> {formatDistance(b.distanceKm)}
                      </p>
                    )}
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">{formatBranchAddress(b)}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {b.phone && (
                        <a href={`tel:${b.phone}`} className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary" onClick={(e) => e.stopPropagation()}>
                          <Phone className="h-3 w-3" /> {b.phone}
                        </a>
                      )}
                      <span className={`text-xs font-medium ${b.isOpen ? 'text-green-600' : 'text-red-500'}`}>
                        {b.isOpen ? 'Open' : 'Closed'}
                      </span>
                    </div>
                    {showEditLink && (
                      <a href={`${editBasePath}/${b.id}/edit`} className="mt-1 inline-flex items-center gap-0.5 text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="h-3 w-3" /> Edit Branch
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {filteredBranches.length} of {branches.length} stores
        </div>
      </div>
    </div>
  )
}
