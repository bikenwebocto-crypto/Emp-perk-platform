'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Store, Building2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { DataTable } from '@/components/shared/data-table'
import { StatusBadge } from '@/components/shared/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useLeads, type Lead } from '@/hooks/queries/use-leads'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { LeadActions } from '@/features/leads/components/lead-actions'
import type { ColumnDef } from '@/types'

type TypeTab = 'ALL' | 'MERCHANT' | 'EMPLOYER'
type StatusFilter = 'ALL' | 'NEW' | 'CONTACTED' | 'REJECTED' | 'CONVERTED'

const TABS: { label: string; value: TypeTab }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Merchants', value: 'MERCHANT' },
  { label: 'Employers', value: 'EMPLOYER' },
]

export default function LeadsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [typeTab, setTypeTab] = useState<TypeTab>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const { page, setPage, pageSize } = useTablePagination({ defaultPageSize: 10 })

  const { data, isLoading } = useLeads({
    type: typeTab !== 'ALL' ? typeTab : undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    q: search || undefined,
    page,
    pageSize,
  })

  const leads = useMemo<any[]>(() => data?.data ?? [], [data])

  const columns: ColumnDef<any>[] = [
    {
      key: 'type',
      header: 'Type',
      render: (l: Lead) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          {l.type === 'MERCHANT'
            ? <><Store className="h-3.5 w-3.5 text-muted-foreground" /> Merchant</>
            : <><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Employer</>}
        </span>
      ),
    },
    {
      key: 'companyName',
      header: 'Company',
      render: (l: Lead) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{(l.companyName ?? '?').charAt(0)}</AvatarFallback>
          </Avatar>
          <p className="font-medium">{l.companyName}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (l: Lead) => <span className="text-sm">{l.firstName} {l.lastName}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      render: (l: Lead) => (
        <div className="flex items-center gap-1 text-sm">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{l.email}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (l: Lead) => <StatusBadge status={l.status} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (l: Lead) => new Date(l.createdAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (l: Lead) => <LeadActions lead={l} compact />,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Leads" description="Merchant and employer enquiries from the public forms" />
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <Button
            key={tab.value}
            variant="ghost"
            size="sm"
            className={`rounded-none border-b-2 ${typeTab === tab.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'}`}
            onClick={() => { setTypeTab(tab.value); setPage(1) }}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search by company name, email, or contact name..."
        filters={[
          {
            key: 'status',
            label: 'All Statuses',
            options: [
              { label: 'New', value: 'NEW' },
              { label: 'Contacted', value: 'CONTACTED' },
              { label: 'Converted', value: 'CONVERTED' },
              { label: 'Rejected', value: 'REJECTED' },
            ],
            value: statusFilter,
            onChange: (v) => { setStatusFilter(v as StatusFilter); setPage(1) },
          },
        ]}
      />
      <DataTable
        columns={columns}
        data={leads}
        keyExtractor={(l: any) => l.id}
        isLoading={isLoading}
        emptyMessage="No leads found"
        onRowClick={(l: any) => router.push(`/admin/leads/${l.id}`)}
        pagination={{
          page,
          pageSize,
          total: data?.meta?.total ?? leads.length,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}
