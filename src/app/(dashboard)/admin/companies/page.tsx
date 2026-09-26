'use client'
import { useState, useMemo, useCallback } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { DataTable } from '@/components/shared/data-table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, ExternalLink, Mail, UserCog, UserX, Users, CheckCircle2, Pause, Ban, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCompanies, useUpdateCompanyStatus } from '@/hooks/queries/use-companies'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { showToast } from '@/hooks/use-toast'
import type { ColumnDef } from '@/types'

type StatusFilter = 'ALL' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'CANCELLED' | 'APPROVED_PENDING_PAYMENT' | 'PENDING'
type AdminStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE'
type StatusAction = 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'CANCELLED'
type ConfirmActionType = StatusAction | null

function getStatusActions(status: string): { primary: StatusAction | null; secondary: StatusAction[] } {
  switch (status) {
    case 'PENDING':
    case 'APPROVED_PENDING_PAYMENT':
      return { primary: 'ACTIVE', secondary: ['CANCELLED'] }
    case 'ACTIVE':
      return { primary: 'PAUSED', secondary: ['SUSPENDED', 'CANCELLED'] }
    case 'PAUSED':
      return { primary: 'ACTIVE', secondary: ['SUSPENDED', 'CANCELLED'] }
    case 'SUSPENDED':
      return { primary: 'ACTIVE', secondary: ['CANCELLED'] }
    default:
      return { primary: null, secondary: [] }
  }
}

const STATUS_ACTION_CONFIG: Record<StatusAction, { label: string; icon: typeof CheckCircle2; className: string; confirmMessage: string }> = {
  ACTIVE: {
    label: 'Activate',
    icon: CheckCircle2,
    className: 'border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/50',
    confirmMessage: 'Mark this company as active?',
  },
  PAUSED: {
    label: 'Pause',
    icon: Pause,
    className: 'border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/50',
    confirmMessage: 'Pause this company? Employees will lose access until reactivated.',
  },
  SUSPENDED: {
    label: 'Suspend',
    icon: Ban,
    className: 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50',
    confirmMessage: 'Suspend this company? This is a stronger action than pausing.',
  },
  CANCELLED: {
    label: 'Cancel',
    icon: XCircle,
    className: 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50',
    confirmMessage: 'Cancel this company? This action is typically not reversible.',
  },
}

export default function CompaniesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [adminStatusFilter, setAdminStatusFilter] = useState<AdminStatusFilter>('ALL')
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmActionType>(null)

  const { page, setPage, pageSize } = useTablePagination({ defaultPageSize: 10 })

  const { data, isLoading } = useCompanies({
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
    adminStatus: adminStatusFilter !== 'ALL' ? adminStatusFilter : undefined,
    q: search || undefined,
    page,
    pageSize,
  })

  const updateStatus = useUpdateCompanyStatus()

  const handleStatusChange = useCallback((id: string, status: StatusAction) => {
    setSelectedCompany(id)
    setConfirmAction(status)
    setConfirmOpen(true)
  }, [])

  const confirmStatusChangeAction = useCallback((status: StatusAction) => {
    if (!selectedCompany) return
    updateStatus.mutate(
      { companyId: selectedCompany, status },
      {
        onSuccess: (res: any) => {
          showToast({ type: 'success', title: res.message ?? `Company ${status.toLowerCase()}` })
          setConfirmOpen(false)
          setSelectedCompany(null)
        },
        onError: (err: Error) => {
          showToast({ type: 'error', title: 'Status update failed', description: err.message })
          setConfirmOpen(false)
          setSelectedCompany(null)
        },
      },
    )
  }, [selectedCompany, updateStatus])

  const companies = data?.data ?? []
  const meta = data?.meta

  const tableCompanies = useMemo(() =>
    companies.map((c: any) => ({
      id: c.id,
      name: c.name,
      companyEmail: c.email,
      companyContact: c.companyContact ?? null,
      primaryAdmin: c.primaryAdmin ?? null,
      admins: c.admins ?? [],
      status: c.status,
      employeeCount: c.employeeCount ?? 0,
      activeRedemptions: c.activeRedemptions ?? 0,
      joinedAt: c.createdAt,
    })),
  [companies])

  const companyColumns: ColumnDef<any>[] = [
    {
      key: 'name',
      header: 'Company',
      render: (c: any) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{(c.name ?? '?').charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{c.name}</p>
            <p className="text-xs text-muted-foreground">{c.companyEmail}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'contactEmail',
      header: 'Contact Email',
      render: (c: any) => (
        <div className="flex items-center gap-1 text-sm">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{c.companyEmail || '—'}</span>
        </div>
      ),
    },
    {
      key: 'primaryAdmin',
      header: 'Primary Admin',
      render: (c: any) => {
        const admin = c.primaryAdmin
        if (!admin) {
          return (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserX className="h-3.5 w-3.5" /> No Admin Assigned
            </span>
          )
        }
        return (
          <div className="flex flex-col">
            <span className="inline-flex items-center gap-1 text-sm font-medium">
              <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
              {admin.firstName} {admin.lastName}
              {admin.role === 'OWNER' && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  Owner
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{admin.email}</span>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (c: any) => <StatusBadge status={c.status} />,
    },
    {
      key: 'employeeCount',
      header: 'Employees',
      align: 'center',
      render: (c: any) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium tabular-nums">{c.employeeCount ?? 0}</span>
        </span>
      ),
    },
    {
      key: 'joinedAt',
      header: 'Created',
      render: (c: any) => new Date(c.joinedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (c: any) => {
        const { primary, secondary } = getStatusActions(c.status)
        return (
          <div className="flex items-center gap-1.5">
            {primary && (() => {
              const cfg = STATUS_ACTION_CONFIG[primary]
              const Icon = cfg.icon
              return (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleStatusChange(c.id, primary) }}
                  className={`h-8 ${cfg.className}`}
                  title={cfg.label}
                >
                  <Icon className="h-3.5 w-3.5" /> {cfg.label}
                </Button>
              )
            })()}
            {secondary.map((status) => {
              const cfg = STATUS_ACTION_CONFIG[status]
              const Icon = cfg.icon
              return (
                <Button
                  key={status}
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); handleStatusChange(c.id, status) }}
                  className={`h-8 w-8 p-0 ${cfg.className}`}
                  title={cfg.label}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              )
            })}
            <Button variant="outline" size="sm" asChild className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/50">
              <Link href={`/admin/companies/${c.id}`} onClick={(e) => e.stopPropagation()} title="View company">
                <ExternalLink className="h-3.5 w-3.5" /> View
              </Link>
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Manage company accounts and subscriptions"
        actions={(
          <Link href="/admin/companies/add">
            <Button><Plus className="mr-1 h-4 w-4" />Add Company</Button>
          </Link>
        )}
      />
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by company name, contact email, or admin email..."
        filters={[
          {
            key: 'status',
            label: 'All Statuses',
            options: [
              { label: 'Active', value: 'ACTIVE' },
              { label: 'Approved (Pending Payment)', value: 'APPROVED_PENDING_PAYMENT' },
              { label: 'Pending', value: 'PENDING' },
              { label: 'Paused', value: 'PAUSED' },
              { label: 'Suspended', value: 'SUSPENDED' },
              { label: 'Cancelled', value: 'CANCELLED' },
            ],
            value: statusFilter,
            onChange: (v) => setStatusFilter(v as StatusFilter),
          },
          {
            key: 'adminStatus',
            label: 'All Admins',
            options: [
              { label: 'Active Admin', value: 'ACTIVE' },
              { label: 'Inactive Admin', value: 'INACTIVE' },
            ],
            value: adminStatusFilter,
            onChange: (v) => setAdminStatusFilter(v as AdminStatusFilter),
          },
        ]}
      />
      <DataTable
        columns={companyColumns}
        data={tableCompanies}
        keyExtractor={(c: any) => c.id}
        isLoading={isLoading}
        emptyMessage="No companies found"
        onRowClick={(c) => router.push(`/admin/companies/${c.id}`)}
        pagination={{
          page,
          pageSize,
          total: meta?.total ?? tableCompanies.length,
          onPageChange: setPage,
        }}
      />
      <ConfirmDialog
        open={confirmOpen}
        title={confirmAction ? STATUS_ACTION_CONFIG[confirmAction].label : ''}
        message={confirmAction ? STATUS_ACTION_CONFIG[confirmAction].confirmMessage : ''}
        confirmLabel={confirmAction ? STATUS_ACTION_CONFIG[confirmAction].label : 'Confirm'}
        loading={updateStatus.isPending}
        onConfirm={() => {
          if (confirmAction && selectedCompany) {
            confirmStatusChangeAction(confirmAction)
          } else {
            setConfirmOpen(false)
            setSelectedCompany(null)
          }
        }}
        onCancel={() => { setConfirmOpen(false); setSelectedCompany(null) }}
      />
    </div>
  )
}