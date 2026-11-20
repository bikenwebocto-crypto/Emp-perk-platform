'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { Plus, AlertTriangle } from 'lucide-react'
import { PRIORITY_STYLES } from '@/features/complaints/constants'
import type { SortDir } from '@/hooks/use-table-sort'
import { SortableTh } from '@/components/shared/sortable-th'
import { TablePagination } from '@/components/shared/table-pagination'

interface Complaint {
  id: string
  complaintType: string
  category: string | null
  status: string
  priority: string
  description: string
  createdAt: string
  offer: { id: string; title: string }
  employee: { id: string; firstName: string; lastName: string }
  company: { id: string; name: string }
}

interface ComplaintsResponse {
  success: boolean
  data: Complaint[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

const STATUS_FILTERS = [
  { value: '', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'CLARIFICATION_REQ', label: 'Clarification Required' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
]

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
  CLARIFICATION_REQ: 'bg-purple-100 text-purple-800',
  ESCALATED: 'bg-orange-100 text-orange-800',
  RESOLVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const CATEGORY_LABELS: Record<string, string> = {
  TECHNICAL: 'Technical',
  ACCOUNT: 'Account',
  OTHER: 'Other',
}

export default function MerchantComplaintsPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const resetPage = () => setPage(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Click cycles asc -> desc -> off (default: newest first)
  const toggleSort = (key: string) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc') }
    else if (sortDir === 'asc') setSortDir('desc')
    else setSortKey(null)
    resetPage()
  }

  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('pageSize', String(pageSize))
    if (statusFilter) p.set('status', statusFilter)
    if (sortKey) { p.set('sortBy', sortKey); p.set('sortDir', sortDir) }
    return p
  }, [page, pageSize, statusFilter, sortKey, sortDir])

  const { data, isLoading } = useQuery({
    queryKey: ['merchant-complaints', params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/complaints?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json as ComplaintsResponse
    },
  })

  const complaints = data?.data ?? []
  const meta = data?.meta
  const sortProps = { activeKey: sortKey, dir: sortDir, onSort: toggleSort }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Complaints"
        description="Complaints filed against your offers"
        actions={
          <Link href="/merchant/complaints/new">
            <Button>
              <Plus className="mr-1 h-4 w-4" /> File Application Support
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
          {STATUS_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : complaints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No complaints found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {statusFilter ? 'No complaints match this status. Try another filter.' : 'No complaints have been filed against your offers yet.'}
            </p>
            {statusFilter && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setStatusFilter(''); resetPage() }}>
                Clear filter
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
                  <SortableTh label="Employee" sortKey="employee" {...sortProps} className="px-4 py-3" />
                  {/* <th className="px-4 py-3">Company</th> */}
                  <SortableTh label="Offer" sortKey="offer" {...sortProps} className="px-4 py-3" />
                  <SortableTh label="Type" sortKey="type" {...sortProps} className="px-4 py-3" />
                  <SortableTh label="Category" sortKey="category" {...sortProps} className="px-4 py-3" />
                  <SortableTh label="Status" sortKey="status" {...sortProps} className="px-4 py-3" />
                  <SortableTh label="Priority" sortKey="priority" {...sortProps} className="px-4 py-3" />
                  <SortableTh label="Date" sortKey="createdAt" {...sortProps} className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {complaints.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50"
                    onClick={() => window.location.href = `/merchant/complaints/${c.id}`}
                  >
                    <td className="px-4 py-3 font-medium">{c.employee?.firstName} {c.employee?.lastName}</td>
                    {/* <td className="px-4 py-3 text-muted-foreground">{c.company?.name ?? '—'}</td> */}
                    <td className="px-4 py-3">{c.offer?.title ?? '—'}</td>
                    <td className="px-4 py-3 capitalize">{c.complaintType?.replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="px-4 py-3 capitalize">{c.category ? (CATEGORY_LABELS[c.category] ?? c.category) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[c.status] ?? ''}`}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[c.priority] ?? ''}`}>
                        {c.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {meta && (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={meta.total}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              onPageSizeChange={(n) => { setPageSize(n); resetPage() }}
            />
          )}
        </>
      )}
    </div>
  )
}