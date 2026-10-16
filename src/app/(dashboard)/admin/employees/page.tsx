'use client'
import { useState, useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { DataTable } from '@/components/shared/data-table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { BulkEmployeeUpload } from '@/features/employees/components/bulk-employee-upload'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Upload, Trash2, CheckCircle, XCircle, Pencil, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { ActionImpact, PROMOTED_BADGE_TOOLTIP, promoteCopy } from '@/features/employees/components/action-impact'
import { useEmployees, useBulkUpdateEmployees, useBulkDeleteEmployees, useUpdateEmployee, usePromoteEmployee } from '@/hooks/queries/use-employees'
import { useCompanies } from '@/hooks/queries/use-companies'
import { showToast } from '@/hooks/use-toast'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { EmployeeEditModal } from '@/components/shared/employee-edit-modal'
import type { ColumnDef } from '@/types'

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'INVITED' | 'SUSPENDED' | 'INELIGIBLE'
type CompanyFilter = 'ALL' | string

interface BulkStatusResult {
  data?: { count?: number; skipped?: { id: string; reason: string }[] }
}

function showBulkStatusToast(res: BulkStatusResult, verb: 'activated' | 'deactivated') {
  const count = res.data?.count ?? 0
  const skipped = res.data?.skipped?.length ?? 0
  showToast({
    type: 'success',
    title: `${count} employee(s) ${verb}`,
    description: skipped
      ? `${skipped} skipped: promoted to Company Admin. Manage them from Administrators.`
      : undefined,
  })
}

export default function EmployeesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>('ALL')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showUpload, setShowUpload] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'delete' | 'deactivate'>('delete')
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null)
  const [promotingEmployee, setPromotingEmployee] = useState<{
    id: string
    name: string
    companyName: string
    status: string
  } | null>(null)
  const promoteDialogCopy = promoteCopy({
    name: promotingEmployee?.name ?? 'this employee',
    companyName: promotingEmployee?.companyName ?? 'their company',
    employeeStatus: promotingEmployee?.status,
  })

  const { page, setPage, pageSize, resetPage } = useTablePagination({ defaultPageSize: 10 })

  const { data, isLoading } = useEmployees({
    status: statusFilter,
    companyId: companyFilter,
    q: search || undefined,
    page,
    pageSize,
  })

  const { data: companiesData } = useCompanies()
  const bulkUpdate = useBulkUpdateEmployees()
  const bulkDelete = useBulkDeleteEmployees()
  const updateEmployee = useUpdateEmployee()
  const promoteEmployee = usePromoteEmployee()

  const employees = data?.data ?? []
  const meta = data?.meta
  const companies = companiesData?.data ?? []

  const companyOptions = useMemo(
    () => companies.map((c: any) => ({ label: c.name, value: c.id })),
    [companies],
  )

  const tableEmployees = useMemo(() =>
    employees.map((e: any) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e?.account?.email ?? 'N/A',
      companyId: e.companyId,
      companyName: e.company?.name ?? '—',
      department: e.department ?? '—',
      jobTitle: e.jobTitle ?? '',
      employeeId: e.employeeId ?? '',
      phone: e.phone ?? '',
      status: e.status,
      isPromoted: !!e.account?.role && e.account.role !== 'EMPLOYEE',
      totalRedemptions: e._count?.redemptions ?? 0,
      joinedAt: e.createdAt,
      avatarUrl: e.avatarUrl ?? '',
    })),
  [employees])

  const selectedCount = selectedIds.size

  const employeeColumns: ColumnDef<any>[] = [
    {
      key: 'name',
      header: 'Employee',
      render: (e: any) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{(e.name ?? '?').charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{e.name}</p>
            <p className="text-xs text-muted-foreground">{e.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'companyName',
      header: 'Company',
      render: (e: any) => <span className="text-muted-foreground">{e.companyName}</span>,
    },
    { key: 'department', header: 'Department' , render: (e: any) => <span className="text-muted-foreground">{e.department}</span>},
    {
      key: 'status',
      header: 'Status',
      render: (e: any) =>
        e.isPromoted ? (
          <span title={PROMOTED_BADGE_TOOLTIP} className="inline-flex cursor-help items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            <ShieldCheck className="h-3 w-3" /> Promoted to Admin
          </span>
        ) : (
          <StatusBadge status={e.status} />
        ),
    },
    { key: 'email', header: 'Email', render: (e: any) => <span className="text-muted-foreground">{e?.email}</span>, align: 'center' },
    {
      key: 'joinedAt',
      header: 'Joined',
      render: (e: any) => new Date(e.joinedAt).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      render: (e: any) => (
        <div className="flex items-center justify-end gap-1">
          {!e.isPromoted && (e.status === 'ACTIVE' || e.status === 'INACTIVE') && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setPromotingEmployee(e)}
              title="Promote to Company Admin"
              aria-label="Promote to Company Admin"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setEditingEmployee(e)}
            title="Edit employee"
            aria-label="Edit employee"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  const handleSelectChange = useCallback((ids: Set<string>) => setSelectedIds(ids), [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleBulkActivate = useCallback(() => {
    bulkUpdate.mutate(
      { employeeIds: Array.from(selectedIds), status: 'ACTIVE' },
      {
        onSuccess: (res: BulkStatusResult) => showBulkStatusToast(res, 'activated'),
        onError: (err: Error) => showToast({ type: 'error', title: 'Activation failed', description: err.message }),
      },
    )
    clearSelection()
  }, [selectedIds, bulkUpdate, clearSelection, selectedCount])

  const handleBulkDeactivate = useCallback(() => {
    bulkUpdate.mutate(
      { employeeIds: Array.from(selectedIds), status: 'INACTIVE' },
      {
        onSuccess: (res: BulkStatusResult) => showBulkStatusToast(res, 'deactivated'),
        onError: (err: Error) => showToast({ type: 'error', title: 'Deactivation failed', description: err.message }),
      },
    )
    clearSelection()
  }, [selectedIds, bulkUpdate, clearSelection, selectedCount])

  const handleBulkDelete = useCallback(() => {
    bulkDelete.mutate(
      Array.from(selectedIds),
      {
        onSuccess: () => showToast({ type: 'success', title: `${selectedCount} employee(s) deleted` }),
        onError: (err: Error) => showToast({ type: 'error', title: 'Delete failed', description: err.message }),
      },
    )
    clearSelection()
  }, [selectedIds, bulkDelete, clearSelection, selectedCount])

  const openConfirm = useCallback((action: 'delete' | 'deactivate') => {
    setConfirmAction(action)
    setConfirmOpen(true)
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="View and manage employees across companies"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowUpload(true)}>
              <Upload className="mr-1 h-4 w-4" />Bulk Upload
            </Button>
            <Link href="/admin/employees/add">
              <Button><Plus className="mr-1 h-4 w-4" />Add Employee</Button>
            </Link>
          </div>
        }
      />

      <BulkEmployeeUpload open={showUpload} onOpenChange={setShowUpload} />

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employees..."
        filters={[
          { key: 'company', label: 'All Companies', options: companyOptions, value: companyFilter, onChange: (v) => setCompanyFilter(v) },
          { key: 'status', label: 'All Statuses', options: [{ label: 'Active', value: 'ACTIVE' }, { label: 'Inactive', value: 'INACTIVE' }, { label: 'Invited', value: 'INVITED' }, { label: 'Suspended', value: 'SUSPENDED' }, { label: 'Ineligible', value: 'INELIGIBLE' }], value: statusFilter, onChange: (v) => setStatusFilter(v as StatusFilter) },
        ]}
      />

      {selectedCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="success" onClick={handleBulkActivate}>
              <CheckCircle className="mr-1 h-4 w-4" />Activate
            </Button>
            <Button size="sm" variant="warning" onClick={() => openConfirm('deactivate')}>
              <XCircle className="mr-1 h-4 w-4" />Deactivate
            </Button>
            <Button size="sm" variant="destructive" onClick={() => openConfirm('delete')}>
              <Trash2 className="mr-1 h-4 w-4" />Delete
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={employeeColumns}
        data={tableEmployees}
        keyExtractor={(e: any) => e.id}
        isLoading={isLoading}
        emptyMessage="No employees found"
        selectable
        selectedIds={selectedIds}
        onSelectChange={handleSelectChange}
        pagination={{
          page,
          pageSize,
          total: meta?.total ?? tableEmployees.length,
          onPageChange: setPage,
        }}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={confirmAction === 'delete' ? 'Delete Employees' : 'Deactivate Employees'}
        message={
          confirmAction === 'delete'
            ? `Are you sure you want to delete ${selectedCount} employee(s)? This action cannot be undone.`
            : `Are you sure you want to deactivate ${selectedCount} employee(s)?`
        }
        confirmLabel={confirmAction === 'delete' ? 'Delete' : 'Deactivate'}
        onConfirm={() => {
          if (confirmAction === 'delete') handleBulkDelete()
          else handleBulkDeactivate()
          setConfirmOpen(false)
        }}
        onCancel={() => setConfirmOpen(false)}
      >
        {confirmAction === 'deactivate' && (
          <ActionImpact
            copy={{
              message: '',
              impacts: [
                'They can no longer use the mobile app or redeem offers.',
                'Their savings history is kept, and you can activate them again at any time.',
              ],
              note: 'Anyone selected who was promoted to Company Admin is skipped. Manage them from Company Administrators.',
            }}
          />
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!promotingEmployee}
        title="Promote to Company Admin"
        variant="default"
        confirmLabel="Promote"
        loading={promoteEmployee.isPending}
        message={promoteDialogCopy.message}
        onConfirm={() => {
          if (!promotingEmployee?.id) return
          promoteEmployee.mutate(
            { id: promotingEmployee.id },
            {
              onSuccess: () => {
                showToast({ type: 'success', title: 'Employee promoted to Company Admin' })
                setPromotingEmployee(null)
              },
              onError: (err: Error) =>
                showToast({ type: 'error', title: 'Promotion failed', description: err.message }),
            },
          )
        }}
        onCancel={() => setPromotingEmployee(null)}
      >
        <ActionImpact copy={promoteDialogCopy} />
      </ConfirmDialog>

      <EmployeeEditModal
        open={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        employee={editingEmployee ?? { id: '' }}
        scope="admin"
        saving={updateEmployee.isPending}
        onSave={async (data: Record<string, unknown>) => {
          if (!editingEmployee?.id) return
          await updateEmployee.mutateAsync({ id: editingEmployee.id, ...data })
        }}
      />
    </div>
  )
}
