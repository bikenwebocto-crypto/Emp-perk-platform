'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { showToast } from '@/hooks/use-toast'
import { Eye, EyeOff, Check, Circle } from 'lucide-react'

interface Prefs {
  newRedemption: boolean
  offerApproval: boolean
  offerRejection: boolean
  profileChangeRequest: boolean
  issueResponse: boolean
  weeklyReport: boolean
  marketingEmails: boolean
}

const QUERY_KEY = ['merchant-settings-notifications']

const PREF_GROUPS: { title: string; items: { key: keyof Prefs; label: string; hint: string }[] }[] = [
  {
    title: 'Activity',
    items: [
      { key: 'newRedemption', label: 'New redemptions', hint: 'When an employee redeems one of your offers' },
      { key: 'issueResponse', label: 'Issue responses', hint: 'When support replies to an issue you raised' },
    ],
  },
  {
    title: 'Offers & profile',
    items: [
      { key: 'offerApproval', label: 'Offer approved', hint: 'When an admin approves your offer' },
      { key: 'offerRejection', label: 'Offer rejected', hint: 'When an offer needs changes before going live' },
      { key: 'profileChangeRequest', label: 'Profile change updates', hint: 'Status of your profile change requests' },
    ],
  },
  {
    title: 'Reports & marketing',
    items: [
      { key: 'weeklyReport', label: 'Weekly performance report', hint: 'Views, redemptions and trends every Monday' },
      { key: 'marketingEmails', label: 'Product updates & tips', hint: 'Occasional news from Perks & More' },
    ],
  },
]

async function fetchPrefs(): Promise<{ preferences: Prefs }> {
  const res = await fetch('/api/merchant/settings/notifications')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
  return json.data
}

/* ---------- small building blocks ---------- */

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

function Switch({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
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

/* ---------- page ---------- */

export default function MerchantSettingsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchPrefs })

  const [draft, setDraft] = useState<Prefs | null>(null)
  const saved = data?.preferences ?? null
  const values = draft ?? saved
  const isDirty = useMemo(
    () => !!draft && !!saved && (Object.keys(saved) as (keyof Prefs)[]).some((k) => draft[k] !== saved[k]),
    [draft, saved],
  )

  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdError, setPwdError] = useState<string | null>(null)
  const rules = {
    length: pwd.next.length >= 8,
    different: pwd.next.length > 0 && pwd.next !== pwd.current,
    match: pwd.confirm.length > 0 && pwd.next === pwd.confirm,
  }
  const canSubmitPwd = pwd.current.length > 0 && rules.length && rules.different && rules.match

  const savePrefs = useMutation({
    mutationFn: async (preferences: Prefs) => {
      const res = await fetch('/api/merchant/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to save')
      return json
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      setDraft(null)
      showToast({ type: 'success', title: 'Preferences saved' })
    },
    onError: (e: any) => showToast({ type: 'error', title: 'Save failed', description: e?.message }),
  })

  const changePwd = useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const res = await fetch('/api/merchant/settings/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to change password')
      return json
    },
    onSuccess: () => {
      setPwd({ current: '', next: '', confirm: '' })
      setPwdError(null)
      showToast({ type: 'success', title: 'Password changed' })
    },
    onError: (e: any) => setPwdError(e?.message ?? 'Failed to change password'),
  })

  function handlePwdSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPwdError(null)
    if (!canSubmitPwd) return
    changePwd.mutate({ currentPassword: pwd.current, newPassword: pwd.next })
  }

  return (
    <div className="max-w-5xl space-y-10">
      <PageHeader title="Settings" description="Manage your password and how we notify you" />

      {/* ---- Password ---- */}
      <Section
        title="Password"
        description="Use a strong password you don't use anywhere else. You'll stay signed in on this device."
      >
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handlePwdSubmit} className="space-y-4">
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

              {pwdError && <p className="text-sm text-destructive">{pwdError}</p>}

              <div className="flex justify-end border-t pt-4">
                <LoadingButton
                  type="submit"
                  loading={changePwd.isPending}
                  loadingText="Updating…"
                  disabled={!canSubmitPwd}
                >
                  Update password
                </LoadingButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </Section>

      {/* ---- Notifications ---- */}
      <Section
        title="Email notifications"
        description="Choose which emails you receive. Important account and security emails are always sent."
      >
        <Card>
          <CardContent className="pt-6">
            {isLoading || !values ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {PREF_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </h3>
                    <div className="divide-y rounded-md border">
                      {group.items.map(({ key, label, hint }) => (
                        <div key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                          <label htmlFor={`pref-${key}`} className="min-w-0 cursor-pointer">
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">{hint}</p>
                          </label>
                          <Switch
                            id={`pref-${key}`}
                            checked={values[key]}
                            onChange={(v) => setDraft({ ...values, [key]: v })}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-end gap-2 border-t pt-4">
                  {isDirty && (
                    <Button variant="ghost" onClick={() => setDraft(null)} disabled={savePrefs.isPending}>
                      Discard
                    </Button>
                  )}
                  <LoadingButton
                    onClick={() => values && savePrefs.mutate(values)}
                    loading={savePrefs.isPending}
                    loadingText="Saving…"
                    disabled={!isDirty}
                  >
                    Save preferences
                  </LoadingButton>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}