'use client'

const pageModuleLoad = performance.now()

import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/shared/status-badge'
import { PageHeader } from '@/components/shared/page-header'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { Plus, AlertTriangle } from 'lucide-react'
import { PRIORITY_STYLES } from '@/features/complaints/constants'

console.log(`[RENDER] EmployeeComplaintsPage module loaded: ${(performance.now() - pageModuleLoad).toFixed(1)}ms`)

interface Complaint {
  id: string
  complaintType: string
  status: string
  priority: string
  description: string
  createdAt: string
  offer: { id: string; title: string }
  merchant: { id: string; businessName: string }
}

interface ComplaintsResponse {
  success: boolean
  data: Complaint[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'CLARIFICATION_REQ', label: 'Clarification Required' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
]

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  CLARIFICATION_REQ: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-500',
  ESCALATED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-500',
  RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
}

function ComplaintStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ''}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority] ?? ''}`}>
      {priority}
    </span>
  )
}

export default function EmployeeComplaintsPage() {
  const compStart = useRef(performance.now())
  const hasLogged = useRef(false)
  const queryFetchStart = useRef(0)

  if (process.env.NODE_ENV === 'development' && !hasLogged.current) {
    console.log(`[RENDER] EmployeeComplaintsPage component entered: ${(performance.now() - compStart.current).toFixed(1)}ms`);
    hasLogged.current = true;
  }

  const { page, setPage, pageSize, resetPage } = useTablePagination({ defaultPageSize: 10 })
  const [statusFilter, setStatusFilter] = useState('')

  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('pageSize', String(pageSize))
    if (statusFilter) p.set('status', statusFilter)
    return p
  }, [page, pageSize, statusFilter])

  const { data, isLoading } = useQuery({
    queryKey: ['employee-complaints', params.toString()],
    queryFn: async () => {
      queryFetchStart.current = performance.now()
      console.log(`[RENDER] EmployeeComplaintsPage before fetch: ${(performance.now() - compStart.current).toFixed(1)}ms`)
      const tFetch = performance.now()
      const res = await fetch(`/api/complaints?${params.toString()}`)
      console.log(`[RENDER] EmployeeComplaintsPage fetch done: ${(performance.now() - compStart.current).toFixed(1)}ms (fetch=${(performance.now() - tFetch).toFixed(1)}ms)`)
      const json = await res.json()
      console.log(`[RENDER] EmployeeComplaintsPage json parsed: ${(performance.now() - compStart.current).toFixed(1)}ms`)
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json as ComplaintsResponse
    },
  })

  useEffect(() => {
    if (data) {
      console.log(`[RENDER] EmployeeComplaintsPage data received: ${(performance.now() - compStart.current).toFixed(1)}ms`)
    }
  }, [data])

  const complaints = data?.data ?? []
  const meta = data?.meta

  const renderEnd = useRef(0)
  renderEnd.current = performance.now()

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Complaints"
        description="Track and manage complaints you've filed"
        actions={
          <Link href="/employee/complaints/new">
            <Button>
              <Plus className="mr-1 h-4 w-4" /> File a Complaint
            </Button>
          </Link>
        }
      />

      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); resetPage() }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : complaints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No complaints filed yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Click &quot;File a Complaint&quot; to submit your first complaint.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">Offer</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() => window.location.href = `/employee/complaints/${c.id}`}
                  >
                    <td className="px-4 py-3 font-medium">{c.offer?.title ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.merchant?.businessName ?? '—'}</td>
                    <td className="px-4 py-3 capitalize">{c.complaintType?.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="px-4 py-3"><ComplaintStatusBadge status={c.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={c.priority} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
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
    </div>
  )
}