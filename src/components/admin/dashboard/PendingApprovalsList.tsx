'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, ChevronRight, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'
import { getApprovalHref, type PendingApproval } from '@/lib/admin/approval-routes'

/** Priority at or above which an approval is flagged HIGH (matches getPriorityLabel). */
export const HIGH_PRIORITY_THRESHOLD = 4

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  timeZone: 'Europe/Nicosia',
})

const toTime = (value: string | null) => (value ? new Date(value).getTime() : Number.POSITIVE_INFINITY)

export function PendingApprovalsList({ items }: { items: PendingApproval[] }) {
  // Highest priority first, then oldest first.
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => b.priority - a.priority || toTime(a.createdAt) - toTime(b.createdAt)),
    [items],
  )

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <p className="mt-3 text-sm font-medium">All caught up!</p>
        <p className="mt-1 text-xs text-muted-foreground">No pending approvals at the moment</p>
      </div>
    )
  }

  return (
    <ul className="space-y-1">
      {sorted.map((item) => {
        const isHigh = item.priority >= HIGH_PRIORITY_THRESHOLD
        const title = item.title ?? item.merchantName ?? 'Untitled'
        const typeLabel = (item.type ?? '').replace(/_/g, ' ')
        const created = item.createdAt ? new Date(item.createdAt) : null
        const hasDate = created !== null && !Number.isNaN(created.getTime())

        return (
          <li key={item.id}>
            <Link
              href={getApprovalHref(item)}
              aria-label={`Review ${typeLabel.toLowerCase()}: ${title}`}
              className="group flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  isHigh
                    ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40'
                    : 'bg-blue-100 text-blue-600 dark:bg-blue-950/40',
                )}
              >
                {isHigh ? <AlertCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{title}</p>
                <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate font-medium uppercase tracking-wide">{typeLabel}</span>
                  {hasDate && (
                    <>
                      <span className="shrink-0" aria-hidden="true">·</span>
                      <time className="shrink-0" dateTime={created.toISOString()}>
                        {dateFormat.format(created)}
                      </time>
                    </>
                  )}
                  {isHigh && (
                    <>
                      <span className="shrink-0" aria-hidden="true">·</span>
                      <Badge variant="destructive" className="h-4 shrink-0 px-1.5 text-[9px]">
                        HIGH
                      </Badge>
                    </>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
