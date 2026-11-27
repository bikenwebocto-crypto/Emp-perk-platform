'use client'

import { use, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Pencil, Power, PowerOff, Trash2, Star, Building2, Globe, MapPin, Phone, Mail,
  Clock, Accessibility, ImageIcon, Info, Calendar, AlertTriangle, ExternalLink, Car,
} from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { showToast } from '@/hooks/use-toast'
import {
  useMerchantBranch,
  useUpdateBranch,
  useDeleteBranch,
  useMerchantBranches,
} from '@/hooks/queries/use-merchant-branches'
import {
  BRANCH_STATUS_LABELS,
  BRANCH_STATUS_STYLES,
  BRANCH_TYPE_LABELS,
  BRANCH_DISPLAY_TYPE_LABELS,
  BRANCH_DISPLAY_TYPE_STYLES,
  getBranchDisplayType,
  formatOpeningHours,
  isOnlineBranch,
  isPhysicalBranch,
} from '@/lib/branch-helpers'
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api'
import type { BranchStatus } from '@/types'

const MAP_LIBRARIES: ('places' | 'marker')[] = ['places', 'marker']

function BranchLocationMap({ lat, lng }: { lat: number; lng: number }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-places',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: MAP_LIBRARIES,
  })
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)

  function syncMarker() {
    const map = mapRef.current
    if (!map || !isLoaded) return
    if (!markerRef.current) {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat, lng },
      })
      markerRef.current = marker
    } else {
      markerRef.current.position = { lat, lng }
    }
  }

  useEffect(() => {
    syncMarker()
  }, [lat, lng, isLoaded])

  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.map = null
        markerRef.current = null
      }
    }
  }, [])

  function handleMapLoad(map: google.maps.Map) {
    mapRef.current = map
    map.panTo({ lat, lng })
    map.setZoom(15)
    syncMarker()
  }

  if (loadError) {
    return (
      <div className="flex h-[250px] items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground">
        Map failed to load.
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[250px] items-center justify-center rounded-md bg-muted/30 text-xs text-muted-foreground">
        Loading map…
      </div>
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '250px', borderRadius: '0.5rem' }}
      center={{ lat, lng }}
      zoom={15}
      onLoad={handleMapLoad}
      options={{ mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID }}
    />
  )
}

export default function BranchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: branch, isLoading, refetch } = useMerchantBranch(id)
  const { data: listData } = useMerchantBranches()
  const updateBranch = useUpdateBranch(id)
  const deleteBranch = useDeleteBranch()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showMinBranchesAlert, setShowMinBranchesAlert] = useState(true)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!branch) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium">Branch not found</p>
        <Link href="/merchant/branches">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />Back to Branches
          </Button>
        </Link>
      </div>
    )
  }

  const allBranches = (listData?.data ?? []) as any[]
  const totalBranches = allBranches.length
  const isActive = branch.isActive && branch.status === 'ACTIVE'
  const displayType = getBranchDisplayType(branch)

  async function handleToggleStatus() {
    const newStatus: BranchStatus = isActive ? 'INACTIVE' : 'ACTIVE'
    try {
      await updateBranch.mutateAsync({ status: newStatus })
      showToast({ type: 'success', title: `Branch ${newStatus.toLowerCase()}` })
    } catch (e: any) {
      showToast({ type: 'error', title: 'Action failed', description: e.message })
    }
  }

  async function handleDelete() {
    try {
      await deleteBranch.mutateAsync(id)
      showToast({ type: 'success', title: 'Branch deleted' })
      router.push('/merchant/branches')
    } catch (e: any) {
      showToast({ type: 'error', title: 'Failed to delete branch', description: e.message })
    }
    setConfirmDelete(false)
  }

  async function handleTogglePrimary() {
    try {
      await updateBranch.mutateAsync({ isPrimary: !branch.isPrimary })
      showToast({ type: 'success', title: branch.isPrimary ? 'Primary unset' : 'Set as primary branch' })
    } catch (e: any) {
      showToast({ type: 'error', title: 'Action failed', description: e.message })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <Link href="/merchant/branches">
          <Button variant="ghost" size="icon" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{branch.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BRANCH_STATUS_STYLES[branch.status as BranchStatus]}`}>
              {BRANCH_STATUS_LABELS[branch.status as BranchStatus]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BRANCH_DISPLAY_TYPE_STYLES[displayType]}`}>
              {BRANCH_DISPLAY_TYPE_LABELS[displayType]}
            </span>
            {branch.isPrimary && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Star className="h-3 w-3 fill-amber-500" /> Primary
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Created {new Date(branch.createdAt).toLocaleDateString()} • Updated {new Date(branch.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={branch.isPrimary ? 'outline' : 'default'}
            size="sm"
            onClick={handleTogglePrimary}
            disabled={updateBranch.isPending}
          >
            <Star className={`mr-1 h-4 w-4 ${branch.isPrimary ? 'fill-amber-500' : ''}`} />
            {branch.isPrimary ? 'Unset Primary' : 'Set as Primary'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleStatus} disabled={updateBranch.isPending}>
            {isActive ? (
              <>
                <PowerOff className="mr-1 h-4 w-4" />Deactivate
              </>
            ) : (
              <>
                <Power className="mr-1 h-4 w-4 text-green-600" />Activate
              </>
            )}
          </Button>
          <Link href={`/merchant/branches/${branch.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-1 h-4 w-4" />Edit
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteBranch.isPending || totalBranches <= 1}
            title={totalBranches <= 1 ? 'You must keep at least one branch' : 'Delete this branch'}
          >
            <Trash2 className="mr-1 h-4 w-4" />Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Branch Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Branch Type</p>
                <p className="font-medium">{BRANCH_TYPE_LABELS[branch.branchType as keyof typeof BRANCH_TYPE_LABELS]}</p>
              </div>
              {isOnlineBranch(branch.branchType) && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">Coverage</p>
                    <p className="font-medium">
                      {branch.isNationwide
                        ? 'Nationwide'
                        : branch.deliveryRadiusKm
                        ? `${branch.deliveryRadiusKm} km delivery radius`
                        : 'Pure digital (no delivery)'}
                    </p>
                  </div>
                  {branch.websiteUrl && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Website</p>
                      <a href={branch.websiteUrl} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline break-all">
                        {branch.websiteUrl}
                      </a>
                    </div>
                  )}
                  {branch.addressLine1 && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Origin Address</p>
                      <p>{branch.addressLine1}{branch.addressLine2 ? `, ${branch.addressLine2}` : ''}</p>
                      <p>{branch.city}{branch.state ? `, ${branch.state}` : ''} {branch.postalCode} {branch.country}</p>
                    </div>
                  )}
                </>
              )}
              {isPhysicalBranch(branch.branchType) && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Address</p>
                  <p>{branch.addressLine1}{branch.addressLine2 ? `, ${branch.addressLine2}` : ''}</p>
                  <p>{branch.city}{branch.state ? `, ${branch.state}` : ''} {branch.postalCode}</p>
                  <p>{branch.country}</p>
                </div>
              )}
              {branch.phone && (
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <a href={`tel:${branch.phone}`} className="hover:underline">{branch.phone}</a>
                  </p>
                </div>
              )}
              {branch.email && (
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="flex items-center gap-1">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <a href={`mailto:${branch.email}`} className="hover:underline">{branch.email}</a>
                  </p>
                </div>
              )}
            </div>

            {branch.landmark && (
              <div>
                <p className="text-xs text-muted-foreground">Landmark</p>
                <p className="rounded-md bg-muted/30 p-2 text-sm">{branch.landmark}</p>
              </div>
            )}

            {branch.description && (
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="rounded-md bg-muted/30 p-2 text-sm">{branch.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4" /> Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BRANCH_STATUS_STYLES[branch.status as BranchStatus]}`}>
                {BRANCH_STATUS_LABELS[branch.status as BranchStatus]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Primary</span>
              <span>{branch.isPrimary ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Active</span>
              <span>{branch.isActive ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(branch.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span>{new Date(branch.updatedAt).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {isPhysicalBranch(branch.branchType) && branch.latitude && branch.longitude && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <BranchLocationMap
              lat={Number(branch.latitude)}
              lng={Number(branch.longitude)}
            />
            <div className="flex items-center justify-between rounded-md bg-muted/30 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Coordinates</p>
                <p className="font-mono text-sm">
                  {Number(branch.latitude).toFixed(6)}, {Number(branch.longitude).toFixed(6)}
                </p>
              </div>
              <Link
                href={`https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open in Maps
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {branch.openingHours && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> Opening Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{formatOpeningHours(branch.openingHours)}</p>
          </CardContent>
        </Card>
      )}

      {(branch.parkingInfo || branch.wheelchairAccess) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Accessibility className="h-4 w-4" /> Accessibility
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {branch.wheelchairAccess && (
              <p className="flex items-center gap-2">
                <Accessibility className="h-4 w-4 text-green-600" />
                Wheelchair accessible
              </p>
            )}
            {branch.parkingInfo && (
              <p className="flex items-start gap-2">
                <Car className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span>{branch.parkingInfo}</span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {(branch.storefrontImageUrl || (branch.branchImages && branch.branchImages.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4" /> Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {branch.storefrontImageUrl && (
                <a href={branch.storefrontImageUrl} target="_blank" rel="noreferrer" className="group block">
                  <img
                    src={branch.storefrontImageUrl}
                    alt="Storefront"
                    className="aspect-video w-full rounded-md object-cover transition group-hover:opacity-90"
                  />
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3" /> Storefront
                  </p>
                </a>
              )}
              {branch.branchImages?.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="group block">
                  <img
                    src={url}
                    alt={`Branch image ${i + 1}`}
                    className="aspect-video w-full rounded-md object-cover transition group-hover:opacity-90"
                  />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {totalBranches <= 1 && showMinBranchesAlert && (
        <Alert
          className="mt-3"
          variant="warning"
          title="Branch limit"
          description="You must keep at least one branch. Delete is disabled until you add another."
          icon={AlertTriangle}
          onClose={() => setShowMinBranchesAlert(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this branch?"
        message={`${branch.name} will be removed and will no longer appear in employee search. A branch with redemption history cannot be deleted: deactivate it instead.`}
        confirmLabel="Delete Branch"
        loading={deleteBranch.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
