'use client'

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { showToast } from '@/hooks/use-toast'

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

  return (
    <div className="max-w-5xl space-y-10">
      <PageHeader title="Settings" description="Manage how we notify you" />

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