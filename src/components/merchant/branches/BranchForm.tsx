'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { GooglePlacesAutocomplete, type PlaceResult } from './GooglePlacesAutocomplete'
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api'

import {
  BRANCH_TYPE_OPTIONS,
  BRANCH_STATUS_OPTIONS,
  DAYS_OF_WEEK,
  DEFAULT_OPENING_HOURS,
  normalizeOpeningHours,
  type BranchOpeningHour,
} from '@/lib/branch-helpers'
import type { BranchStatus, BranchType } from '@/types'
import { showToast } from '@/hooks/use-toast'
import { getEmailError } from '@/lib/validation/credentials'
import { Building2, Globe, Save, MapPin, Clock, Accessibility, ImageIcon, Info, ExternalLink, Loader2 } from 'lucide-react'
export interface BranchFormValues {
  name: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  phone: string
  email: string
  latitude: number | null
  longitude: number | null
  openingHours: BranchOpeningHour[]
  isPrimary: boolean
  branchType: BranchType
  deliveryRadiusKm: number | null
  isNationwide: boolean
  storefrontImageUrl: string
  branchImages: string[]
  parkingInfo: string
  wheelchairAccess: boolean
  landmark: string
  description: string
  websiteUrl: string
  status: BranchStatus
}

type OnlineMode = 'DIGITAL' | 'RADIUS' | 'NATIONWIDE'

// "Digital only" (online store, no delivery, no address) is hidden for now.
// Existing digital branches still load as DIGITAL and are saved unchanged.
const ONLINE_MODE_OPTIONS: { value: OnlineMode; label: string; description: string }[] = [
  { value: 'RADIUS', label: 'Local delivery', description: 'Deliver within a set radius of your base address.' },
  { value: 'NATIONWIDE', label: 'Nationwide', description: 'Ship anywhere in the country from your base address.' },
]

export const EMPTY_BRANCH: BranchFormValues = {
  name: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  phone: '',
  email: '',
  latitude: null,
  longitude: null,
  openingHours: DEFAULT_OPENING_HOURS,
  isPrimary: false,
  branchType: 'IN_STORE',
  deliveryRadiusKm: null,
  isNationwide: false,
  storefrontImageUrl: '',
  branchImages: [],
  parkingInfo: '',
  wheelchairAccess: false,
  landmark: '',
  description: '',
  websiteUrl: '',
  status: 'ACTIVE',
}
interface BranchFormProps {
  initialValues?: Partial<BranchFormValues>
  errors?: Record<string, string>
  submitting?: boolean
  isEdit?: boolean
  onSubmit: (values: BranchFormValues) => void
  onCancel: () => void
}

function updateOpeningHour(
  hours: BranchOpeningHour[],
  day: BranchOpeningHour['day'],
  patch: Partial<BranchOpeningHour>
): BranchOpeningHour[] {
  return hours.map((h) => (h.day === day ? { ...h, ...patch } : h))
}

function deriveOnlineMode(v?: Partial<BranchFormValues>, isEdit = false): OnlineMode {
  if (v?.isNationwide) return 'NATIONWIDE'
  if ((v?.deliveryRadiusKm ?? 0) > 0) return 'RADIUS'
  // Only an existing ONLINE branch saved without delivery is digital; new ones default to Nationwide.
  if (isEdit && v?.branchType === 'ONLINE') return 'DIGITAL'
  return 'NATIONWIDE'
}

function parseGeocoderResult(result: google.maps.GeocoderResult) {
  const find = (...types: string[]) =>
    result.address_components.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? ''
  return {
    addressLine1: [find('street_number'), find('route')].filter(Boolean).join(' '),
    addressLine2: find('sublocality_level_1') || find('sublocality') || find('neighborhood'),
    city: find('locality') || find('administrative_area_level_2'),
    state: find('administrative_area_level_1'),
    postalCode: find('postal_code'),
    country: find('country'),
  }
}

export function BranchForm({ initialValues, errors = {}, submitting, isEdit, onSubmit, onCancel }: BranchFormProps) {
  const [values, setValues] = useState<BranchFormValues>({
    ...EMPTY_BRANCH,
    ...initialValues,
    openingHours: normalizeOpeningHours(initialValues?.openingHours),
  })

  useEffect(() => {
    if (initialValues) {
      setValues((prev) => ({
        ...prev,
        ...initialValues,
        openingHours: normalizeOpeningHours(initialValues.openingHours),
      }))
    }
  }, [initialValues])

  function setField<K extends keyof BranchFormValues>(key: K, value: BranchFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const [onlineMode, setOnlineMode] = useState<OnlineMode>(() => deriveOnlineMode(initialValues, isEdit))
  const [showHours, setShowHours] = useState(false)
  useEffect(() => {
    if (initialValues) setOnlineMode(deriveOnlineMode(initialValues, isEdit))
  }, [initialValues])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Email is optional for a branch, but must be valid when entered.
    if (values.email && getEmailError(values.email)) {
      showToast({ type: 'error', title: getEmailError(values.email)! })
      return
    }
    if (values.websiteUrl && !/^https?:\/\/\S+$/i.test(values.websiteUrl.trim())) {
      showToast({ type: 'error', title: 'Website URL must start with http:// or https://' })
      return
    }
    if (isOnline && onlineMode === 'RADIUS' && !((values.deliveryRadiusKm ?? 0) > 0)) {
      showToast({ type: 'error', title: 'Enter a delivery radius greater than 0 km' })
      return
    }
    // Normalise online coverage fields from the selected mode so the server
    // sees a consistent combination.
    const submitted: BranchFormValues = isOnline
      ? {
          ...values,
          isNationwide: onlineMode === 'NATIONWIDE',
          deliveryRadiusKm: onlineMode === 'RADIUS' ? values.deliveryRadiusKm : null,
        }
      : values
    onSubmit(submitted)
  }

  const isOnline = values.branchType === 'ONLINE'
  const isDelivery = isOnline && onlineMode !== 'DIGITAL'
  const needsAddress = !isOnline || isDelivery

  const [isLocating, setIsLocating] = useState(false)
  const [mapZoom, setMapZoom] = useState<number | null>(null)
  const geocodeRequestIdRef = useRef(0)

  function handlePlaceSelected(place: PlaceResult) {
    setMapZoom(null)
    setValues((prev) => ({
      ...prev,
      addressLine1: place.addressLine1,
      city: place.city,
      state: place.state,
      country: place.country,
      postalCode: place.postalCode,
      latitude: place.latitude,
      longitude: place.longitude,
    }))
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      showToast({
        type: 'error',
        title: 'Geolocation not supported',
        description: 'Your browser does not support location services.',
      })
      return
    }
    if (isLocating) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(7))
        const lng = Number(pos.coords.longitude.toFixed(7))
        setValues((prev) => ({ ...prev, latitude: lat, longitude: lng }))
        setMapZoom(17)
        setIsLocating(false)
        triggerReverseGeocode(lat, lng)
      },
      (err) => {
        setIsLocating(false)
        const messages: Record<number, string> = {
          [err.PERMISSION_DENIED]: 'Location permission was denied. Enable location access to use this feature.',
          [err.POSITION_UNAVAILABLE]: 'Your current location could not be determined.',
          [err.TIMEOUT]: 'Location request timed out. Please try again.',
        }
        showToast({
          type: 'error',
          title: 'Could not get your location',
          description: messages[err.code] ?? 'An unknown error occurred while fetching your location.',
        })
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  function triggerReverseGeocode(lat: number, lng: number) {
    const requestId = ++geocodeRequestIdRef.current
    const geocoder = new google.maps.Geocoder()
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (requestId !== geocodeRequestIdRef.current) return
      if (status !== 'OK' || !results?.length) {
        showToast({
          type: 'info',
          title: 'Address lookup unavailable',
          description: 'Coordinates updated. You can enter the address manually.',
        })
        return
      }
      const parsed = parseGeocoderResult(results[0]!)
      setValues((prev) => ({ ...prev, ...parsed }))
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5" /> Branch Type
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {BRANCH_TYPE_OPTIONS.map((opt) => {
              const active = values.branchType === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors ${
                    active ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="branchType"
                      value={opt.value}
                      checked={active}
                      disabled={isEdit && opt.value === 'ONLINE' && initialValues?.branchType !== 'ONLINE'}
                      onChange={() => setField('branchType', opt.value)}
                      className="h-4 w-4"
                    />
                    <span className="font-medium">{opt.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </label>
              )
            })}
          </div>
          {isEdit && initialValues?.branchType !== 'ONLINE' && (
            <p className="text-xs text-muted-foreground">
              An in-store branch can&apos;t be converted to online. Create a new online branch instead.
            </p>
          )}
          {errors.branchType && <p className="text-xs text-destructive">{errors.branchType}</p>}

          {isOnline && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Globe className="h-4 w-4 text-muted-foreground" /> How do customers get your products?
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {ONLINE_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer flex-col gap-1 rounded-md border bg-background p-2.5 transition-colors ${
                      onlineMode === opt.value ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="radio"
                        name="onlineMode"
                        checked={onlineMode === opt.value}
                        onChange={() => setOnlineMode(opt.value)}
                        className="h-4 w-4"
                      />
                      {opt.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </label>
                ))}
              </div>
              {onlineMode === 'RADIUS' && (
                <div className="max-w-xs">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Delivery radius (km) *</label>
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    value={values.deliveryRadiusKm ?? ''}
                    onChange={(e) => setField('deliveryRadiusKm', e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="e.g. 25"
                  />
                  {errors.deliveryRadiusKm && <p className="mt-1 text-xs text-destructive">{errors.deliveryRadiusKm}</p>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="h-5 w-5" /> Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Branch Name *</label>
            <Input
              value={values.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="e.g. Downtown Flagship"
            />
            {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
          </div>

          {isOnline && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Website URL</label>
              <Input
                type="url"
                value={values.websiteUrl}
                onChange={(e) => setField('websiteUrl', e.target.value)}
                placeholder="https://yourstore.com"
              />
              {errors.websiteUrl && <p className="mt-1 text-xs text-destructive">{errors.websiteUrl}</p>}
            </div>
          )}

          {isOnline && needsAddress && (
            <p className="text-xs text-muted-foreground">
              Base address — used to measure delivery coverage.
            </p>
          )}

          {needsAddress && (
            <>
              <div className="space-y-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Search Address</label>
                <GooglePlacesAutocomplete
                  onPlaceSelected={handlePlaceSelected}
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                  Search for a location to auto-fill the fields below.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUseCurrentLocation}
                  disabled={submitting || isLocating}
                >
                  {isLocating ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="mr-1 h-4 w-4" />
                  )}
                  {isLocating ? 'Locating...' : 'Use Current Location'}
                </Button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Address Line 1 *</label>
                <Input
                  value={values.addressLine1}
                  onChange={(e) => setField('addressLine1', e.target.value)}
                  placeholder="Street address"
                />
                {errors.addressLine1 && <p className="mt-1 text-xs text-destructive">{errors.addressLine1}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Address Line 2</label>
                <Input
                  value={values.addressLine2}
                  onChange={(e) => setField('addressLine2', e.target.value)}
                  placeholder="Suite, unit, etc."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">City *</label>
                  <Input value={values.city} onChange={(e) => setField('city', e.target.value)} />
                  {errors.city && <p className="mt-1 text-xs text-destructive">{errors.city}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">State / Province</label>
                  <Input value={values.state} onChange={(e) => setField('state', e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Postal Code</label>
                  <Input value={values.postalCode} onChange={(e) => setField('postalCode', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Country *</label>
                <Input
                  value={values.country}
                  onChange={(e) => setField('country', e.target.value)}
                  placeholder="e.g. Cyprus"
                />
                {errors.country && <p className="mt-1 text-xs text-destructive">{errors.country}</p>}
              </div>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={values.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+357 22 123456" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                value={values.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="branch@example.com"
              />
              {values.email && getEmailError(values.email) && (
                <p className="mt-1 text-xs text-destructive">{getEmailError(values.email)}</p>
              )}
            </div>
          </div>

          {isOnline && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={values.description}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Short description for employees…"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {needsAddress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5" /> Location Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Click on the map to set a location, or search for an address above. Drag the marker to adjust the precise position.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Latitude *</label>
                <Input
                  type="number"
                  step="0.000001"
                  value={values.latitude ?? ''}
                  readOnly
                  className="bg-muted/30"
                />
                {errors.latitude && <p className="mt-1 text-xs text-destructive">{errors.latitude}</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Longitude *</label>
                <Input
                  type="number"
                  step="0.000001"
                  value={values.longitude ?? ''}
                  readOnly
                  className="bg-muted/30"
                />
                {errors.longitude && <p className="mt-1 text-xs text-destructive">{errors.longitude}</p>}
              </div>
            </div>

            <div className="pt-2">
              <LocationMap
                lat={values.latitude}
                lng={values.longitude}
                zoom={mapZoom ?? undefined}
                onCoordinateChange={(lat, lng) => {
                  setValues((prev) => ({ ...prev, latitude: lat, longitude: lng }))
                  triggerReverseGeocode(lat, lng)
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {isOnline && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showHours} onChange={(e) => setShowHours(e.target.checked)} />
          <span>Set customer support hours (optional)</span>
        </label>
      )}

      {(!isOnline || showHours) && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" /> {isOnline ? 'Support Hours' : 'Opening Hours'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(normalizeOpeningHours(values.openingHours)).map((h) => (
            <div key={h.day} className="grid grid-cols-[100px_1fr_1fr_auto] items-center gap-2 text-sm">
              <span className="font-medium">{h.day.charAt(0) + h.day.slice(1).toLowerCase()}</span>
              <Input
                type="time"
                value={h.open}
                disabled={h.closed}
                onChange={(e) => setField('openingHours', updateOpeningHour(values.openingHours, h.day, { open: e.target.value }))}
                className="h-9"
              />
              <Input
                type="time"
                value={h.close}
                disabled={h.closed}
                onChange={(e) => setField('openingHours', updateOpeningHour(values.openingHours, h.day, { close: e.target.value }))}
                className="h-9"
              />
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={!!h.closed}
                  onChange={(e) =>
                    setField(
                      'openingHours',
                      updateOpeningHour(values.openingHours, h.day, { closed: e.target.checked })
                    )
                  }
                />
                Closed
              </label>
            </div>
          ))}
        </CardContent>
      </Card>
      )}

      {!isOnline && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Accessibility className="h-5 w-5" /> Storefront Details (optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={values.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Short description for employees…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Landmark</label>
            <Input
              value={values.landmark}
              onChange={(e) => setField('landmark', e.target.value)}
              placeholder="e.g. Next to Central Park, opposite the mall"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Parking Info</label>
            <Input
              value={values.parkingInfo}
              onChange={(e) => setField('parkingInfo', e.target.value)}
              placeholder="e.g. Free parking lot behind building"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.wheelchairAccess}
              onChange={(e) => setField('wheelchairAccess', e.target.checked)}
            />
            <span>Wheelchair accessible</span>
          </label>
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ImageIcon className="h-5 w-5" /> {isOnline ? 'Store Image (optional)' : 'Images (optional)'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {isOnline ? 'Logo / Banner Image URL' : 'Storefront Image URL'}
            </label>
            <Input
              value={values.storefrontImageUrl}
              onChange={(e) => setField('storefrontImageUrl', e.target.value)}
              placeholder="https://…"
            />
            {values.storefrontImageUrl && (
              <img
                src={values.storefrontImageUrl}
                alt="Storefront preview"
                className="mt-2 h-32 w-full rounded-md object-cover"
              />
            )}
          </div>
          {!isOnline && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Branch Image URLs (one per line)</label>
            <textarea
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={values.branchImages.join('\n')}
              onChange={(e) =>
                setField(
                  'branchImages',
                  e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                )
              }
              placeholder="https://…&#10;https://…"
            />
          </div>
          )}
        </CardContent>
      </Card>

      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status &amp; Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={values.status}
                onChange={(e) => setField('status', e.target.value as BranchStatus)}
              >
                {BRANCH_STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label} — {s.description}</option>
                ))}
              </select>
            </div>
            {!isOnline && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.isPrimary}
                onChange={(e) => setField('isPrimary', e.target.checked)}
              />
              <span>Set as primary branch for this merchant</span>
            </label>
            )}
          </CardContent>
        </Card>
      )}

      {!isEdit && !isOnline && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isPrimary}
            onChange={(e) => setField('isPrimary', e.target.checked)}
          />
          <span>Set as primary branch for this merchant</span>
        </label>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 sm:-mx-6 sm:px-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <LoadingButton type="submit" loading={submitting} loadingText="Saving…">
          <Save className="mr-1 h-4 w-4" />
          {isEdit ? 'Save Changes' : 'Create Branch'}
        </LoadingButton>
      </div>
    </form>
  )
}

export function valuesToPayload(v: BranchFormValues) {
  return {
    name: v.name.trim(),
    addressLine1: v.addressLine1.trim(),
    addressLine2: v.addressLine2.trim() || null,
    city: v.city.trim(),
    state: v.state.trim() || null,
    postalCode: v.postalCode.trim(),
    country: v.country.trim(),
    phone: v.phone.trim() || null,
    email: v.email.trim() || null,
    latitude: v.latitude,
    longitude: v.longitude,
    openingHours: v.openingHours,
    isPrimary: v.isPrimary,
    branchType: v.branchType,
    deliveryRadiusKm: v.branchType === 'ONLINE' ? v.deliveryRadiusKm : null,
    isNationwide: v.branchType === 'ONLINE' ? v.isNationwide : false,
    storefrontImageUrl: v.storefrontImageUrl.trim() || null,
    branchImages: v.branchImages,
    parkingInfo: v.parkingInfo.trim() || null,
    wheelchairAccess: v.wheelchairAccess,
    landmark: v.landmark.trim() || null,
    description: v.description.trim() || null,
    websiteUrl: v.branchType === 'ONLINE' ? v.websiteUrl.trim() || null : null,
    status: v.status,
  }
}

const DEFAULT_MAP_CENTER = { lat: 51.5074, lng: -0.1278 }

// Static module-level const — required by useJsApiLoader to avoid "LoadScript
// reloaded unintentionally" warnings and loader-option conflicts.
const MAP_LIBRARIES: ('places' | 'marker')[] = ['places', 'marker']

function LocationMap({
  lat,
  lng,
  zoom,
  onCoordinateChange,
}: {
  lat?: number | null
  lng?: number | null
  zoom?: number
  onCoordinateChange: (lat: number, lng: number) => void
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-maps-places',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: MAP_LIBRARIES,
  })
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)

  const hasLocation = lat != null && lng != null
  const center = hasLocation ? { lat, lng } : DEFAULT_MAP_CENTER
  const mapZoom = zoom ?? (hasLocation ? 15 : 3)

  const containerStyle = {
    width: '100%',
    height: '300px',
    borderRadius: '0.5rem',
  }

  function panAndZoom() {
    const map = mapRef.current
    if (!map || lat == null || lng == null) return
    map.panTo({ lat, lng })
    if (zoom != null) map.setZoom(zoom)
  }

  useEffect(() => {
    panAndZoom()
  }, [lat, lng, zoom])

  const onCoordinateChangeRef = useRef(onCoordinateChange)
  onCoordinateChangeRef.current = onCoordinateChange

  // Keep the advanced marker in sync with the current coordinates.
  function syncMarker() {
    const map = mapRef.current
    if (!map || !isLoaded) return

    if (!hasLocation) {
      if (markerRef.current) {
        markerRef.current.map = null
        markerRef.current = null
      }
      return
    }

    if (!markerRef.current) {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat, lng },
        gmpDraggable: true,
      })
      marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return
        const newLat = Number(e.latLng.lat().toFixed(7))
        const newLng = Number(e.latLng.lng().toFixed(7))
        onCoordinateChangeRef.current(newLat, newLng)
      })
      markerRef.current = marker
    } else {
      markerRef.current.position = { lat, lng }
    }
  }

  useEffect(() => {
    syncMarker()
  }, [lat, lng, isLoaded, hasLocation])

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
    panAndZoom()
    syncMarker()
  }

  function handleMapClick(e: google.maps.MapMouseEvent) {
    if (!e.latLng || hasLocation) return
    const newLat = Number(e.latLng.lat().toFixed(7))
    const newLng = Number(e.latLng.lng().toFixed(7))
    onCoordinateChange(newLat, newLng)
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
        Map failed to load. Check your Google Maps API key.
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-md bg-muted/30 text-sm text-muted-foreground">
        Loading map…
      </div>
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
       options={{
    mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
  }}
      zoom={mapZoom}
      onLoad={handleMapLoad}
      onClick={handleMapClick}
    />
  )
}
