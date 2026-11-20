'use client'
import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from './analytics-dialog'
import { cn } from '@/utils/cn'
import { formatNumber, formatPercent } from './analytics-charts'

// ============================================================================
// Offer performance table
// - Reusable
// - Sortable by any column
// - Paginated (client-side, since the data is already in memory)
// - Loading + empty states built in
// ============================================================================

export interface OfferPerformanceRow {
  id: string
  title: string
  status: string
  views: number
  saves: number
  clicks: number
  redemptions: number
  conversionRate: number | null
}

export type OfferSortKey =
  | 'title'
  | 'status'
  | 'views'
  | 'saves'
  | 'clicks'
  | 'redemptions'
  | 'conversionRate'

export type SortDir = 'asc' | 'desc'

interface OfferPerformanceTableProps {
  data: OfferPerformanceRow[]
  isLoading?: boolean
  /** Initial sort. Defaults to redemptions desc */
  defaultSort?: { key: OfferSortKey; dir: SortDir }
  /** Page size. Defaults to 5 */
  pageSize?: number
  /** Title shown in the card header */
  title?: string
  /** Subtitle shown under the title */
  subtitle?: string
  /** Optional max rows to show (caps the dataset, useful when the API returns many) */
  maxRows?: number
  /** Header icon */
  icon?: React.ElementType
  /** Optional empty-state action */
  emptyAction?: React.ReactNode
}

export function OfferPerformanceTable({
  data,
  isLoading,
  defaultSort = { key: 'redemptions', dir: 'desc' },
  pageSize = 5,
  title = 'Offer Performance',
  subtitle,
  maxRows,
  icon: Icon = Package,
  emptyAction,
}: OfferPerformanceTableProps) {
  const [sort, setSort] = useState<{ key: OfferSortKey; dir: SortDir }>(defaultSort)
  const [page, setPage] = useState(1)

  // Optionally cap the data set
  const source = useMemo(
    () => (maxRows != null ? data.slice(0, maxRows) : data),
    [data, maxRows],
  )

  const sorted = useMemo(() => {
    const arr = [...source]
    arr.sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      // null-safe compare
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av
      }
      const as = String(av).toLowerCase()
      const bs = String(bv).toLowerCase()
      return sort.dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    })
    return arr
  }, [source, sort])

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const paged = sorted.slice(start, end)

  // Reset to page 1 when sort changes
  const handleSort = (key: OfferSortKey) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      // Default direction per column
      const descDefault: OfferSortKey[] = ['redemptions', 'views', 'saves', 'clicks', 'conversionRate']
      return { key, dir: descDefault.includes(key) ? 'desc' : 'asc' }
    })
    setPage(1)
  }

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b bg-muted/30 p-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="space-y-2 p-3">
          {Array.from({ length: pageSize }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-muted/50" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted/30 p-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {total} {total === 1 ? 'offer' : 'offers'}
            </p>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground">
              <SortHeader
                label="Offer"
                sortKey="title"
                current={sort}
                onSort={handleSort}
                align="left"
              />
              <SortHeader
                label="Status"
                sortKey="status"
                current={sort}
                onSort={handleSort}
                align="center"
              />
              <SortHeader
                label="Views"
                sortKey="views"
                current={sort}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="Saves"
                sortKey="saves"
                current={sort}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="Clicks"
                sortKey="clicks"
                current={sort}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="Redeemed"
                sortKey="redemptions"
                current={sort}
                onSort={handleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {paged.length > 0 ? (
              paged.map((o, i) => (
                <tr
                  key={o.id}
                  className={cn(
                    'border-b transition-colors last:border-0 hover:bg-muted/30',
                    sort.key === 'redemptions' && sort.dir === 'desc' && i === 0
                      ? 'bg-amber-50/40 dark:bg-amber-950/10'
                      : '',
                  )}
                >
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs font-medium" title={o.title}>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{o.title}</span>
                      {sort.key === 'redemptions' && sort.dir === 'desc' && i === 0 && (
                        <Badge variant="warning" className="px-1 py-0 text-[9px]">
                          top
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Badge variant="outline" className="text-[10px]">
                      {o.status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{formatNumber(o.views)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{formatNumber(o.saves)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{formatNumber(o.clicks)}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">
                    {formatNumber(o.redemptions)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState
                    icon={Package}
                    title="No offers yet"
                    description="This merchant hasn't created any offers."
                    action={emptyAction}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            Showing {start + 1}–{Math.min(end, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
               disabled={isLoading || page <= 1}
               onClick={() => setPage((p) => Math.max(1, p - 1))}
               aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-1.5 text-[11px] text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
               disabled={isLoading || page >= totalPages}
               onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
               aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sortable header cell
// ============================================================================

function SortHeader({
  label,
  sortKey,
  current,
  onSort,
  align,
}: {
  label: string
  sortKey: OfferSortKey
  current: { key: OfferSortKey; dir: SortDir }
  onSort: (key: OfferSortKey) => void
  align: 'left' | 'center' | 'right'
}) {
  const isActive = current.key === sortKey
  return (
    <th
      className={cn(
        'px-3 py-2 font-medium',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          isActive && 'text-foreground',
        )}
      >
        {label}
        {isActive ? (
          current.dir === 'asc' ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  )
}
