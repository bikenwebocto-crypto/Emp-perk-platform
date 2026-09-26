'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, ExternalLink, Filter, X } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { useActionQueue } from '@/hooks/queries/use-action-queue'
import {
  TAB_KEYS,
  QUEUE_TYPE_MAP,
  PRIORITY_STYLES,
  STATUS_STYLES,
  getPriorityLabel,
  type QueueTabKey,
} from '@/lib/action-queue-types'

const PRIORITY_OPTIONS = ['ALL', 'HIGH', 'MEDIUM', 'STANDARD', 'LOW'] as const
const STATUS_OPTIONS = ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'SKIPPED'] as const

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All Types' },
  ...Object.entries(QUEUE_TYPE_MAP).map(([value, m]) => ({ value, label: m.displayType })),
]

function getEntityName(item: any): string {
  if (item.merchant?.businessName) return item.merchant.businessName
  const meta = item.metadata ?? {}
  return meta.entityName ?? meta.companyName ?? item.title ?? 'Unknown'
}

function getDisplayType(item: any): string {
  const meta = item.metadata ?? {}
  const queueType = meta.queueType as string | undefined
  if (queueType && QUEUE_TYPE_MAP[queueType]) return QUEUE_TYPE_MAP[queueType].displayType
  return (item.type ?? '').replace(/_/g, ' ')
}

function getPriorityStyle(priority: number) {
  const label = getPriorityLabel(priority)
  return PRIORITY_STYLES[label] ?? 'bg-gray-100 text-gray-700'
}

function getStatusStyle(status: string) {
  return STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'
}

export default function ActionQueuePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Deep-link fallback from the dashboard: ?type=<ActionQueueType>&id=<ActionQueueItem id>
  const typeParam = searchParams.get('type')
  const idParam = searchParams.get('id')
  const tabFromType: QueueTabKey | undefined = typeParam
    ? TAB_KEYS.find(t => t.key === typeParam)?.key ?? QUEUE_TYPE_MAP[typeParam]?.tabCategory
    : undefined

  const initialTab = (searchParams.get('tab') as QueueTabKey | null) ?? tabFromType ?? 'ALL'
  const validTab = TAB_KEYS.find(t => t.key === initialTab) ? initialTab : 'ALL'

  const [activeTab, setActiveTab] = useState<QueueTabKey>(validTab)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [priority, setPriority] = useState<string>(searchParams.get('priority') ?? 'ALL')
  const [status, setStatus] = useState<string>(searchParams.get('status') ?? 'ALL')
  const [type, setType] = useState<string>(searchParams.get('queueType') ?? 'ALL')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const filters = useMemo(
  () => ({
    tab: activeTab === 'ALL' ? undefined : activeTab,
    queueType: type === 'ALL' ? undefined : type,
    status: status,   // always send it — 'ALL' included — so the server can distinguish "show everything" from "no filter set"
    priority: priority === 'ALL' ? undefined : priority,
    q: search.trim() || undefined,
    page,
  }),
  [activeTab, type, status, priority, search, page],
)

  const { data, isLoading, isFetching } = useActionQueue(filters)
  const items = useMemo(() => data?.data ?? [], [data])
  const meta = data?.meta

  // Once items load, open the deep-linked item with the page's normal
  // opener (its review route). The id/type params are dropped first so
  // pressing Back from the review does not re-open it.
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (deepLinkHandled.current || !idParam || isLoading || isFetching) return
    deepLinkHandled.current = true

    const params = new URLSearchParams(searchParams.toString())
    params.delete('id')
    params.delete('type')
    if (activeTab !== 'ALL') params.set('tab', activeTab)
    const qs = params.toString()
    router.replace(`/admin/action-queue${qs ? `?${qs}` : ''}`, { scroll: false })

    const match = items.find((item: { id: string }) => item.id === idParam)
    if (!match) return
    document.getElementById(`queue-item-${match.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    router.push(`/admin/action-queue/${encodeURIComponent(match.id)}`)
  }, [idParam, isLoading, isFetching, items, activeTab, router, searchParams])

  const handleTabChange = (tab: QueueTabKey) => {
    setActiveTab(tab)
    setPage(1)
    const params = new URLSearchParams()
    if (tab !== 'ALL') params.set('tab', tab)
    router.replace(`/admin/action-queue${params.toString() ? `?${params}` : ''}`, { scroll: false })
  }

  const clearFilters = () => {
    setSearch('')
    setPriority('ALL')
    setStatus('ALL')
    setType('ALL')
    setPage(1)
  }

  const hasActiveFilter = search.trim() !== '' || priority !== 'ALL' || status !== 'ALL' || type !== 'ALL'

  const tabCounts = useMemo(() => {
    if (!meta?.tabCounts) {
      return {
        ALL: 0,
        MERCHANT_APPROVAL: 0,
        OFFER_APPROVAL: 0,
        COMPANY_ACTIVATION: 0,
        ISSUES: 0,
        ALERTS: 0,
      }
    }
    return {
      ALL: meta.tabCounts.ALL ?? 0,
      MERCHANT_APPROVAL: meta.tabCounts.MERCHANT_APPROVAL ?? 0,
      OFFER_APPROVAL: meta.tabCounts.OFFER_APPROVAL ?? 0,
      COMPANY_ACTIVATION: meta.tabCounts.COMPANY_ACTIVATION ?? 0,
      ISSUES: meta.tabCounts.ISSUES ?? 0,
      ALERTS: meta.tabCounts.ALERTS ?? 0,
    }
  }, [meta])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Center"
        description="Centralized approval and review inbox for all admin workflows"
      />

      <div className="flex gap-1 border-b overflow-x-auto">
        {TAB_KEYS.map((tab) => {
          const count = tabCounts[tab.key as keyof typeof tabCounts] ?? 0
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`relative whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title or description…"
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
            className="gap-1"
          >
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilter && (
              <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                {[priority, status, type].filter(v => v !== 'ALL').length + (search ? 1 : 0)}
              </span>
            )}
          </Button>
          {hasActiveFilter && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3 w-3" />Clear
            </Button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Priority</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1) }}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p === 'ALL' ? 'All Priorities' : p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All Statuses' : s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1) }}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading || isFetching ? (
              <tr>
                <td colSpan={7} className="p-4">
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No items found
                </td>
              </tr>
            ) : (
              items.map((item: any) => {
                const displayType = getDisplayType(item)
                const entityName = getEntityName(item)
                const priorityLabel = getPriorityLabel(item.priority)
                return (
                  <tr
                    key={item.id}
                    id={`queue-item-${item.id}`}
                    className={`border-b last:border-0 hover:bg-muted/30 ${item.id === idParam ? 'bg-primary/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                        {displayType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{entityName}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.title}</p>
                      {item.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityStyle(item.priority)}`}>
                        {priorityLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusStyle(item.status)}`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/action-queue/${item.id}`}>
                        <Button size="sm" variant="outline" className="h-7 px-3 text-xs">
                          <ExternalLink className="mr-1 h-3 w-3" />Review
                        </Button>
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {items.length} of {meta.total} items
          </span>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!meta.hasPreviousPage}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!meta.hasNextPage}
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
