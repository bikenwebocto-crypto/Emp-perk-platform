'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { PRIORITY_STYLES } from '@/features/complaints/constants'

type TicketType = 'OFFER' | 'APPLICATION_SUPPORT'

interface Complaint {
  id: string
  complaintType: string
  category: string | null
  status: string
  priority: string
  description: string
  createdAt: string
  offer: { title: string } | null
  merchant: { businessName: string } | null
  employee: { firstName: string; lastName: string } | null
  companyAdmin: { firstName: string; lastName: string } | null
  company: { name: string } | null
}

interface ComplaintsResponse {
  success: boolean
  data: Complaint[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-yellow-100 text-yellow-800',
  CLARIFICATION_REQ: 'bg-purple-100 text-purple-800',
  ESCALATED: 'bg-orange-100 text-orange-800',
  RESOLVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const CATEGORY_LABELS: Record<string, string> = {
  BILLING: 'Billing',
  TECHNICAL: 'Technical',
  ACCOUNT: 'Account',
  OTHER: 'Other',
}

// Resolves "who raised this" across the three possible reporter types.
function raisedByLabel(c: Complaint): string {
  if (c.employee) return `${c.employee.firstName} ${c.employee.lastName}`
  if (c.merchant) return c.merchant.businessName
  if (c.companyAdmin) return `${c.companyAdmin.firstName} ${c.companyAdmin.lastName} (Admin)`
  return '—'
}

export default function AdminComplaintsPage() {
  const { page, setPage, pageSize, resetPage } = useTablePagination({ defaultPageSize: 20 })
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [ticketType, setTicketType] = useState<TicketType>('OFFER')

  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('pageSize', String(pageSize))
    p.set('type', ticketType)
    if (search) p.set('q', search)
    if (statusFilter !== 'ALL') p.set('status', statusFilter)
    if (priorityFilter !== 'ALL') p.set('priority', priorityFilter)
    return p
  }, [page, pageSize, search, statusFilter, priorityFilter, ticketType])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-complaints', params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/admin?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json as ComplaintsResponse
    },
  })

  const complaints = data?.data ?? []
  const meta = data?.meta
  const isOfferTab = ticketType === 'OFFER'

  function switchTab(t: TicketType) {
    setTicketType(t)
    resetPage()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Complaints"
        description="Manage complaints from all companies and merchants"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="flex gap-1 border-b">
        <button
          onClick={() => switchTab('OFFER')}
          className={`relative whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
            isOfferTab
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Offer Tickets
        </button>
        <button
          onClick={() => switchTab('APPLICATION_SUPPORT')}
          className={`relative whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
            !isOfferTab
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Application Support
        </button>
      </div>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); resetPage() }}
        searchPlaceholder={isOfferTab ? 'Search by offer, merchant, employee...' : 'Search by description...'}
        filters={[
          {
            key: 'status',
            label: 'All Statuses',
            options: [
              { label: 'Open', value: 'OPEN' },
              { label: 'Under Review', value: 'UNDER_REVIEW' },
              { label: 'Clarification Required', value: 'CLARIFICATION_REQ' },
              { label: 'Escalated', value: 'ESCALATED' },
              { label: 'Resolved', value: 'RESOLVED' },
              { label: 'Rejected', value: 'REJECTED' },
            ],
            value: statusFilter,
            onChange: (v) => { setStatusFilter(v); resetPage() },
          },
          {
            key: 'priority',
            label: 'All Priorities',
            options: [
              { label: 'High', value: 'HIGH' },
              { label: 'Medium', value: 'MEDIUM' },
              { label: 'Low', value: 'LOW' },
            ],
            value: priorityFilter,
            onChange: (v) => { setPriorityFilter(v); resetPage() },
          },
        ]}
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : complaints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No complaints found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3">Raised By</th>
                  <th className="px-4 py-3">Company</th>
                  {isOfferTab ? (
                    <>
                      <th className="px-4 py-3">Offer</th>
                      <th className="px-4 py-3">Merchant</th>
                      <th className="px-4 py-3">Type</th>
                    </>
                  ) : (
                    <th className="px-4 py-3">Category</th>
                  )}
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
                    onClick={() => window.location.href = `/admin/complaints/${c.id}`}
                  >
                    <td className="px-4 py-3 font-medium">{raisedByLabel(c)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.company?.name ?? '—'}</td>
                    {isOfferTab ? (
                      <>
                        <td className="px-4 py-3">{c.offer?.title ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{c.merchant?.businessName ?? '—'}</td>
                        <td className="px-4 py-3 capitalize">{c.complaintType?.replace(/_/g, ' ').toLowerCase()}</td>
                      </>
                    ) : (
                      <td className="px-4 py-3">{c.category ? (CATEGORY_LABELS[c.category] ?? c.category) : '—'}</td>
                    )}
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