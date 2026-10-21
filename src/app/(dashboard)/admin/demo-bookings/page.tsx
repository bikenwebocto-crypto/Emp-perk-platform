'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, CalendarClock, Loader2, Mail, RefreshCw, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DialogOverlay, DialogPortal, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { showToast } from '@/hooks/use-toast'
import { cn } from '@/utils/cn'
import {
  addDaysToDateKey,
  formatBusinessLocal,
  formatInTimeZone,
  toBusinessWallClock,
} from '@/lib/demo-bookings/availability'

type DemoStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

const STATUSES: DemoStatus[] = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']

const STATUS_LABELS: Record<DemoStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
}

const STATUS_STYLES: Record<DemoStatus, string> = {
  PENDING: 'bg-blue-100 text-blue-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-gray-100 text-gray-700',
}

// Label on the button that moves a booking INTO each status.
const ACTION_LABELS: Record<DemoStatus, string> = {
  PENDING: 'Mark pending',
  CONFIRMED: 'Confirm',
  CANCELLED: 'Cancel booking',
  COMPLETED: 'Mark completed',
}

interface LeadSummary {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  companyName: string
}

interface BookingRow {
  id: string
  reference: string
  status: DemoStatus
  startsAt: string
  durationMinutes: number
  timezone: string
  createdAt: string
  lead: LeadSummary
}

interface ListResponse {
  success: boolean
  data: BookingRow[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    counts: Record<DemoStatus, number>
  }
}

interface BookingDetail extends Omit<BookingRow, 'lead'> {
  lead: LeadSummary & { hearAbout: string | null; message: string | null; consentAt: string | null; createdAt: string }
  notes: string | null
  allowedNextStatuses: DemoStatus[]
  overlaps: Array<{ id: string; reference: string; status: DemoStatus; startsAt: string }>
  emailSent?: boolean
}

interface CalendarEntry {
  id: string
  reference: string
  status: DemoStatus
  startsAt: string
  durationMinutes: number
  lead: { firstName: string; lastName: string; companyName: string }
  overlapsWith: string[]
}

interface ApiErrorBody {
  error?: { message?: string; details?: Record<string, string> }
}

function errorMessage(json: ApiErrorBody, fallback: string) {
  const details = json.error?.details
  if (details && Object.keys(details).length > 0) return Object.values(details).join(' ')
  return json.error?.message ?? fallback
}

function StatusBadge({ status }: { status: DemoStatus }) {
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

/** "HH:mm" in the business timezone, for slot options. */
function slotTime(iso: string) {
  const wall = toBusinessWallClock(new Date(iso))
  return `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`
}

export default function AdminDemoBookingsPage() {
  const { page, setPage, pageSize, resetPage } = useTablePagination({ defaultPageSize: 20 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DemoStatus | 'ALL'>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [calendarDate, setCalendarDate] = useState('')
  const debouncedSearch = useDebounced(search)

  // Opening a booking from the list also moves the calendar to its day.
  function openBooking(b: BookingRow) {
    setSelectedId(b.id)
    setCalendarDate(toBusinessWallClock(new Date(b.startsAt)).dateKey)
  }

  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('pageSize', String(pageSize))
    if (debouncedSearch.trim()) p.set('q', debouncedSearch.trim())
    if (statusFilter !== 'ALL') p.set('status', statusFilter)
    return p
  }, [page, pageSize, debouncedSearch, statusFilter])

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-demo-bookings', params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/demo-bookings?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json as ListResponse
    },
  })

  const rows = data?.data ?? []
  const meta = data?.meta
  const totalAll = meta ? STATUSES.reduce((sum, s) => sum + (meta.counts[s] ?? 0), 0) : 0

  function selectStatus(s: DemoStatus | 'ALL') {
    setStatusFilter((prev) => (prev === s ? 'ALL' : s))
    resetPage()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demo Bookings"
        description="Requests from the public “Book a Demo” form"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-1 h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StageCard label="All" count={totalAll} active={statusFilter === 'ALL'} onClick={() => selectStatus('ALL')} />
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

      <DayCalendar date={calendarDate} setDate={setCalendarDate} onSelect={setSelectedId} />

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          resetPage()
        }}
        searchPlaceholder="Search reference, name, email, company..."
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
            <CalendarClock className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No demo bookings found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">When (Nicosia)</th>
                  <th className="px-4 py-3">Requester</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr
                    key={b.id}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() => openBooking(b)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{formatBusinessLocal(new Date(b.startsAt))}</div>
                      <div className="text-xs text-muted-foreground">{b.durationMinutes} min</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {b.lead.firstName} {b.lead.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">{b.lead.companyName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{b.lead.email}</div>
                      {b.lead.phone && <div className="text-xs text-muted-foreground">{b.lead.phone}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{b.reference}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <BookingDrawer id={selectedId} onClose={() => setSelectedId(null)} />
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

// ─── Day calendar ───────────────────────────────────────────────────────────

/** 09:00–16:30 slot rows, as minutes of the business day. */
const CALENDAR_START = 9 * 60
const CALENDAR_END = 17 * 60
const CALENDAR_ROWS = Array.from({ length: (CALENDAR_END - CALENDAR_START) / 30 }, (_, i) => CALENDAR_START + i * 30)

function DayCalendar({
  date,
  setDate,
  onSelect,
}: {
  /** '' until the server picks the next day with a booking. */
  date: string
  setDate: (date: string) => void
  onSelect: (id: string) => void
}) {
  const { data, isFetching } = useQuery({
    queryKey: ['admin-demo-calendar', date],
    queryFn: async () => {
      const res = await fetch(`/api/admin/demo-bookings/calendar${date ? `?date=${date}` : ''}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load calendar')
      return json.data as { date: string; bookings: CalendarEntry[]; conflictCount: number }
    },
    enabled: date === '' || /^\d{4}-\d{2}-\d{2}$/.test(date),
  })

  // Adopt the day the server chose on first load.
  useEffect(() => {
    if (!date && data?.date) setDate(data.date)
  }, [date, data?.date, setDate])

  const shown = date || data?.date || ''

  const bookings = data?.bookings ?? []
  // A booking sits in the row its start falls in (off-grid starts included).
  const byRow = (rowStart: number) =>
    bookings.filter((b) => {
      const m = toBusinessWallClock(new Date(b.startsAt)).minutesOfDay
      return m >= rowStart && m < rowStart + 30
    })
  const outside = bookings.filter((b) => {
    const m = toBusinessWallClock(new Date(b.startsAt)).minutesOfDay
    return m < CALENDAR_START || m >= CALENDAR_END
  })

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Day schedule (Nicosia time)</h2>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            {!!data?.conflictCount && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="h-3 w-3" />
                {data.conflictCount} clashing
              </span>
            )}
            <Button variant="outline" size="sm" disabled={!shown} onClick={() => setDate(addDaysToDateKey(shown, -1))}>
              ‹
            </Button>
            <input
              type="date"
              value={shown}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            />
            <Button variant="outline" size="sm" disabled={!shown} onClick={() => setDate(addDaysToDateKey(shown, 1))}>
              ›
            </Button>
          </div>
        </div>

        <div className="divide-y rounded-md border">
          {CALENDAR_ROWS.map((rowStart) => {
            const entries = byRow(rowStart)
            const label = `${String(Math.floor(rowStart / 60)).padStart(2, '0')}:${String(rowStart % 60).padStart(2, '0')}`
            return (
              <div key={rowStart} className="flex min-h-9 items-stretch text-sm">
                <div className="w-16 shrink-0 border-r px-2 py-2 text-xs tabular-nums text-muted-foreground">{label}</div>
                <div className="flex flex-1 flex-wrap gap-1 p-1">
                  {entries.map((b) => (
                    <CalendarChip key={b.id} entry={b} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {outside.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-muted-foreground">Outside working hours:</span>
            {outside.map((b) => (
              <CalendarChip key={b.id} entry={b} onSelect={onSelect} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CalendarChip({ entry, onSelect }: { entry: CalendarEntry; onSelect: (id: string) => void }) {
  const clash = entry.overlapsWith.length > 0
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.id)}
      title={clash ? `Overlaps ${entry.overlapsWith.join(', ')}` : entry.reference}
      className={cn(
        'flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors hover:opacity-80',
        STATUS_STYLES[entry.status],
        clash && 'ring-2 ring-amber-500',
      )}
    >
      {clash && <AlertTriangle className="h-3 w-3 text-amber-600" />}
      <span className="font-medium">{slotTime(entry.startsAt)}</span>
      <span>
        {entry.lead.firstName} {entry.lead.lastName} · {entry.lead.companyName}
      </span>
    </button>
  )
}

// ─── Detail drawer ──────────────────────────────────────────────────────────

function BookingDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <DialogPrimitive.Root open={!!id} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l bg-background shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right">
          {id ? <DrawerBody key={id} id={id} /> : <DialogTitle className="sr-only">Booking details</DialogTitle>}
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
  const [pendingCancel, setPendingCancel] = useState(false)

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['admin-demo-booking', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/demo-bookings/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json.data as BookingDetail
    },
  })

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/demo-bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(errorMessage(json, 'Update failed'))
      return json.data as BookingDetail
    },
    onSuccess: (_data, body) => {
      showToast({ type: 'success', title: body.startsAt ? 'Booking rescheduled' : 'Status updated' })
      setPendingCancel(false)
      queryClient.invalidateQueries({ queryKey: ['admin-demo-booking', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-demo-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-demo-calendar'] })
      queryClient.invalidateQueries({ queryKey: ['admin-demo-availability'] })
    },
    onError: (err: Error) => {
      showToast({ type: 'error', title: 'Could not update booking', description: err.message })
      // A 409 means the booking changed underneath us — refresh the current state.
      queryClient.invalidateQueries({ queryKey: ['admin-demo-booking', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-demo-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['admin-demo-calendar'] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <DialogTitle className="sr-only">Loading booking</DialogTitle>
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
        <DialogTitle className="text-sm font-medium">Could not load booking</DialogTitle>
        <p className="text-xs text-muted-foreground">{(error as Error | null)?.message}</p>
      </div>
    )
  }

  const reschedulable = detail.status === 'PENDING' || detail.status === 'CONFIRMED'

  return (
    <>
      <div className="border-b p-6 pr-12">
        <DialogTitle className="text-lg font-semibold">
          {detail.lead.firstName} {detail.lead.lastName}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{detail.lead.companyName}</span>
        </DialogTitle>
        <DialogDescription className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={detail.status} />
          <span className="font-mono text-xs">{detail.reference}</span>
        </DialogDescription>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {detail.overlaps.length > 0 && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              This time overlaps{' '}
              {detail.overlaps.map((o) => `${o.reference} (${STATUS_LABELS[o.status]})`).join(', ')}. Reschedule one
              of them below — the requester is emailed the new time.
            </div>
          </div>
        )}

        <Section title="Meeting">
          <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Time (Nicosia)</dt>
            <dd className="font-medium">{formatBusinessLocal(new Date(detail.startsAt))}</dd>
            <dt className="text-muted-foreground">Requester&apos;s time</dt>
            <dd>
              {formatInTimeZone(new Date(detail.startsAt), detail.timezone)}
              <span className="text-muted-foreground"> · {detail.timezone}</span>
            </dd>
            <dt className="text-muted-foreground">Duration</dt>
            <dd>{detail.durationMinutes} minutes (video call)</dd>
            <dt className="text-muted-foreground">Requested</dt>
            <dd>{new Date(detail.createdAt).toLocaleString()}</dd>
          </dl>
        </Section>

        <Section title="Requester">
          <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>
              {detail.lead.firstName} {detail.lead.lastName}
            </dd>
            <dt className="text-muted-foreground">Company</dt>
            <dd>{detail.lead.companyName}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>
              <a href={`mailto:${detail.lead.email}`} className="inline-flex items-center gap-1 break-all text-primary hover:underline">
                <Mail className="h-3 w-3" />
                {detail.lead.email}
              </a>
            </dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{detail.lead.phone ?? '—'}</dd>
            {detail.lead.hearAbout && (
              <>
                <dt className="text-muted-foreground">Heard about us</dt>
                <dd>{detail.lead.hearAbout}</dd>
              </>
            )}
          </dl>
        </Section>

        <Section title="Notes from the requester">
          <p className="whitespace-pre-wrap text-sm">
            {detail.notes || <span className="text-muted-foreground">No notes given.</span>}
          </p>
        </Section>

        {reschedulable && <RescheduleSection detail={detail} mutation={mutation} />}
      </div>

      <div className="space-y-3 border-t p-6">
        {detail.allowedNextStatuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">This booking is closed — no further status changes.</p>
        ) : pendingCancel ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingCancel(false)} disabled={mutation.isPending}>
              Back
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ status: 'CANCELLED' })}
            >
              {mutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Confirm cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {detail.allowedNextStatuses.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'CANCELLED' ? 'destructive' : s === 'CONFIRMED' ? 'default' : 'outline'}
                disabled={mutation.isPending}
                onClick={() => (s === 'CANCELLED' ? setPendingCancel(true) : mutation.mutate({ status: s }))}
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

function RescheduleSection({
  detail,
  mutation,
}: {
  detail: BookingDetail
  mutation: ReturnType<typeof useMutation<BookingDetail, Error, Record<string, unknown>>>
}) {
  // Start on the booking's own day: the usual fix for a clash is a nearby slot.
  const [date, setDate] = useState(() => toBusinessWallClock(new Date(detail.startsAt)).dateKey)
  const [selectedSlot, setSelectedSlot] = useState('')

  const { data: availability, isFetching } = useQuery({
    queryKey: ['admin-demo-availability', date, detail.durationMinutes],
    queryFn: async () => {
      const p = new URLSearchParams({ date, durationMinutes: String(detail.durationMinutes) })
      const res = await fetch(`/api/admin/demo-bookings/availability?${p.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load slots')
      return json.data as { slots: Array<{ startsAt: string; endAt: string }> }
    },
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
  })

  const slots = availability?.slots ?? []
  const minDate = toBusinessWallClock(new Date()).dateKey

  return (
    <Section title="Reschedule">
      <div className="space-y-2">
        <input
          type="date"
          value={date}
          min={minDate}
          onChange={(e) => {
            setDate(e.target.value)
            setSelectedSlot('')
          }}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        {isFetching ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading slots...
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open slots on this day.</p>
        ) : (
          <select
            value={selectedSlot}
            onChange={(e) => setSelectedSlot(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">Select a time…</option>
            {slots.map((s) => (
              <option key={s.startsAt} value={s.startsAt}>
                {slotTime(s.startsAt)}
              </option>
            ))}
          </select>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedSlot || mutation.isPending}
            onClick={() => mutation.mutate({ startsAt: selectedSlot })}
          >
            {mutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Reschedule
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Times are Nicosia time. The requester is emailed the new time in their own timezone.
        </p>
      </div>
    </Section>
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
