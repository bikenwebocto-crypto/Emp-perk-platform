'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, ExternalLink, Lightbulb, Loader2, RefreshCw, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { showToast } from '@/hooks/use-toast'
import { cn } from '@/utils/cn'

type SuggestionStatus = 'PENDING' | 'UNDER_REVIEW' | 'CONTACTED' | 'REJECTED' | 'CONVERTED'

const STATUSES: SuggestionStatus[] = ['PENDING', 'UNDER_REVIEW', 'CONTACTED', 'REJECTED', 'CONVERTED']

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  CONTACTED: 'Contacted',
  REJECTED: 'Rejected',
  CONVERTED: 'Converted',
}

const STATUS_STYLES: Record<SuggestionStatus, string> = {
  PENDING: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
  CONTACTED: 'bg-purple-100 text-purple-800',
  REJECTED: 'bg-red-100 text-red-800',
  CONVERTED: 'bg-green-100 text-green-800',
}

// Label on the action button that moves a suggestion INTO each status.
const ACTION_LABELS: Record<SuggestionStatus, string> = {
  PENDING: 'Mark Pending',
  UNDER_REVIEW: 'Start Review',
  CONTACTED: 'Mark Contacted',
  REJECTED: 'Reject',
  CONVERTED: 'Mark Converted',
}

interface SuggestionRow {
  id: string
  merchantName: string
  merchantWebsite: string | null
  merchantPhone: string
  merchantEmail: string
  status: SuggestionStatus
  createdAt: string
  employee: { id: string; firstName: string; lastName: string } | null
  company: { id: string; name: string } | null
  merchant: { id: string; businessName: string } | null
}

interface ListResponse {
  success: boolean
  data: SuggestionRow[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    counts: Record<SuggestionStatus, number>
  }
}

interface MerchantOption {
  id: string
  businessName: string
  status?: string
  city?: string | null
  contactPhone?: string | null
}

interface SuggestionDetail extends SuggestionRow {
  reason: string | null
  adminNotes: string | null
  rejectionReason: string | null
  reviewedAt: string | null
  reviewedBy: { firstName: string; lastName: string } | null
  allowedNextStatuses: SuggestionStatus[]
  possibleDuplicates?: {
    suggestions: {
      id: string
      merchantName: string
      merchantEmail: string
      merchantPhone: string
      status: SuggestionStatus
      createdAt: string
      employee: { firstName: string; lastName: string } | null
      company: { name: string } | null
    }[]
    merchants: MerchantOption[]
  }
}

interface ApiErrorBody {
  error?: { message?: string; details?: Record<string, string> }
}

function errorMessage(json: ApiErrorBody, fallback: string) {
  const details = json.error?.details
  if (details && Object.keys(details).length > 0) return Object.values(details).join(' ')
  return json.error?.message ?? fallback
}

function StatusBadge({ status }: { status: SuggestionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ''}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export default function AdminMerchantSuggestionsPage() {
  const { page, setPage, pageSize, resetPage } = useTablePagination({ defaultPageSize: 20 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | 'ALL'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const debouncedSearch = useDebounced(search)

  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('pageSize', String(pageSize))
    if (debouncedSearch.trim()) p.set('q', debouncedSearch.trim())
    if (statusFilter !== 'ALL') p.set('status', statusFilter)
    return p
  }, [page, pageSize, debouncedSearch, statusFilter])

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-merchant-suggestions', params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchant-suggestions?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json as ListResponse
    },
  })

  const rows = data?.data ?? []
  const meta = data?.meta
  const totalAll = meta ? STATUSES.reduce((sum, s) => sum + (meta.counts[s] ?? 0), 0) : 0

  function selectStatus(s: SuggestionStatus | 'ALL') {
    setStatusFilter((prev) => (prev === s ? 'ALL' : s))
    resetPage()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Merchant Suggestions"
        description="Merchants employees would like to see on the platform"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-1 h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {/* Status stages — click to filter, click again to clear */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StageCard
          label="All"
          count={totalAll}
          active={statusFilter === 'ALL'}
          onClick={() => selectStatus('ALL')}
        />
        {STATUSES.map((s) => (
          <StageCard
            key={s}
            label={STATUS_LABELS[s]}
            count={meta?.counts[s] ?? 0}
            active={statusFilter === s}
            dotClass={STATUS_STYLES[s]}
            onClick={() => selectStatus(s)}
          />
        ))}
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder="Search merchant, email, phone, employee, company..."
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Lightbulb className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No merchant suggestions found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Suggested By</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() => setSelectedId(s.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.merchantName}</div>
                      {s.merchantWebsite && (
                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {s.merchantWebsite}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{s.merchantEmail}</div>
                      <div className="text-xs text-muted-foreground">{s.merchantPhone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : '—'}</div>
                      <div className="text-xs text-muted-foreground">{s.company?.name ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-muted-foreground">
                Page {page} of {meta.totalPages} ({meta.total} total)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <SuggestionDrawer id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}

function StageCard({
  label,
  count,
  active,
  dotClass,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  dotClass?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50',
        active && 'border-primary ring-1 ring-primary',
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {dotClass && <span className={cn('h-2 w-2 rounded-full', dotClass)} />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{count}</div>
    </button>
  )
}

// ─── Detail drawer ──────────────────────────────────────────────────────────

function SuggestionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={!!id} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-background shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          {id && <DrawerBody key={id} id={id} />}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}

function DrawerBody({ id }: { id: string }) {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState('')
  const [pendingStatus, setPendingStatus] = useState<SuggestionStatus | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [merchantSearch, setMerchantSearch] = useState('')
  const [selectedMerchant, setSelectedMerchant] = useState<MerchantOption | null>(null)
  const debouncedMerchantSearch = useDebounced(merchantSearch)

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['admin-merchant-suggestion', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/merchant-suggestions/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json.data as SuggestionDetail
    },
  })

  useEffect(() => {
    if (detail) setNotes(detail.adminNotes ?? '')
  }, [detail])

  const { data: merchantResults, isFetching: searchingMerchants } = useQuery({
    queryKey: ['admin-merchant-picker', debouncedMerchantSearch],
    enabled: pendingStatus === 'CONVERTED' && debouncedMerchantSearch.trim().length >= 2,
    queryFn: async () => {
      const p = new URLSearchParams({ q: debouncedMerchantSearch.trim(), pageSize: '8' })
      const res = await fetch(`/api/admin/merchants?${p.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to search merchants')
      return json.data as MerchantOption[]
    },
  })

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/merchant-suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(errorMessage(json, 'Update failed'))
      return json.data as SuggestionDetail
    },
    onSuccess: (_data, body) => {
      showToast({ type: 'success', title: body.status ? 'Status updated' : 'Notes saved' })
      setPendingStatus(null)
      setRejectionReason('')
      setSelectedMerchant(null)
      setMerchantSearch('')
      queryClient.invalidateQueries({ queryKey: ['admin-merchant-suggestion', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-merchant-suggestions'] })
    },
    onError: (err: Error) => {
      showToast({ type: 'error', title: 'Could not update suggestion', description: err.message })
      // A 409 means someone else changed it — refresh so the admin sees the current state.
      queryClient.invalidateQueries({ queryKey: ['admin-merchant-suggestion', id] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="mb-2 h-8 w-8 text-muted-foreground/50" />
        <DialogTitle className="text-sm font-medium">Could not load suggestion</DialogTitle>
        <p className="text-xs text-muted-foreground">{(error as Error | null)?.message}</p>
      </div>
    )
  }

  const dupSuggestions = detail.possibleDuplicates?.suggestions ?? []
  const dupMerchants = detail.possibleDuplicates?.merchants ?? []
  const pickerOptions = merchantSearch.trim().length >= 2 ? merchantResults ?? [] : dupMerchants

  function handleStatusClick(status: SuggestionStatus) {
    if (status === 'REJECTED' || status === 'CONVERTED') {
      setPendingStatus((prev) => (prev === status ? null : status))
      return
    }
    mutation.mutate({ status })
  }

  function confirmPending() {
    if (pendingStatus === 'REJECTED') {
      mutation.mutate({ status: 'REJECTED', rejectionReason })
    } else if (pendingStatus === 'CONVERTED' && selectedMerchant) {
      mutation.mutate({ status: 'CONVERTED', merchantId: selectedMerchant.id })
    }
  }

  return (
    <>
      <div className="border-b p-6 pr-12">
        <DialogTitle className="text-lg font-semibold">{detail.merchantName}</DialogTitle>
        <DialogDescription className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={detail.status} />
          <span>Suggested {new Date(detail.createdAt).toLocaleString()}</span>
        </DialogDescription>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <Section title="Details">
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{detail.merchantEmail}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{detail.merchantPhone}</dd>
            <dt className="text-muted-foreground">Website</dt>
            <dd className="break-all">
              {detail.merchantWebsite ? (
                <a
                  href={detail.merchantWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {detail.merchantWebsite}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : '—'}
            </dd>
            <dt className="text-muted-foreground">Suggested by</dt>
            <dd>
              {detail.employee ? `${detail.employee.firstName} ${detail.employee.lastName}` : '—'}
              {detail.company && <span className="text-muted-foreground"> · {detail.company.name}</span>}
            </dd>
            {detail.reviewedAt && (
              <>
                <dt className="text-muted-foreground">Last reviewed</dt>
                <dd>
                  {new Date(detail.reviewedAt).toLocaleString()}
                  {detail.reviewedBy && (
                    <span className="text-muted-foreground">
                      {' '}by {detail.reviewedBy.firstName} {detail.reviewedBy.lastName}
                    </span>
                  )}
                </dd>
              </>
            )}
            {detail.merchant && (
              <>
                <dt className="text-muted-foreground">Converted to</dt>
                <dd>
                  <a href={`/admin/merchants/${detail.merchant.id}`} className="text-primary hover:underline">
                    {detail.merchant.businessName}
                  </a>
                </dd>
              </>
            )}
            {detail.status === 'REJECTED' && detail.rejectionReason && (
              <>
                <dt className="text-muted-foreground">Rejection reason</dt>
                <dd className="whitespace-pre-wrap">{detail.rejectionReason}</dd>
              </>
            )}
          </dl>
        </Section>

        <Section title="Reason">
          <p className="whitespace-pre-wrap text-sm">
            {detail.reason || <span className="text-muted-foreground">No reason given.</span>}
          </p>
        </Section>

        <Section title="Possible matches">
          {dupSuggestions.length === 0 && dupMerchants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No similar suggestions or merchants found.</p>
          ) : (
            <div className="space-y-4">
              {dupMerchants.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Existing merchants</p>
                  <ul className="divide-y rounded-md border text-sm">
                    {dupMerchants.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <a href={`/admin/merchants/${m.id}`} className="font-medium text-primary hover:underline">
                          {m.businessName}
                        </a>
                        <span className="text-xs text-muted-foreground">
                          {[m.city, m.status].filter(Boolean).join(' · ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dupSuggestions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Suggestions with the same email or phone
                  </p>
                  <ul className="divide-y rounded-md border text-sm">
                    {dupSuggestions.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div>
                          <div className="font-medium">{d.merchantName}</div>
                          <div className="text-xs text-muted-foreground">
                            {d.employee ? `${d.employee.firstName} ${d.employee.lastName}` : '—'}
                            {d.company && ` · ${d.company.name}`} · {new Date(d.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <StatusBadge status={d.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="Internal notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Only visible to admins"
            rows={4}
            maxLength={5000}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending || notes === (detail.adminNotes ?? '')}
              onClick={() => mutation.mutate({ adminNotes: notes })}
            >
              Save notes
            </Button>
          </div>
        </Section>
      </div>

      <div className="space-y-3 border-t p-6">
        {pendingStatus === 'REJECTED' && (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="rejection-reason">Rejection reason</label>
            <Textarea
              id="rejection-reason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Why is this suggestion being rejected?"
              rows={3}
              maxLength={2000}
            />
          </div>
        )}

        {pendingStatus === 'CONVERTED' && (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="merchant-search">Converted to merchant</label>
            <Input
              id="merchant-search"
              value={merchantSearch}
              onChange={(e) => setMerchantSearch(e.target.value)}
              placeholder="Search merchants by name..."
            />
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {searchingMerchants ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              ) : pickerOptions.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {merchantSearch.trim().length >= 2 ? 'No merchants found.' : 'Type at least 2 characters to search.'}
                </p>
              ) : (
                pickerOptions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMerchant(m)}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50',
                      selectedMerchant?.id === m.id && 'bg-primary/10',
                    )}
                  >
                    <span className="font-medium">{m.businessName}</span>
                    <span className="text-xs text-muted-foreground">{m.status}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {detail.allowedNextStatuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">This suggestion is closed — no further status changes.</p>
        ) : pendingStatus ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingStatus(null)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={pendingStatus === 'REJECTED' ? 'destructive' : 'default'}
              disabled={
                mutation.isPending ||
                (pendingStatus === 'REJECTED' && !rejectionReason.trim()) ||
                (pendingStatus === 'CONVERTED' && !selectedMerchant)
              }
              onClick={confirmPending}
            >
              {mutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Confirm {ACTION_LABELS[pendingStatus].toLowerCase()}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {detail.allowedNextStatuses.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'REJECTED' ? 'destructive' : s === 'CONVERTED' ? 'default' : 'outline'}
                disabled={mutation.isPending}
                onClick={() => handleStatusClick(s)}
              >
                {ACTION_LABELS[s]}
              </Button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}
