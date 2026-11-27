'use client'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { Button } from '@/components/ui/button'
import { AuditLogTable } from '@/features/audit-logs/components/audit-log-table'
import { useAuditLogs } from '@/hooks/queries/use-audit-logs'

type EntityFilter = 'ALL' | 'merchant' | 'company' | 'company_admin' | 'employee' | 'offer' | 'system'

const PAGE_SIZE = 25

export default function AuditLogsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  // Don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Any filter change starts again from the first page.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, entityFilter, dateFrom, dateTo])

  const { data, isLoading, isError, error } = useAuditLogs({
    search: debouncedSearch,
    entityType: entityFilter,
    from: dateFrom,
    to: dateTo,
    page,
    pageSize: PAGE_SIZE,
  })
  const meta = data?.meta

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" description="Track all administrative actions" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search actions..."
          filters={[
            {
              key: 'entity',
              label: 'All Entities',
              options: [
                { label: 'Merchant', value: 'merchant' },
                { label: 'Company', value: 'company' },
                { label: 'Company admin', value: 'company_admin' },
                { label: 'Employee', value: 'employee' },
                { label: 'Offer', value: 'offer' },
                { label: 'System', value: 'system' },
              ],
              value: entityFilter,
              onChange: (v) => setEntityFilter(v as EntityFilter),
            },
          ]}
        />
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <span className="text-sm text-muted-foreground">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        </div>
      </div>
      {isError ? (
        <p className="py-8 text-center text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load audit logs'}
        </p>
      ) : (
        <AuditLogTable logs={data?.data ?? []} isLoading={isLoading} />
      )}
      {meta && meta.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {meta.total} {meta.total === 1 ? 'entry' : 'entries'} · page {meta.page} of {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
