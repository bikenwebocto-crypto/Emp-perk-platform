'use client'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { TablePagination } from '@/components/shared/table-pagination'
import { Button } from '@/components/ui/button'
import { AuditLogTable } from '@/features/audit-logs/components/audit-log-table'
import { AuditLogDetailDialog } from '@/features/audit-logs/components/audit-log-detail-dialog'
import { useAuditLogFilterOptions, useAuditLogs } from '@/hooks/queries/use-audit-logs'

const INITIAL = { action: 'ALL', from: '', to: '' }

/** `datetime-local` value (viewer's local time) -> ISO instant in UTC for the API. */
function toIso(local: string): string {
  if (!local) return ''
  const d = new Date(local)
  return isNaN(d.getTime()) ? '' : d.toISOString()
}

const fieldClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm'

export default function AuditLogsPage() {
  const [filters, setFilters] = useState(INITIAL)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const dateInvalid = !!filters.from && !!filters.to && filters.from > filters.to

  // Any filter change starts again from the first page.
  useEffect(() => {
    setPage(1)
  }, [filters, pageSize])

  const set = (key: keyof typeof INITIAL) => (v: string) => setFilters((f) => ({ ...f, [key]: v }))

  const options = useAuditLogFilterOptions()
  const { data, isLoading, isFetching, isError, error, refetch } = useAuditLogs({
    action: filters.action,
    // Never send an invalid range; the API would reject it.
    from: dateInvalid ? '' : toIso(filters.from),
    to: dateInvalid ? '' : toIso(filters.to),
    page,
    pageSize,
  })
  const meta = data?.meta

  // If filters shrink the result set below the current page, go to the last page.
  useEffect(() => {
    if (meta && page > meta.totalPages) setPage(meta.totalPages)
  }, [meta, page])

  const hasFilters = Object.entries(filters).some(([k, v]) => v !== INITIAL[k as keyof typeof INITIAL])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="A read-only record of every action taken on the platform: who did it, what they changed, when, and from where. Click any row for full details."
      />

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Action
            <select value={filters.action} onChange={(e) => set('action')(e.target.value)} className={`${fieldClass} min-w-48 text-foreground`}>
              <option value="ALL">All actions</option>
              {(options.data?.actions ?? []).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.value} ({a.count})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <input
              type="datetime-local"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => set('from')(e.target.value)}
              className={`${fieldClass} text-foreground`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <input
              type="datetime-local"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => set('to')(e.target.value)}
              className={`${fieldClass} text-foreground`}
            />
          </label>
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setFilters(INITIAL)}>
              Clear filters
            </Button>
          )}
          {isFetching && !isLoading && <span className="pb-2 text-xs text-muted-foreground">Updating…</span>}
        </div>
        {dateInvalid && <p className="text-xs text-destructive">The start must be on or before the end.</p>}
        {options.isError && <p className="text-xs text-muted-foreground">Action list could not be loaded.</p>}
      </div>

      {isError ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <p className="text-center text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load audit logs'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {meta && meta.total > 0 && (
            <p className="text-sm text-muted-foreground">
              Showing {(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.page * meta.pageSize, meta.total)} of{' '}
              {meta.total.toLocaleString()} {hasFilters ? 'matching ' : ''}events · newest first
            </p>
          )}
          <div className={isFetching && !isLoading ? 'opacity-60 transition-opacity' : undefined}>
            <AuditLogTable
              logs={data?.data ?? []}
              isLoading={isLoading}
              emptyMessage={hasFilters ? 'No audit logs match these filters' : 'No audit logs have been recorded yet'}
              onSelect={setSelectedId}
            />
          </div>
        </>
      )}

      {meta && !isError && (
        <TablePagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          totalPages={meta.totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
        />
      )}

      <AuditLogDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  )
}
