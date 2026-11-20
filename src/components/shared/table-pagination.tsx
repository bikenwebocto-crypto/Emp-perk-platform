'use client'
import { Button } from '@/components/ui/button'

interface TablePaginationProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

/** Pagination footer that stays visible whenever there are records. */
export function TablePagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: TablePaginationProps) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const last = Math.max(1, totalPages)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Showing {from}–{to} of {total}
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1">
            Rows
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          Page {page} of {last}
        </span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(1)}>
          First
        </Button>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" size="sm" disabled={page >= last} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
        <Button variant="outline" size="sm" disabled={page >= last} onClick={() => onPageChange(last)}>
          Last
        </Button>
      </div>
    </div>
  )
}
