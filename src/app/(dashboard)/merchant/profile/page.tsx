'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { showToast } from '@/hooks/use-toast'
import { StatusBadge } from '@/components/shared/status-badge'
import { Building2, Save, MapPin, Globe, Phone, Mail, Image as ImageIcon, AlertCircle, Lock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { ImageUploader } from '@/components/shared/ImageUploader'
import type { DeferredFile } from '@/components/shared/ImageUploader'
import { uploadImage, MERCHANT_LOGO_OPTIONS, MERCHANT_COVER_OPTIONS } from '@/lib/upload/image'
import type { UploadImageOptions } from '@/lib/upload/image'
import { BusinessOverview } from '@/components/shared/business-overview'

interface Category {
  id: string
  name: string
  slug: string
}

interface MerchantProfile {
  id: string
  businessName: string
  email: string
  contactName: string
  contactPhone: string | null
  description: string | null
  logoUrl: string | null
  coverImageUrl: string | null
  website: string | null
  categoryId: string | null
  status: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  socialLinks: any
  businessHours: any
  tags: string[]
  category: Category | null
  _count: { offers: number; branches: number; redemptions: number }
}

async function fetchProfile(): Promise<MerchantProfile> {
  const res = await fetch('/api/merchant/profile')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load profile')
  return json.data
}

export default function MerchantProfilePage() {
  const queryClient = useQueryClient()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['merchant-profile'],
    queryFn: fetchProfile,
  })

  const [form, setForm] = useState<Partial<MerchantProfile> | null>(null)
  const [changeReason, setChangeReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Deferred upload state — stores File objects until Save is clicked
  const [pendingLogoFile, setPendingLogoFile] = useState<DeferredFile | null>(null)
  const [pendingCoverFile, setPendingCoverFile] = useState<DeferredFile | null>(null)
  const [uploadingImages, setUploadingImages] = useState(false)

  const update = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/merchant/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to update profile')
      return json
    },
    onSuccess: (json) => {
      queryClient.invalidateQueries({ queryKey: ['merchant-profile'] })
      setChangeReason('')
      setErrors({})
      // Clear pending files after successful save
      setPendingLogoFile(null)
      setPendingCoverFile(null)
      if (json.requiresApproval) {
        showToast({
          type: 'info',
          title: 'Submitted for review',
          description: 'Sensitive changes require admin approval and are pending.',
        })
      } else {
        showToast({ type: 'success', title: 'Profile updated' })
      }
    },
    onError: (e: any) => {
      showToast({ type: 'error', title: 'Update failed', description: e?.message })
    },
  })

  if (isLoading || !profile) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const values: any = form ?? profile
  const setField = (k: string, v: unknown) => {
    setForm((prev) => ({ ...(prev ?? profile), [k]: v } as any))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const payload: Record<string, unknown> = {}
    const changedSensitiveFields: string[] = []

    // ── Step 1: Upload pending images (deferred upload) ──
    let uploadedLogoUrl: string | null = null
    let uploadedCoverUrl: string | null = null

    if (pendingLogoFile || pendingCoverFile) {
      setUploadingImages(true)
      try {
        const uploads: Promise<void>[] = []

        if (pendingLogoFile) {
          uploads.push(
            uploadImage(pendingLogoFile.file, MERCHANT_LOGO_OPTIONS).then((url) => {
              uploadedLogoUrl = url
            })
          )
        }
        if (pendingCoverFile) {
          uploads.push(
            uploadImage(pendingCoverFile.file, MERCHANT_COVER_OPTIONS).then((url) => {
              uploadedCoverUrl = url
            })
          )
        }

        await Promise.all(uploads)
      } catch (err: any) {
        setUploadingImages(false)
        showToast({
          type: 'error',
          title: 'Image upload failed',
          description: err.message || 'Failed to upload images. Please try again.',
        })
        return // Abort save — do not call the API
      }
      setUploadingImages(false)
    }

    // ── Step 2: Build the changed-fields payload ──
    const fieldsToCheck = [
      'contactName',
      'contactPhone',
      'description',
      'website',
      'coverImageUrl',
      'socialLinks',
      'businessHours',
      'tags',
      'businessName',
      'categoryId',
      'logoUrl',
    ]

    for (const f of fieldsToCheck) {
      const a = (profile as any)[f]
      let b = (values as any)[f]

      // Override with freshly uploaded URLs if applicable
      if (f === 'logoUrl' && uploadedLogoUrl) {
        b = uploadedLogoUrl
      }
      if (f === 'coverImageUrl' && uploadedCoverUrl) {
        b = uploadedCoverUrl
      }

      if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
        payload[f] = b
        if (['businessName', 'categoryId', 'logoUrl'].includes(f)) {
          changedSensitiveFields.push(f)
        }
      }
    }

    if (Object.keys(payload).length === 0) {
      showToast({ type: 'info', title: 'No changes to save' })
      return
    }

    const hasSensitiveChanges = changedSensitiveFields.length > 0

    if (hasSensitiveChanges) {
      if (!changeReason || changeReason.trim().length === 0) {
        const fieldNames = changedSensitiveFields.map(f =>
          f === 'businessName' ? 'Business Name' :
          f === 'categoryId' ? 'Category' :
          f === 'logoUrl' ? 'Logo' : f
        ).join(', ')

        setErrors({
          changeReason: 'Please provide a reason for the requested change',
        })
        showToast({
          type: 'error',
          title: 'Change reason required',
          description: `A reason is required when changing: ${fieldNames}`,
        })
        return
      }

      if (changeReason.trim().length < 10) {
        const errorMsg = 'Please provide a more detailed reason (minimum 10 characters)'
        setErrors({ changeReason: errorMsg })
        showToast({
          type: 'error',
          title: 'Reason too short',
          description: errorMsg,
        })
        return
      }

      payload.changeReason = changeReason.trim()
    }

    update.mutate(payload)
  }

  const isPendingApproval = profile.status === 'PENDING' || profile.status === 'PAUSED'

  return (
    <div className="space-y-6">
      {/* ─── Profile Header ─── */}
      <Card className="overflow-hidden pt-0">
        {/* Cover Banner */}
        <div className="relative h-44 w-full overflow-hidden bg-gradient-to-r from-primary/20 via-primary/10 to-muted sm:h-52">
          {profile.coverImageUrl ? (
            <img
              src={profile.coverImageUrl}
              alt="Cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
        </div>

        {/* Profile Info Bar */}
       <div className="px-6 pb-5">
  <div className="flex items-end gap-4">
    {/* Avatar: only this overlaps the cover */}
    <div className="relative -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-[3px] border-background bg-muted shadow-xl sm:-mt-12 sm:h-24 sm:w-24">
      {profile.logoUrl ? (
        <img
          src={profile.logoUrl}
          alt={values.businessName}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xl font-bold text-primary sm:text-2xl">
          {values.businessName?.charAt(0)?.toUpperCase() ?? 'M'}
        </div>
      )}
    </div>

    {/* Name + badges: stay below the cover */}
    <div className="min-w-0 flex-1 pt-3">
      <h2 className="truncate text-lg font-bold leading-tight sm:text-xl">
        {values.businessName ?? 'Merchant Name'}
      </h2>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {values.category && (
          <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
            {values.category.name}
          </span>
        )}
        <StatusBadge status={values.status} />
        {(values.city || values.state) && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {[values.city, values.state].filter(Boolean).join(', ')}
          </span>
        )}
      </div>
    </div>
  </div>
</div>
      </Card>

      {/* ─── Business Overview ─── */}
      <div>
        <h3 className="mb-3 text-lg font-semibold tracking-tight">Business Overview</h3>
        <BusinessOverview merchantId={profile.id} scope="merchant" />
      </div>

      {/* ─── Pending Approval Banner ─── */}
      {isPendingApproval && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Account is {profile.status}</p>
            <p className="text-xs">Some fields are read-only until your account is approved.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ─── Business Information ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" /> Business Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Business Name
                </label>
                <Input
                  value={values.businessName ?? ''}
                  onChange={(e) => setField('businessName', e.target.value)}
                  readOnly={isPendingApproval}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Changing this requires admin approval.
                </p>
                {errors.businessName && <p className="mt-1 text-xs text-destructive">{errors.businessName}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={values.email ?? ''}
                    readOnly
                    className="bg-muted/40 pl-9"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <Lock className="inline h-3 w-3" /> Email cannot be changed here. Go to Settings.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Contact Name *
                </label>
                <Input
                  value={values.contactName ?? ''}
                  onChange={(e) => setField('contactName', e.target.value)}
                />
                {errors.contactName && <p className="mt-1 text-xs text-destructive">{errors.contactName}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Contact Phone
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={values.contactPhone ?? ''}
                    onChange={(e) => setField('contactPhone', e.target.value)}
                    placeholder="+1 555-0100"
                    className="pl-9"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Description
              </label>
              <textarea
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={values.description ?? ''}
                onChange={(e) => setField('description', e.target.value)}
                placeholder="Tell employees about your business…"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Website</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={values.website ?? ''}
                  onChange={(e) => setField('website', e.target.value)}
                  placeholder="https://example.com"
                  className="pl-9"
                />
              </div>
              {errors.website && <p className="mt-1 text-xs text-destructive">{errors.website}</p>}
            </div>
          </CardContent>
        </Card>

        {/* ─── Branding ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImageIcon className="h-5 w-5" /> Branding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Logo Upload — deferred mode */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">
                  Logo
                </label>
                <ImageUploader
                  uploadMode="deferred"
                  onFilesSelected={(files) => {
                    setPendingLogoFile(files[0] ?? null)
                  }}
                  disabled={isPendingApproval}
                  currentCount={values.logoUrl ? 1 : 0}
                  uploadOptions={MERCHANT_LOGO_OPTIONS}
                  acceptedTypes={['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']}
                  maxFileSize={5 * 1024 * 1024}
                  maxFiles={5}
                  allowMultiple={false}
                  placeholder="Drop logo here"
                  showRemaining={false}
                  currentImageUrl={pendingLogoFile ? null : (values.logoUrl ?? null)}
                  previewClassName="h-20 w-20 rounded-full border-2 border-primary/20 object-cover shadow-sm"
                  previewHint="512×512 · Square"
                />
                <p className="text-xs text-muted-foreground">
                  Changing this requires admin approval.
                </p>
                {errors.logoUrl && <p className="text-xs text-destructive">{errors.logoUrl}</p>}
              </div>

              {/* Cover Image Upload — deferred mode */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">
                  Cover Image
                </label>
                <ImageUploader
                  uploadMode="deferred"
                  onFilesSelected={(files) => {
                    setPendingCoverFile(files[0] ?? null)
                  }}
                  disabled={false}
                  currentCount={values.coverImageUrl ? 1 : 0}
                  uploadOptions={MERCHANT_COVER_OPTIONS}
                  acceptedTypes={['image/jpeg', 'image/png', 'image/webp']}
                  maxFileSize={5 * 1024 * 1024}
                  maxFiles={1}
                  allowMultiple={false}
                  placeholder="Drop cover image here"
                  showRemaining={false}
                  currentImageUrl={pendingCoverFile ? null : (values.coverImageUrl ?? null)}
                  previewClassName="h-24 w-full rounded-lg border object-cover shadow-sm"
                  previewHint="1200×400 · Landscape"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Headquarters Address ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="h-5 w-5" /> Headquarters Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              This is the merchant&apos;s primary address. For per-location addresses, go to Branches.
            </p>
            <Input
              value={values.addressLine1 ?? ''}
              readOnly
              className="bg-muted/30"
              placeholder="No address on file"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input value={values.city ?? ''} readOnly className="bg-muted/30" placeholder="City" />
              <Input value={values.state ?? ''} readOnly className="bg-muted/30" placeholder="State" />
              <Input value={values.postalCode ?? ''} readOnly className="bg-muted/30" placeholder="Postal" />
            </div>
            <Input value={values.country ?? ''} readOnly className="bg-muted/30" placeholder="Country" />
          </CardContent>
        </Card>

        {/* ─── Sensitive Changes ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5" /> Sensitive Changes (require approval)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Changes to <strong>Business Name</strong>, <strong>Category</strong>, or <strong>Logo</strong> require
              admin review. Provide a reason below.
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Category
              </label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={values.categoryId ?? ''}
                onChange={(e) => setField('categoryId', e.target.value || null)}
              >
                <option value="">— No category —</option>
                <option value={profile.category?.id}>{profile.category?.name ?? 'Current'}</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Change reason (required for sensitive changes)
              </label>
              <textarea
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Why are you requesting this change?"
              />
              {errors.changeReason && <p className="mt-1 text-xs text-destructive">{errors.changeReason}</p>}
            </div>
          </CardContent>
        </Card>

        {/* ─── Sticky Action Bar ─── */}
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm(null)
              setPendingLogoFile(null)
              setPendingCoverFile(null)
            }}
            disabled={update.isPending || uploadingImages}
          >
            Reset
          </Button>
          <Button type="submit" disabled={update.isPending || uploadingImages}>
            {uploadingImages ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : update.isPending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-1 h-4 w-4" />
                Save Profile
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
