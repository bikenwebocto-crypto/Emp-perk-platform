'use client'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/shared/status-badge'
import { SettingsForm } from '@/features/settings/components/settings-form'
import { SecuritySection } from '@/features/settings/components/security-section'
import {
  useUpdateCompanyProfile,
  useChangePassword,
  useLogoutAllDevices,
  useExportCompanyData,
  useRequestCancellation,
  useCompanyProfile,
} from '@/hooks/queries/use-company-settings'
import { showToast } from '@/hooks/use-toast'
import { Download, LogOut, AlertTriangle, Pencil, X, Check } from 'lucide-react'
import { ImageUploader } from '@/components/shared/ImageUploader'
import type { DeferredFile } from '@/components/shared/ImageUploader'
import { uploadImage } from '@/lib/upload/image'
// ⚠️ assumed to exist alongside MERCHANT_LOGO_OPTIONS / MERCHANT_COVER_OPTIONS in '@/lib/upload/image' — confirm exact names
import { COMPANY_LOGO_OPTIONS  } from '@/lib/upload/image'
import { Image as ImageIcon,  Camera } from 'lucide-react'


function LogoCoverSection({
  company,
  onSave,
}: {
  company: Record<string, any> | undefined
  onSave: (data: Record<string, unknown>) => Promise<void>
}) {
  const [pendingLogoFile, setPendingLogoFile] = useState<DeferredFile | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleSave = async () => {
    if (!pendingLogoFile) return
    setUploading(true)
    try {
      const url = await uploadImage(pendingLogoFile.file, COMPANY_LOGO_OPTIONS)
      await onSave({ logoUrl: url })
      setPendingLogoFile(null)
    } catch (err: any) {
      showToast({ type: 'error', title: 'Image upload failed', description: err.message || 'Please try again.' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ImageIcon className="h-5 w-5" /> Logo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-[3px] border-background bg-muted shadow-sm sm:h-24 sm:w-24">
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt={company?.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xl font-bold text-primary sm:text-2xl">
                {company?.name?.charAt(0)?.toUpperCase() ?? 'C'}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <ImageUploader
              uploadMode="deferred"
              onFilesSelected={(files) => setPendingLogoFile(files[0] ?? null)}
              disabled={uploading}
              currentCount={company?.logoUrl ? 1 : 0}
              uploadOptions={COMPANY_LOGO_OPTIONS}
              acceptedTypes={['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']}
              maxFileSize={5 * 1024 * 1024}
              maxFiles={1}
              allowMultiple={false}
              placeholder="Drop logo here"
              showRemaining={false}
              currentImageUrl={pendingLogoFile ? null : (company?.logoUrl ?? null)}
              previewClassName="h-20 w-20 rounded-full border-2 border-primary/20 object-cover shadow-sm"
              previewHint="512×512 · Square"
            />

            {pendingLogoFile && (
              <div className="flex items-center gap-2">
                <LoadingButton onClick={handleSave} loading={uploading} loadingText="Uploading…">
                  <Camera className="mr-1 h-4 w-4" /> Save Logo
                </LoadingButton>
                <Button type="button" variant="outline" onClick={() => setPendingLogoFile(null)} disabled={uploading}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
// ---- Field configs for the two editable sections ----
const DETAILS_FIELDS = [
  { name: 'name', label: 'Company Name', placeholder: 'Company name' },
  { name: 'phone', label: 'Phone', placeholder: 'Phone number' },
  { name: 'website', label: 'Website', placeholder: 'https://example.com' },
  { name: 'industry', label: 'Industry', placeholder: 'e.g. Technology, Healthcare' },
  { name: 'taxId', label: 'Tax ID', placeholder: 'e.g. 12-3456789' },
  { name: 'approvedDomain', label: 'Approved Domain', placeholder: 'e.g. company.com' },
] as const

const ADDRESS_FIELDS = [
  { name: 'addressLine1', label: 'Address Line 1', placeholder: '123 Main Street' },
  { name: 'addressLine2', label: 'Address Line 2', placeholder: 'Suite 100' },
  { name: 'city', label: 'City', placeholder: 'City' },
  { name: 'state', label: 'State', placeholder: 'State' },
  { name: 'postalCode', label: 'Postal Code', placeholder: 'Postal code' },
  { name: 'country', label: 'Country', placeholder: 'Country' },
] as const

type FieldConfig = { name: string; label: string; placeholder: string }

/** One click-to-edit section: read-only display -> pencil icon -> edit form with Save/Cancel */
function EditableSection({
  title,
  description,
  fields,
  company,
  onSave,
  saving,
}: {
  title: string
  description: string
  fields: readonly FieldConfig[]
  company: Record<string, any> | undefined
  onSave: (data: Record<string, unknown>) => Promise<void>
  saving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})

  // Reset local edit state to current company values whenever we open edit mode
  useEffect(() => {
    if (editing) {
      const next: Record<string, string> = {}
      fields.forEach((f) => { next[f.name] = company?.[f.name] ?? '' })
      setValues(next)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data: Record<string, unknown> = {}
    fields.forEach((f) => {
      const v = values[f.name]
      if (v) data[f.name] = v
    })
    await onSave(data)
    setEditing(false)
  }

  return (
    <SettingsForm title={title} description={description}>
      {!editing ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="grid flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.name}>
                  <p className="text-muted-foreground">{f.label}</p>
                  <p className="font-medium">{company?.[f.name] || '—'}</p>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditing(true)}
              title={`Edit ${title}`}
              className="shrink-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <label className="text-sm font-medium">{f.label}</label>
                <Input
                  name={f.name}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ''}
                  onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <LoadingButton type="submit" loading={saving} loadingText="Saving...">
              <Check className="mr-1 h-4 w-4" /> Save
            </LoadingButton>
            <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              <X className="mr-1 h-4 w-4" /> Cancel
            </Button>
          </div>
        </form>
      )}
    </SettingsForm>
  )
}

export default function CompanySettingsPage() {
  const { data: profileData, isLoading: profileLoading, error: profileError } = useCompanyProfile()
  const company = profileData?.data

  const updateProfile = useUpdateCompanyProfile()
  const changePassword = useChangePassword()
  const logoutAll = useLogoutAllDevices()
  const exportData = useExportCompanyData()
  const requestCancel = useRequestCancellation()

  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)

  const handleProfileSave = async (data: Record<string, unknown>) => {
    try {
      await updateProfile.mutateAsync(data)
      showToast({ type: 'success', title: 'Profile updated' })
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed', description: err.message })
      throw err // keep the section open on failure — don't silently exit edit mode
    }
  }

  const handlePasswordChange = async (data: { currentPassword: string; newPassword: string }) => {
    try {
      await changePassword.mutateAsync(data)
      showToast({ type: 'success', title: 'Password changed' })
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed', description: err.message })
    }
  }

  const handleCancel = async () => {
    if (!cancelReason || cancelReason.length < 10) {
      showToast({ type: 'error', title: 'Please provide a reason (at least 10 characters)' })
      return
    }
    try {
      await requestCancel.mutateAsync({ reason: cancelReason })
      showToast({ type: 'success', title: 'Cancellation request submitted' })
      setShowCancel(false)
      setCancelReason('')
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed', description: err.message })
    }
  }

  const billing = company?.billing

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your company account settings</p>
      </div>

      {profileLoading ? (
        <SettingsForm title="Company Details" description="Loading…">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </SettingsForm>
      ) : (
        <>
          {/* EDITABLE — click pencil to edit, Save/Cancel only shown while editing */}
          <LogoCoverSection
            company={company}
            onSave={handleProfileSave}
          />

          <EditableSection
            title="Company Details"
            description="Update your company information"
            fields={DETAILS_FIELDS}
            company={company}
            onSave={handleProfileSave}
            saving={updateProfile.isPending}
          />

          <EditableSection
            title="Address"
            description="Update your company address"
            fields={ADDRESS_FIELDS}
            company={company}
            onSave={handleProfileSave}
            saving={updateProfile.isPending}
          />
        </>
      )}

      {/* READ-ONLY — Account Status (mirrors Super Admin detail page, no action buttons) */}
      <SettingsForm title="Account Status" description="Current status and billing — managed by the platform team">
        {profileLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : profileError ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-destructive">
              We couldn&apos;t load your account status.
            </p>
            <p className="text-muted-foreground">
              {profileError instanceof Error
                ? profileError.message
                : 'Please try again later.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={company?.status ?? 'UNKNOWN'} />
              {company?.city && <span className="text-sm text-muted-foreground">· {company.city}</span>}
              {company?.approvedAt && (
                <span className="text-sm text-muted-foreground">
                  · Activated {new Date(company.approvedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Billing Status</p>
                <p className="font-medium">{billing?.billingStatus ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Plan</p>
                <p className="font-medium">{billing?.plan ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Next Renewal</p>
                <p className="font-medium">
                  {billing?.renewalDate ? new Date(billing.renewalDate).toLocaleDateString() : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Trial</p>
                <p className="font-medium">
                  {billing?.isTrial
                    ? `Until ${billing.trialEndsAt ? new Date(billing.trialEndsAt).toLocaleDateString() : '—'}`
                    : 'No'}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Need a status or billing change? Contact your account manager, or use &quot;Request Account Cancellation&quot; below.
            </p>
          </div>
        )}
      </SettingsForm>

      <SecuritySection onPasswordChange={handlePasswordChange} disabled={changePassword.isPending} loading={changePassword.isPending} />

      {/* <SettingsForm title="Session" description="Manage your active sessions">
        <div className="space-y-3">
          <LoadingButton variant="outline" onClick={() => logoutAll.mutate()} loading={logoutAll.isPending} loadingText="Logging out...">
            <LogOut className="mr-2 h-4 w-4" /> Logout All Devices
          </LoadingButton>
        </div>
      </SettingsForm> */}

      {/* <SettingsForm title="Data" description="Export or manage your company data">
        <div className="space-y-3">
          <LoadingButton variant="outline" onClick={() => exportData.mutate()} loading={exportData.isPending} loadingText="Exporting...">
            <Download className="mr-2 h-4 w-4" /> Export Company Data
          </LoadingButton>
        </div>
      </SettingsForm> */}

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!showCancel ? (
            <Button variant="destructive" onClick={() => setShowCancel(true)}>
              Request Account Cancellation
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border border-destructive/50 p-4">
              <p className="text-sm text-muted-foreground">Please provide a reason for cancellation:</p>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (min. 10 characters)"
              />
              <div className="flex gap-2">
                <LoadingButton variant="destructive" onClick={handleCancel} loading={requestCancel.isPending} loadingText="Submitting...">
                  Confirm Cancellation
                </LoadingButton>
                <Button variant="outline" onClick={() => { setShowCancel(false); setCancelReason('') }}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}