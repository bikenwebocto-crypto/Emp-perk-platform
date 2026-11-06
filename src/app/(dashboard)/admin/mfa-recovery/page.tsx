'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  CheckCircle2, Eye, History, Loader2, Mail, Phone, PhoneCall, RefreshCw, ShieldAlert, ShieldCheck, X, XCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { showToast } from '@/hooks/use-toast'
import { cn } from '@/utils/cn'
import {
  ContactNumber, Field, HistoryTimeline, OtpStatusSection, ROLE_LABELS, STATUS_LABELS, Section, StatusBadge,
  DETAIL_POLL_MS, LIST_POLL_MS, formatDate, isUserPending, recoveryApi, shortId,
  type HistoryEntry, type RecoveryDetail, type RecoveryListResponse, type RecoveryStatus,
} from '@/features/admin/mfa-recovery/shared'

// Super Admin review of STANDARD (merchant / company admin) MFA recovery
// requests. Emergency super-admin requests are not listed here: only their
// designated approver sees those (/admin/recovery-approvals).

type Bucket = 'ALL' | 'pending' | 'underReview' | 'completed' | 'rejected'

// Keep in sync with SUMMARY_BUCKETS in services/mfa-recovery.service.ts.
const BUCKET_STATUSES: Record<Exclude<Bucket, 'ALL'>, RecoveryStatus[]> = {
  pending: ['PENDING'],
  underReview: ['UNDER_REVIEW', 'OTP_SENT', 'OTP_VERIFIED', 'APPROVED', 'MFA_RESET', 'AWAITING_NEW_MFA'],
  completed: ['COMPLETED'],
  rejected: ['REJECTED'],
}

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function AdminMfaRecoveryPage() {
  const { page, setPage, pageSize, resetPage } = useTablePagination({ defaultPageSize: 20 })
  const [search, setSearch] = useState('')
  const [bucket, setBucket] = useState<Bucket>('ALL')
  const [status, setStatus] = useState<RecoveryStatus | 'ALL'>('ALL')
  const [role, setRole] = useState('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search)

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: 'requestedAt', order: 'desc' })
    if (debouncedSearch.trim()) p.set('q', debouncedSearch.trim())
    // A specific status wins over the summary-card bucket.
    if (status !== 'ALL') p.set('status', status)
    else if (bucket !== 'ALL') p.set('status', BUCKET_STATUSES[bucket].join(','))
    if (role !== 'ALL') p.set('role', role)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    return p
  }, [page, pageSize, debouncedSearch, status, bucket, role, from, to])

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['admin-mfa-recovery', params.toString()],
    queryFn: () => recoveryApi<RecoveryListResponse>(`/api/admin/mfa-recovery?${params.toString()}`),
    // Users verify OTPs / enrol new MFA in their own browser; keep the table current.
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => isUserPending(r.status)) ? LIST_POLL_MS : false,
    refetchOnWindowFocus: true,
  })

  const rows = data?.items ?? []
  const summary = data?.summary
  const pagination = data?.pagination
  const hasFilters = !!(search || status !== 'ALL' || role !== 'ALL' || from || to || bucket !== 'ALL')

  function selectBucket(b: Bucket) {
    setBucket((prev) => (prev === b ? 'ALL' : b))
    setStatus('ALL')
    resetPage()
  }

  function clearFilters() {
    setSearch('')
    setBucket('ALL')
    setStatus('ALL')
    setRole('ALL')
    setFrom('')
    setTo('')
    resetPage()
  }

  const cards: { key: Bucket; label: string; count: number | undefined; dot?: string }[] = [
    { key: 'ALL', label: 'Total Requests', count: summary?.total },
    { key: 'pending', label: 'Pending Requests', count: summary?.pending, dot: 'bg-blue-500' },
    { key: 'underReview', label: 'Under Review', count: summary?.underReview, dot: 'bg-amber-500' },
    { key: 'completed', label: 'Completed Requests', count: summary?.completed, dot: 'bg-green-500' },
    { key: 'rejected', label: 'Rejected Requests', count: summary?.rejected, dot: 'bg-red-500' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="MFA Recovery Requests"
        description="Merchants and company admins who lost access to their authenticator app"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-1 h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => selectBucket(c.key)}
            aria-pressed={bucket === c.key}
            className={cn(
              'rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50',
              bucket === c.key && 'border-primary ring-1 ring-primary',
            )}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {c.dot && <span className={cn('h-2 w-2 rounded-full', c.dot)} />}
              {c.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {c.count ?? <Skeleton className="mt-1 h-7 w-10" />}
            </div>
          </button>
        ))}
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder="Search email, phone or request ID..."
        filters={[
          {
            key: 'role',
            label: 'All roles',
            value: role,
            options: [{ label: 'Merchant', value: 'MERCHANT' }, { label: 'Company Admin', value: 'COMPANY_ADMIN' }],
            onChange: (v) => { setRole(v); resetPage() },
          },
          {
            key: 'status',
            label: 'All statuses',
            value: status,
            options: (Object.keys(STATUS_LABELS) as RecoveryStatus[]).map((s) => ({ label: STATUS_LABELS[s], value: s })),
            onChange: (v) => { setStatus(v as RecoveryStatus | 'ALL'); setBucket('ALL'); resetPage() },
          },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => { setFrom(e.target.value); resetPage() }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              To
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => { setTo(e.target.value); resetPage() }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
            )}
          </div>
        }
      />

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-red-700">{(error as Error).message}</CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldCheck className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No recovery requests found</p>
            {hasFilters && <p className="mt-1 text-xs text-muted-foreground">Try clearing the filters.</p>}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">Request ID</th>
                  <th className="px-4 py-3">User Name</th>
                  <th className="px-4 py-3">Account Role</th>
                  <th className="px-4 py-3">Registered Email</th>
                  <th className="px-4 py-3">Contact Number</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs" title={r.id}>{shortId(r.id)}</td>
                    <td className="px-4 py-3 font-medium">{r.displayName ?? '—'}</td>
                    <td className="px-4 py-3">{ROLE_LABELS[r.accountRole] ?? r.accountRole}</td>
                    <td className="px-4 py-3">{r.registeredEmail}</td>
                    <td className="px-4 py-3">
                      <ContactNumber phone={r.registeredPhone} compact />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(r.requestedAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setSelectedId(r.id) }}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-muted-foreground">
                Page {page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <RequestDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}

// ─── Detail drawer ──────────────────────────────────────────────────────────

function RequestDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={!!id} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-background shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          {id ? <DrawerBody key={id} id={id} /> : <DialogTitle className="sr-only">Recovery request</DialogTitle>}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}

type Pending = null | 'approve' | 'reject'

function DrawerBody({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Pending>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [contactNote, setContactNote] = useState('')

  const detailQuery = useQuery({
    queryKey: ['admin-mfa-recovery-detail', id],
    queryFn: () => recoveryApi<RecoveryDetail>(`/api/admin/mfa-recovery/${id}`),
    refetchInterval: (query) => (isUserPending(query.state.data?.status) ? DETAIL_POLL_MS : false),
    refetchOnWindowFocus: true,
  })
  const historyQuery = useQuery({
    queryKey: ['admin-mfa-recovery-history', id],
    queryFn: () => recoveryApi<HistoryEntry[]>(`/api/admin/mfa-recovery/${id}/history`),
  })

  // When polling sees the status change, refresh the timeline and the table too.
  const liveStatus = detailQuery.data?.status
  useEffect(() => {
    if (!liveStatus) return
    void queryClient.invalidateQueries({ queryKey: ['admin-mfa-recovery-history', id] })
    void queryClient.invalidateQueries({ queryKey: ['admin-mfa-recovery'] })
  }, [liveStatus, id, queryClient])

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-mfa-recovery'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-mfa-recovery-detail', id] })
    void queryClient.invalidateQueries({ queryKey: ['admin-mfa-recovery-history', id] })
  }

  const action = useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: string; body?: unknown; success: string }) =>
      recoveryApi<unknown>(`/api/admin/mfa-recovery/${id}/${path}`, { method, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: (_data, vars) => {
      showToast({ type: 'success', title: vars.success })
      setPending(null)
      setRejectReason('')
      setContactNote('')
      refreshAll()
    },
    onError: (err: Error) => {
      showToast({ type: 'error', title: 'Action failed', description: err.message })
      refreshAll()
    },
  })

  const d = detailQuery.data
  if (detailQuery.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <DialogTitle className="sr-only">Loading recovery request</DialogTitle>
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }
  if (!d) {
    return (
      <div className="p-6 text-sm text-red-700">
        <DialogTitle className="sr-only">Recovery request</DialogTitle>
        {(detailQuery.error as Error | null)?.message ?? 'Could not load this request.'}
      </div>
    )
  }

  const busy = action.isPending
  const canReview = d.status === 'PENDING'
  const canSendOtp = ['PENDING', 'UNDER_REVIEW', 'OTP_SENT'].includes(d.status)
  const canApprove = d.status === 'OTP_VERIFIED' || d.status === 'APPROVED' // APPROVED = retry a failed removal
  const canReject = ['PENDING', 'UNDER_REVIEW', 'OTP_SENT', 'OTP_VERIFIED'].includes(d.status)
  const logContact = () => action.mutate({ path: 'contact', body: { note: contactNote }, success: 'Contact logged' })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-6 pr-12">
        <DialogTitle className="text-lg font-semibold">{d.displayName ?? d.registeredEmail}</DialogTitle>
        <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono text-xs" title={d.id}>#{shortId(d.id)}</span>
          <span>·</span>
          <span>{ROLE_LABELS[d.accountRole] ?? d.accountRole}</span>
          <StatusBadge status={d.status} />
        </DialogDescription>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <Section title="Account">
          <dl className="space-y-1.5">
            <Field label="User">{d.displayName ?? '—'}</Field>
            <Field label="Role">{ROLE_LABELS[d.accountRole] ?? d.accountRole}</Field>
            <Field label="Account ID"><span className="font-mono text-xs">{d.accountId}</span></Field>
            <Field label="Requested">{formatDate(d.requestedAt)}</Field>
            <Field label="Expires">{formatDate(d.expiresAt)}</Field>
          </dl>
        </Section>

        <Section title="Contact details" icon={Phone}>
          <dl className="space-y-1.5">
            <Field label="Email">
              <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{d.registeredEmail}</span>
            </Field>
          </dl>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Registered contact number. Call to verify the user before sending the email OTP.</p>
            <ContactNumber phone={d.registeredPhone} />
            {canReject && d.registeredPhone && (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={contactNote}
                  onChange={(e) => setContactNote(e.target.value)}
                  placeholder="Optional call note (e.g. identity confirmed, security questions passed)"
                  rows={2}
                  maxLength={500}
                />
                <Button variant="outline" size="sm" disabled={busy} onClick={logContact}>
                  <PhoneCall className="mr-1 h-4 w-4" />
                  Log contact with user
                </Button>
              </div>
            )}
          </div>
        </Section>

        <Section title="Recovery reason">
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{d.reason}</p>
        </Section>

        <Section title="Email OTP status" icon={Mail}>
          <OtpStatusSection detail={d} />
        </Section>

        {(d.rejectionReason || d.resetError || d.resetAt || d.completedAt) && (
          <Section title="Outcome">
            <dl className="space-y-1.5">
              {d.approvedAt && <Field label="Approved">{formatDate(d.approvedAt)}</Field>}
              {d.resetAt && <Field label="MFA removed">{formatDate(d.resetAt)}</Field>}
              {d.completedAt && <Field label="Completed">{formatDate(d.completedAt)}</Field>}
              {d.rejectionReason && <Field label="Rejection reason">{d.rejectionReason}</Field>}
              {d.resetError && <Field label="Removal error"><span className="text-red-700">{d.resetError}</span></Field>}
            </dl>
          </Section>
        )}

        <Section title="Recovery history" icon={History}>
          <HistoryTimeline entries={historyQuery.data} isLoading={historyQuery.isLoading} />
        </Section>
      </div>

      <div className="space-y-3 border-t bg-muted/20 p-4">
        {pending === 'approve' ? (
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="flex items-start gap-2 font-medium text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Remove {d.displayName ?? d.registeredEmail}&apos;s current authenticator?
            </p>
            <p className="text-amber-900">
              They will be signed out everywhere and must register a new authenticator at their next sign-in. Only continue if you verified them by phone.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => action.mutate({ path: 'approve', body: { confirm: true }, success: 'MFA reset approved' })}
              >
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Yes, approve MFA reset
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        ) : pending === 'reject' ? (
          <div className="space-y-2">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (sent to the user)"
              rows={3}
              maxLength={1000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || rejectReason.trim().length < 5}
                onClick={() => action.mutate({ path: 'reject', body: { reason: rejectReason }, success: 'Request rejected' })}
              >
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Reject request
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {canReview && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => action.mutate({ path: 'review', method: 'PATCH', success: 'Marked as under review' })}>
                Mark as under review
              </Button>
            )}
            {canSendOtp && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => action.mutate({ path: 'send-otp', success: 'Email OTP sent to the registered email' })}>
                <Mail className="mr-1 h-4 w-4" />
                {d.otpSendCount > 0 ? 'Resend email OTP' : 'Send email OTP'}
              </Button>
            )}
            {canApprove && (
              <Button size="sm" disabled={busy} onClick={() => setPending('approve')}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {d.status === 'APPROVED' ? 'Retry MFA reset' : 'Approve MFA reset'}
              </Button>
            )}
            {canReject && (
              <Button size="sm" variant="outline" className="text-red-700" disabled={busy} onClick={() => setPending('reject')}>
                <XCircle className="mr-1 h-4 w-4" />
                Reject request
              </Button>
            )}
            {!canReview && !canSendOtp && !canApprove && !canReject && (
              <p className="text-sm text-muted-foreground">No actions available for a request that is {STATUS_LABELS[d.status].toLowerCase()}.</p>
            )}
          </div>
        )}
        {!canApprove && canReject && (
          <p className="text-xs text-muted-foreground">Approval unlocks after the user verifies the email OTP.</p>
        )}
      </div>
    </div>
  )
}
