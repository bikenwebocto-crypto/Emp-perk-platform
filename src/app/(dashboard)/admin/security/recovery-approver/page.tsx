'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, History, KeyRound, Loader2, ShieldCheck, UserCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { showToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { Section, formatDate, recoveryApi } from '@/features/admin/mfa-recovery/shared'

// Every admin picks the colleague who may approve their emergency MFA
// recovery. Saving needs a fresh authenticator code: the server checks the
// session's TOTP timestamp (last 5 minutes), so the code is verified here
// with Supabase right before the PUT.

interface ApproverConfig {
  approver: {
    accountId: string
    name: string
    email: string
    assignedAt: string
    available: boolean
    unavailableReason: string | null
  } | null
  candidates: { accountId: string; name: string; email: string; adminRole: string }[]
}

interface AssignmentRow {
  id: string
  approverAccountId: string
  approverName: string | null
  approverEmail: string | null
  assignedAt: string
  isActive: boolean
  revokedAt: string | null
}

const UNAVAILABLE_COPY: Record<string, string> = {
  APPROVER_INACTIVE: 'their account is no longer active',
  APPROVER_NOT_AUTHORIZED: 'their admin role can no longer approve recoveries',
  APPROVER_MFA_MISSING: 'they have no verified authenticator',
  APPROVER_NOT_FOUND: 'their account no longer exists',
}

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin' }

/** Re-verify the caller's own TOTP so the session carries a fresh MFA timestamp. */
async function reverifyAuthenticator(code: string) {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  const factor = (data?.all ?? []).find((f) => f.factor_type === 'totp' && f.status === 'verified')
  if (!factor) throw new Error('No verified authenticator found on your account.')
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
  if (verifyError) throw new Error('That authenticator code is not valid.')
}

export default function RecoveryApproverSettingsPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState('')
  const [code, setCode] = useState('')

  const config = useQuery({
    queryKey: ['recovery-approver-config'],
    queryFn: () => recoveryApi<ApproverConfig>('/api/admin/security/recovery-approver'),
  })
  const history = useQuery({
    queryKey: ['recovery-approver-history'],
    queryFn: () => recoveryApi<AssignmentRow[]>('/api/admin/security/recovery-approver/history'),
  })

  useEffect(() => {
    if (config.data?.approver && !selected) setSelected(config.data.approver.accountId)
  }, [config.data, selected])

  const save = useMutation({
    mutationFn: async () => {
      await reverifyAuthenticator(code)
      return recoveryApi<{ changed: boolean }>('/api/admin/security/recovery-approver', {
        method: 'PUT',
        body: JSON.stringify({ approverAccountId: selected }),
      })
    },
    onSuccess: (res) => {
      showToast({ type: 'success', title: res.changed ? 'Recovery approver saved' : 'No change: already your approver' })
      setCode('')
      void queryClient.invalidateQueries({ queryKey: ['recovery-approver-config'] })
      void queryClient.invalidateQueries({ queryKey: ['recovery-approver-history'] })
    },
    onError: (err: Error) => showToast({ type: 'error', title: 'Could not save approver', description: err.message }),
  })

  const current = config.data?.approver
  const candidates = config.data?.candidates ?? []
  const isChange = !!current && selected !== current.accountId
  const canSubmit = !!selected && (!current || isChange) && /^\d{6}$/.test(code) && !save.isPending

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (canSubmit) save.mutate()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recovery Approver"
        description="Choose the admin who can approve resetting your authenticator if you ever lose it"
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              <Section title="Current approver" icon={UserCheck}>
                {config.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : config.error ? (
                  <p className="text-sm text-red-700">{(config.error as Error).message}</p>
                ) : current ? (
                  <div className="space-y-2">
                    <div className="rounded-md border p-3 text-sm">
                      <div className="font-medium">{current.name}</div>
                      <div className="text-muted-foreground">{current.email}</div>
                      <div className="mt-1 text-xs text-muted-foreground">Assigned {formatDate(current.assignedAt)}</div>
                    </div>
                    {!current.available && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {current.name} cannot approve right now: {UNAVAILABLE_COPY[current.unavailableReason ?? ''] ?? 'they are unavailable'}.
                          Pick another approver below.
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      You have no recovery approver. If you lose your authenticator you will not be able to recover it in the app.
                    </span>
                  </div>
                )}
              </Section>

              <form onSubmit={onSubmit} className="space-y-4 border-t pt-4">
                <Section title={current ? 'Change approver' : 'Set approver'} icon={KeyRound}>
                  {candidates.length === 0 && !config.isLoading ? (
                    <p className="text-sm text-muted-foreground">No other active Super Admin or Admin accounts are available.</p>
                  ) : (
                    <label className="block text-sm font-medium">
                      Approver
                      <select
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="" disabled>Select an admin…</option>
                        {candidates.map((c) => (
                          <option key={c.accountId} value={c.accountId}>
                            {c.name} · {c.email} ({ROLE_LABEL[c.adminRole] ?? c.adminRole})
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block text-sm font-medium">
                    Your authenticator code
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-base tracking-widest"
                    />
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      Required to confirm it is you making this change.
                    </span>
                  </label>
                </Section>
                <Button type="submit" disabled={!canSubmit}>
                  {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {current ? 'Change approver' : 'Save approver'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <Section title="Assignment history" icon={History}>
                {history.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : !history.data?.length ? (
                  <p className="text-sm text-muted-foreground">No approver has been assigned yet.</p>
                ) : (
                  <ul className="divide-y rounded-md border text-sm">
                    {history.data.map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        <div>
                          <div className="font-medium">{h.approverName ?? h.approverAccountId}</div>
                          {h.approverEmail && <div className="text-xs text-muted-foreground">{h.approverEmail}</div>}
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>Assigned {formatDate(h.assignedAt)}</div>
                          {h.isActive
                            ? <span className="font-medium text-green-700">Current</span>
                            : <div>Replaced {formatDate(h.revokedAt)}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-3 p-6 text-sm">
            <h3 className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              How emergency recovery works
            </h3>
            <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
              <li>You request recovery from the sign-in screen and confirm a code sent to your registered email.</li>
              <li>Your approver is notified, signs in with their own authenticator, and approves or rejects.</li>
              <li>Only after both steps is your old authenticator removed so you can register a new one.</li>
            </ol>
            <p className="text-muted-foreground">
              Your approver never sees your password or codes. Changing your approver does not move a request you
              already submitted. If no approver can help, follow the company emergency recovery procedure.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
