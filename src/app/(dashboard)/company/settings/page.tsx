'use client'
import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  useUpdateCompanyProfile,
  useChangePassword,
  useRequestCancellation,
  useCompanyProfile,
} from '@/hooks/queries/use-company-settings'
import { showToast } from '@/hooks/use-toast'
import { AlertTriangle, Pencil, Camera, Globe, ExternalLink, Eye, EyeOff, Check, Circle } from 'lucide-react'
import { ImageUploader } from '@/components/shared/ImageUploader'
import type { DeferredFile } from '@/components/shared/ImageUploader'
import { uploadImage, COMPANY_LOGO_OPTIONS } from '@/lib/upload/image'

type Company = Record<string, any> | undefined
type SaveFn = (data: Record<string, unknown>) => Promise<void>
type FieldConfig = {
  name: string
  label: string
  placeholder: string
  type?: 'text' | 'tel' | 'url'
  wide?: boolean
}

const DETAILS_FIELDS: FieldConfig[] = [
  { name: 'name', label: 'Company name', placeholder: 'Company name' },
  { name: 'phone', label: 'Phone', placeholder: 'Phone number', type: 'tel' },
  { name: 'website', label: 'Website', placeholder: 'https://example.com', type: 'url' },
  { name: 'industry', label: 'Industry', placeholder: 'e.g. Technology, Healthcare' },
  { name: 'taxId', label: 'Tax ID', placeholder: 'e.g. 12-3456789' },
  { name: 'approvedDomain', label: 'Approved domain', placeholder: 'e.g. company.com' },
]

const ADDRESS_FIELDS: FieldConfig[] = [
  { name: 'addressLine1', label: 'Address line 1', placeholder: '123 Main Street', wide: true },
  { name: 'addressLine2', label: 'Address line 2', placeholder: 'Suite 100', wide: true },
  { name: 'city', label: 'City', placeholder: 'City' },
  { name: 'state', label: 'State', placeholder: 'State' },
  { name: 'postalCode', label: 'Postal code', placeholder: 'Postal code' },
  { name: 'country', label: 'Country', placeholder: 'Country' },
]

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—')

/* ================= shared building blocks (same as merchant) ================= */

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-3 md:gap-8">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="md:col-span-2">{children}</div>
    </section>
  )
}

function PasswordInput(props: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        id={props.id}
        type={show ? 'text' : 'password'}
        value={props.value}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        className="pr-10"
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-muted-foreground'}`}>
      {ok ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
      {text}
    </li>
  )
}

/* ================= overview header ================= */

function CompanyOverview({ company }: { company: Company }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted">
          {company?.logoUrl ? (
            <img src={company.logoUrl} alt={company?.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 text-xl font-bold text-primary">
              {company?.name?.charAt(0)?.toUpperCase() ?? 'C'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{company?.name ?? 'Your company'}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusBadge status={company?.status ?? 'UNKNOWN'} />
            {company?.billing?.plan && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                {company.billing.plan}
              </span>
            )}
            {company?.approvedDomain && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" /> @{company.approvedDomain}
              </span>
            )}
            {company?.city && <span>· {company.city}</span>}
            {company?.approvedAt && <span>· Activated {fmtDate(company.approvedAt)}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ================= logo ================= */

function LogoCard({ company, onSave }: { company: Company; onSave: SaveFn }) {
  const [pending, setPending] = useState<DeferredFile | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleSave = async () => {
    if (!pending) return
    setUploading(true)
    try {
      const url = await uploadImage(pending.file, COMPANY_LOGO_OPTIONS)
      await onSave({ logoUrl: url })
      setPending(null)
    } catch (err: any) {
      showToast({ type: 'error', title: 'Image upload failed', description: err?.message || 'Please try again.' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <ImageUploader
          uploadMode="deferred"
          onFilesSelected={(files) => setPending(files[0] ?? null)}
          disabled={uploading}
          currentCount={company?.logoUrl ? 1 : 0}
          uploadOptions={COMPANY_LOGO_OPTIONS}
          acceptedTypes={['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']}
          maxFileSize={5 * 1024 * 1024}
          maxFiles={1}
          allowMultiple={false}
          placeholder="Drop logo here"
          showRemaining={false}
          currentImageUrl={pending ? null : (company?.logoUrl ?? null)}
          previewClassName="h-20 w-20 rounded-full border-2 border-primary/20 object-cover shadow-sm"
          previewHint="512×512 · Square"
        />
        {pending && (
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setPending(null)} disabled={uploading}>
              Cancel
            </Button>
            <LoadingButton onClick={handleSave} loading={uploading} loadingText="Uploading…">
              <Camera className="mr-1 h-4 w-4" /> Save logo
            </LoadingButton>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ================= click-to-edit card (details / address) ================= */

function EditableCard({
  fields,
  company,
  onSave,
  saving,
}: {
  fields: FieldConfig[]
  company: Company
  onSave: SaveFn
  saving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})

  const initial = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.name, company?.[f.name] ?? ''])) as Record<string, string>,
    [fields, company],
  )
  const changed = fields.filter((f) => (values[f.name] ?? '').trim() !== (initial[f.name] ?? ''))
  const isDirty = editing && changed.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isDirty) return
    // only changed fields; emptied field → null so it actually clears
    const data = Object.fromEntries(changed.map((f) => [f.name, (values[f.name] ?? '').trim() || null]))
    try {
      await onSave(data)
      setEditing(false)
    } catch {
      // toast shown by parent — keep form open
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {!editing ? (
          <>
            <div className="mb-4 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setValues(initial)
                  setEditing(true)
                }}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>
            </div>
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              {fields.map((f) => {
                const v = company?.[f.name]
                return (
                  <div key={f.name} className={f.wide ? 'sm:col-span-2' : ''}>
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="mt-0.5 break-words font-medium">
                      {!v ? (
                        <span className="text-muted-foreground">—</span>
                      ) : f.type === 'url' ? (
                        <a
                          href={v}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          {String(v).replace(/^https?:\/\//, '')} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        v
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.name} className={`space-y-1.5 ${f.wide ? 'sm:col-span-2' : ''}`}>
                  <label htmlFor={`f-${f.name}`} className="text-xs font-medium text-muted-foreground">
                    {f.label}
                  </label>
                  <Input
                    id={`f-${f.name}`}
                    type={f.type ?? 'text'}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <LoadingButton type="submit" loading={saving} loadingText="Saving…" disabled={!isDirty}>
                Save changes
              </LoadingButton>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

/* ================= account status (read-only) ================= */

function AccountStatusCard({ company, error }: { company: Company; error: unknown }) {
  if (error) {
    return (
      <Card>
        <CardContent className="space-y-1 pt-6 text-sm">
          <p className="font-medium text-destructive">We couldn&apos;t load your account status.</p>
          <p className="text-muted-foreground">{error instanceof Error ? error.message : 'Please try again later.'}</p>
        </CardContent>
      </Card>
    )
  }

  const b = company?.billing
  const stats = [
    { label: 'Billing status', value: b?.billingStatus ?? '—' },
    { label: 'Plan', value: b?.plan ?? '—' },
    { label: 'Next renewal', value: fmtDate(b?.renewalDate) },
    { label: 'Trial', value: b?.isTrial ? `Until ${fmtDate(b?.trialEndsAt)}` : 'No' },
  ]

  return (
    <Card>
      <CardContent className="pt-6">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md bg-muted/40 p-3">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 text-sm font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Need a status or billing change? Contact your account manager, or use the cancellation request below.
        </p>
      </CardContent>
    </Card>
  )
}

/* ================= password (same as merchant) ================= */

function ChangePasswordCard() {
  const changePwd = useChangePassword()
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)

  const rules = {
    length: pwd.next.length >= 8,
    different: pwd.next.length > 0 && pwd.next !== pwd.current,
    match: pwd.confirm.length > 0 && pwd.next === pwd.confirm,
  }
  const canSubmit = pwd.current.length > 0 && rules.length && rules.different && rules.match

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!canSubmit) return
    try {
      await changePwd.mutateAsync({ currentPassword: pwd.current, newPassword: pwd.next })
      setPwd({ current: '', next: '', confirm: '' })
      showToast({ type: 'success', title: 'Password changed' })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to change password')
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current-password" className="mb-1 block text-xs font-medium text-muted-foreground">
              Current password
            </label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              value={pwd.current}
              onChange={(v) => setPwd((p) => ({ ...p, current: v }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-muted-foreground">
                New password
              </label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                value={pwd.next}
                onChange={(v) => setPwd((p) => ({ ...p, next: v }))}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-xs font-medium text-muted-foreground">
                Confirm new password
              </label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                value={pwd.confirm}
                onChange={(v) => setPwd((p) => ({ ...p, confirm: v }))}
              />
            </div>
          </div>

          {pwd.next.length > 0 && (
            <ul className="space-y-1">
              <Rule ok={rules.length} text="At least 8 characters" />
              <Rule ok={rules.different} text="Different from current password" />
              <Rule ok={rules.match} text="Passwords match" />
            </ul>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end border-t pt-4">
            <LoadingButton type="submit" loading={changePwd.isPending} loadingText="Updating…" disabled={!canSubmit}>
              Update password
            </LoadingButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* ================= danger zone ================= */

function CancellationCard() {
  const requestCancel = useRequestCancellation()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const MIN = 10
  const len = reason.trim().length

  const close = () => {
    setOpen(false)
    setReason('')
  }

  const submit = async () => {
    try {
      await requestCancel.mutateAsync({ reason: reason.trim() })
      showToast({ type: 'success', title: 'Cancellation request submitted' })
      close()
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed', description: err?.message })
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardContent className="pt-6">
        {!open ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Request account cancellation</p>
              <p className="text-xs text-muted-foreground">
                The platform team will review your request before anything is closed.
              </p>
            </div>
            <Button variant="outline" className="border-destructive/50 text-destructive" onClick={() => setOpen(true)}>
              Request cancellation
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> Reason for cancellation
            </div>
            <textarea
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for cancellation (min. 10 characters)"
            />
            <div className="flex items-center justify-between border-t pt-4">
              <span className={`text-xs ${len >= MIN ? 'text-muted-foreground' : 'text-destructive'}`}>
                {len < MIN ? `${MIN - len} more characters needed` : `${len} characters`}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={close} disabled={requestCancel.isPending}>
                  Keep account
                </Button>
                <LoadingButton
                  variant="destructive"
                  onClick={submit}
                  loading={requestCancel.isPending}
                  loadingText="Submitting…"
                  disabled={len < MIN}
                >
                  Confirm cancellation
                </LoadingButton>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ================= page ================= */

export default function CompanySettingsPage() {
  const { data, isLoading, error } = useCompanyProfile()
  const company = data?.data
  const updateProfile = useUpdateCompanyProfile()

  const handleProfileSave: SaveFn = async (payload) => {
    try {
      await updateProfile.mutateAsync(payload)
      showToast({ type: 'success', title: 'Profile updated' })
    } catch (err: any) {
      showToast({ type: 'error', title: 'Failed', description: err?.message })
      throw err
    }
  }

  return (
    <div className="max-w-5xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your company account settings</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <CompanyOverview company={company} />

          <Section title="Logo" description="Shown on your company portal and to your employees.">
            <LogoCard company={company} onSave={handleProfileSave} />
          </Section>

          <Section title="Company details" description="Update your company information.">
            <EditableCard
              fields={DETAILS_FIELDS}
              company={company}
              onSave={handleProfileSave}
              saving={updateProfile.isPending}
            />
          </Section>

          <Section title="Address" description="Update your company address.">
            <EditableCard
              fields={ADDRESS_FIELDS}
              company={company}
              onSave={handleProfileSave}
              saving={updateProfile.isPending}
            />
          </Section>

          <Section title="Account status" description="Current status and billing — managed by the platform team.">
            <AccountStatusCard company={company} error={error} />
          </Section>
        </>
      )}

      <Section
        title="Password"
        description="Use a strong password you don't use anywhere else. You'll stay signed in on this device."
      >
        <ChangePasswordCard />
      </Section>

      <Section title="Danger zone" description="Actions that affect your whole company account.">
        <CancellationCard />
      </Section>
    </div>
  )
}