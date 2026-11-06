'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CheckCircle2, Eye, History, Loader2, Mail, RefreshCw, ShieldAlert, ShieldCheck, X, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { showToast } from '@/hooks/use-toast'
import { cn } from '@/utils/cn'
import {
  Field, HistoryTimeline, OtpStatusSection, Section, StatusBadge, formatDate, recoveryApi, shortId,
  DETAIL_POLL_MS, LIST_POLL_MS, isUserPending,
  type HistoryEntry, type RecoveryDetail, type RecoveryListResponse,
} from '@/features/admin/mfa-recovery/shared'

// Inbox for a designated recovery approver: emergency MFA recovery requests
// from the admins who picked the current user. Only the assigned approver
// sees a request here; the server enforces that on every call.

type View = 'open' | 'all'

const OPEN_STATUSES = 'PENDING,OTP_SENT,OTP_VERIFIED,APPROVED'

export default function RecoveryApprovalsPage() {
  const { page, setPage, pageSize, resetPage } = useTablePagination({ defaultPageSize: 20 })
  const [view, setView] = useState<View>('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: 'requestedAt', order: 'desc' })
  if (view === 'open') params.set('status', OPEN_STATUSES)

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['admin-recovery-approvals', params.toString()],
    queryFn: () => recoveryApi<RecoveryListResponse>(`/api/admin/mfa-recovery/my-approvals?${params.toString()}`),
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => isUserPending(r.status)) ? LIST_POLL_MS : false,
    refetchOnWindowFocus: true,
  })

  const rows = data?.items ?? []
  const pagination = data?.pagination
  const awaiting = rows.filter((r) => r.status === 'OTP_VERIFIED').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recovery Approvals"
        description="Emergency authenticator recovery requests from admins who chose you as their recovery approver"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-1 h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <Card>
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="font-medium">Before approving, confirm it is really them.</p>
            <p className="text-muted-foreground">
              Call or meet the admin through a channel you already trust; do not rely on the request email alone.
              You never see their code or password, and approving removes their current authenticator so they can register a new one.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border p-0.5">
          {(['open', 'all'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setView(v); resetPage() }}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'open' ? 'Open requests' : 'All requests'}
            </button>
          ))}
        </div>
        {awaiting > 0 && (
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800">
            {awaiting} awaiting your decision
          </span>
        )}
      </div>

      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-red-700">{(error as Error).message}</CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <ShieldCheck className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">{view === 'open' ? 'No requests waiting for you' : 'No recovery requests yet'}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">Request ID</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Registered Email</th>
                  <th className="px-4 py-3">Requested</th>
                  <th className="px-4 py-3">Email verified</th>
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
                    <td className="px-4 py-3">{r.registeredEmail}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(r.requestedAt)}</td>
                    <td className="px-4 py-3">
                      {r.otpVerifiedAt
                        ? <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" />Yes</span>
                        : <span className="text-muted-foreground">Not yet</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedId(r.id) }}>
                        <Eye className="mr-1 h-4 w-4" />
                        {r.status === 'OTP_VERIFIED' ? 'Review' : 'View'}
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

      <DialogPrimitive.Root open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-background shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
            {selectedId ? <ApprovalDrawer key={selectedId} id={selectedId} /> : <DialogTitle className="sr-only">Recovery request</DialogTitle>}
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPortal>
      </DialogPrimitive.Root>
    </div>
  )
}

function ApprovalDrawer({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<null | 'approve' | 'reject'>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

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

  const liveStatus = detailQuery.data?.status
  useEffect(() => {
    if (!liveStatus) return
    void queryClient.invalidateQueries({ queryKey: ['admin-mfa-recovery-history', id] })
    void queryClient.invalidateQueries({ queryKey: ['admin-recovery-approvals'] })
  }, [liveStatus, id, queryClient])

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown; success: string }) =>
      recoveryApi<unknown>(`/api/admin/mfa-recovery/${id}/${path}`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_d, vars) => {
      showToast({ type: 'success', title: vars.success })
      setPending(null)
      setConfirmed(false)
      setRejectReason('')
    },
    onError: (err: Error) => showToast({ type: 'error', title: 'Action failed', description: err.message }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-recovery-approvals'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-mfa-recovery-detail', id] })
      void queryClient.invalidateQueries({ queryKey: ['admin-mfa-recovery-history', id] })
    },
  })

  const d = detailQuery.data
  if (detailQuery.isLoading) {
    return (
      <div className="space-y-3 p-6">
        <DialogTitle className="sr-only">Loading recovery request</DialogTitle>
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
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
  const canApprove = d.status === 'OTP_VERIFIED' || d.status === 'APPROVED'
  const canReject = ['PENDING', 'OTP_SENT', 'OTP_VERIFIED'].includes(d.status)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-6 pr-12">
        <DialogTitle className="text-lg font-semibold">{d.displayName ?? d.registeredEmail}</DialogTitle>
        <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="font-mono text-xs" title={d.id}>#{shortId(d.id)}</span>
          <span>· Emergency recovery</span>
          <StatusBadge status={d.status} />
        </DialogDescription>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <Section title="Requesting admin">
          <dl className="space-y-1.5">
            <Field label="Name">{d.displayName ?? '—'}</Field>
            <Field label="Email">
              <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{d.registeredEmail}</span>
            </Field>
            <Field label="Requested">{formatDate(d.requestedAt)}</Field>
            <Field label="Expires">{formatDate(d.expiresAt)}</Field>
          </dl>
        </Section>

        <Section title="Recovery reason">
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{d.reason}</p>
        </Section>

        <Section title="Email verification" icon={Mail}>
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
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-start gap-2 font-medium">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Remove {d.displayName ?? d.registeredEmail}&apos;s current authenticator?
            </p>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>I confirmed this request with them personally through a trusted channel (call or in person).</span>
            </label>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy || !confirmed}
                onClick={() => action.mutate({ path: 'emergency-approve', body: { confirm: true }, success: 'Emergency MFA reset approved' })}
              >
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Approve MFA reset
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setPending(null); setConfirmed(false) }}>Cancel</Button>
            </div>
          </div>
        ) : pending === 'reject' ? (
          <div className="space-y-2">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required, sent to the admin)"
              rows={3}
              maxLength={1000}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || rejectReason.trim().length < 5}
                onClick={() => action.mutate({ path: 'emergency-reject', body: { reason: rejectReason }, success: 'Request rejected' })}
              >
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Reject request
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        ) : canApprove || canReject ? (
          <div className="flex flex-wrap gap-2">
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
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No decision needed for this request.</p>
        )}
        {!canApprove && canReject && (
          <p className="text-xs text-muted-foreground">You can approve once the admin has verified the code sent to their registered email.</p>
        )}
      </div>
    </div>
  )
}
