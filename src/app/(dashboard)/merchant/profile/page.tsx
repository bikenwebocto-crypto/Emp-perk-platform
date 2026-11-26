'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { showToast } from '@/hooks/use-toast'
import { showEmailWarnings } from '@/lib/email-warnings.client'
import { StatusBadge } from '@/components/shared/status-badge'
import { Building2, Save, MapPin, Globe, Phone, Mail, Image as ImageIcon, AlertCircle, Lock, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { ImageUploader } from '@/components/shared/ImageUploader'
import type { DeferredFile } from '@/components/shared/ImageUploader'
import { uploadImage, MERCHANT_LOGO_OPTIONS, MERCHANT_COVER_OPTIONS } from '@/lib/upload/image'
import type { UploadImageOptions } from '@/lib/upload/image'
import { BusinessOverview } from '@/components/shared/business-overview'
import { SocialLinksInput } from '@/components/shared/social-links-input'
import { ChangePasswordCard } from '@/components/shared/change-password-card'
import {
  useMerchantChangeRequests,
  RequestedHint,
  ChangeRequestHistory,
} from '@/components/merchant/change-requests-card'
import type { SocialLinks } from '@/lib/social-links'
import { PhoneInput } from '@/components/ui/phone-input'
import { isValidPhone } from '@/lib/phone'
import { useCategories } from '@/hooks/queries/use-categories'

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

const SECTION = 'space-y-5 rounded-xl border bg-card p-6'
const LABEL = 'mb-1.5 block text-sm font-medium'
const LABEL_MUTED = 'text-xs text-muted-foreground'

/** Dashed tile from the design: thumbnail + title + spec; click to pick a file. */
function BrandTile({
  title,
  hint,
  imageUrl,
  accept,
  maxBytes,
  disabled,
  onFile,
}: {
  title: string
  hint: string
  imageUrl: string | null
  accept: string
  maxBytes: number
  disabled?: boolean
  onFile: (f: DeferredFile | null) => void
}) {
  return (
    <label
      className={`flex items-center gap-4 rounded-lg border border-dashed p-4 transition-colors ${
        disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-muted/40'
      }`}
    >
      <input
        type="file"
        className="sr-only"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          if (file.size > maxBytes) {
            showToast({
              type: 'error',
              title: 'File too large',
              description: `Maximum size is ${Math.round(maxBytes / 1024) >= 1024 ? `${maxBytes / 1024 / 1024} MB` : `${Math.round(maxBytes / 1024)} KB`}.`,
            })
            return
          }
          onFile({ file, previewUrl: URL.createObjectURL(file) })
        }}
      />
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {imageUrl && <img src={imageUrl} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="whitespace-pre-line text-xs text-muted-foreground">{hint}</p>
      </div>
    </label>
  )
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

  const { pending: pendingRequest, recent: recentRequests } = useMerchantChangeRequests()
  const requested = pendingRequest?.requestedValues ?? {}
  const { data: categories } = useCategories()
  // Business name / category are shown as text; this reveals their inputs.
  const [editingIdentity, setEditingIdentity] = useState(false)

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
      queryClient.invalidateQueries({ queryKey: ['merchant-change-requests'] })
      setChangeReason('')
      setErrors({})
      setForm(null)
      setEditingIdentity(false)
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
      showEmailWarnings(json)
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
  const setSocialLink = (platform: keyof SocialLinks, v: string) => {
    setForm((prev) => {
      const base = prev ?? profile
      const current = (base?.socialLinks ?? {}) as SocialLinks
      return { ...base, socialLinks: { ...current, [platform]: v } }
    })
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
      // "We add https:// for you"
      if (f === 'website' && typeof b === 'string') {
        b = b.trim()
        if (b && !/^https?:\/\//i.test(b)) b = `https://${b}`
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
  const hasSensitiveDraft =
    !!pendingLogoFile ||
    (values.businessName ?? '') !== (profile.businessName ?? '') ||
    (values.categoryId ?? null) !== (profile.categoryId ?? null)

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
      {/* <div>
        <h3 className="mb-3 text-lg font-semibold tracking-tight">Business Overview</h3>
        <BusinessOverview merchantId={profile.id} scope="merchant" />
      </div> */}

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
        {/* ─── Business information ─── */}
        <section className={SECTION}>
          <h3 className="text-lg font-semibold">Business information</h3>

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {/* Business name — needs admin approval */}
            <div>
              <p className={LABEL_MUTED}>Business name</p>
              {editingIdentity ? (
                <Input
                  className="mt-1"
                  value={values.businessName ?? ''}
                  onChange={(e) => setField('businessName', e.target.value)}
                  readOnly={isPendingApproval}
                />
              ) : (
                <p className="mt-0.5 text-sm font-medium">{profile.businessName}</p>
              )}
              {requested.businessName && <RequestedHint text={requested.businessName} />}
              {errors.businessName && <p className="mt-1 text-xs text-destructive">{errors.businessName}</p>}
            </div>

            {/* Category — needs admin approval */}
            <div>
              <p className={LABEL_MUTED}>Category</p>
              {editingIdentity ? (
                <select
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={values.categoryId ?? ''}
                  onChange={(e) => setField('categoryId', e.target.value || null)}
                >
                  <option value="">— No category —</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <p className="mt-0.5 text-sm font-medium">{profile.category?.name ?? '—'}</p>
              )}
              {'categoryId' in requested && (
                <RequestedHint text={pendingRequest?.requestedCategoryName ?? 'No category'} />
              )}
            </div>
          </div>

          {!editingIdentity && !isPendingApproval && (
            <button
              type="button"
              onClick={() => setEditingIdentity(true)}
              className="-mt-2 text-xs font-medium text-primary hover:underline"
            >
              Request a name or category change
            </button>
          )}

          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Website</label>
              <Input
                value={values.website ?? ''}
                onChange={(e) => setField('website', e.target.value)}
                placeholder="example.com"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">We add https:// for you</p>
              {errors.website && <p className="mt-1 text-xs text-destructive">{errors.website}</p>}
            </div>
            <div>
              <SocialLinksInput
                value={values.socialLinks}
                onChange={setSocialLink}
                labelClassName={LABEL}
              />
              {errors.socialLinks && <p className="mt-1 text-xs text-destructive">{errors.socialLinks}</p>}
            </div>
          </div>

          <div>
            <label className={LABEL}>Description</label>
            <Input
              value={values.description ?? ''}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Tell employees about your business…"
            />
          </div>
        </section>

        {/* ─── Contact details ─── */}
        <section className={SECTION}>
          <div>
            <h3 className="text-lg font-semibold">Contact details</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Only Perks &amp; More sees this. It is not shown in the app.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={LABEL}>Contact person</label>
              <Input
                value={values.contactName ?? ''}
                onChange={(e) => setField('contactName', e.target.value)}
              />
              {errors.contactName && <p className="mt-1 text-xs text-destructive">{errors.contactName}</p>}
            </div>
            <div>
              <label className={LABEL}>Contact email</label>
              <Input value={values.account?.email ?? ''} readOnly title="Linked to your account and cannot be changed" />
            </div>
            <div>
              <label className={LABEL}>Phone</label>
              <PhoneInput
                value={values.contactPhone ?? ''}
                onChange={(v) => setField('contactPhone', v)}
                invalid={!!errors.contactPhone}
                placeholder="99 123456"
              />
              {errors.contactPhone && <p className="mt-1 text-xs text-destructive">{errors.contactPhone}</p>}
            </div>
          </div>
        </section>

        {/* ─── Branding ─── */}
        <section className={SECTION}>
          <h3 className="text-lg font-semibold">Branding</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <BrandTile
              title={'logoUrl' in requested ? 'Logo · requested new logo' : 'Logo'}
              hint={'Square, at least 400 × 400 px, JPG, PNG or WebP,\nup to 500 KB'}
              imageUrl={pendingLogoFile?.previewUrl ?? requested.logoUrl ?? values.logoUrl ?? null}
              accept="image/jpeg,image/png,image/webp"
              maxBytes={500 * 1024}
              disabled={isPendingApproval}
              onFile={setPendingLogoFile}
            />
            <BrandTile
              title="Cover image"
              hint="1200 × 400 px landscape, JPG, PNG or WebP"
              imageUrl={pendingCoverFile?.previewUrl ?? values.coverImageUrl ?? null}
              accept="image/jpeg,image/png,image/webp"
              maxBytes={5 * 1024 * 1024}
              onFile={setPendingCoverFile}
            />
          </div>
          {errors.logoUrl && <p className="text-xs text-destructive">{errors.logoUrl}</p>}
        </section>

        {/* ─── Reason (only when a change needs admin approval) ─── */}
        {hasSensitiveDraft && (
          <section className={SECTION}>
            <div>
              <h3 className="text-lg font-semibold">Reason for change</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Business name, category and logo changes are reviewed by our team before they go live.
              </p>
            </div>
            <textarea
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Why are you requesting this change?"
            />
            {errors.changeReason && <p className="text-xs text-destructive">{errors.changeReason}</p>}
          </section>
        )}

        {/* ─── Latest change request outcome ─── */}
        <ChangeRequestHistory requests={recentRequests} />

        {/* ─── Sticky Action Bar ─── */}
        <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm(null)
              setPendingLogoFile(null)
              setPendingCoverFile(null)
              setEditingIdentity(false)
              setChangeReason('')
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

      {/* ─── Password ─── */}
      <ChangePasswordCard />
    </div>
  )
}
