'use client'

import { useMemo, useState } from 'react'
import { KeyRound, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { FilterBar } from '@/components/shared/filter-bar'
import { DataTable } from '@/components/shared/data-table'
import { StatusBadge } from '@/components/shared/status-badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { showToast } from '@/hooks/use-toast'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { useCurrentUser } from '@/hooks/queries/use-current-user'
import {
  useAccounts, useResendInvite, useUpdateAccount, type AccountRow,
} from '@/hooks/queries/use-accounts'
import {  CreateAccountDialog } from '@/features/accounts/components/create-account-dialog'
import {
  ADMIN_ROLES,ADMIN_ROLE_LABELS, assignableRoles, canAccessAccounts, canManageTarget, type AdminRoleValue,
} from '@/lib/access/account-access'
import type { ColumnDef } from '@/types'

const ALL = 'ALL'
const STATUS_LABELS: Record<AccountRow['status'], string> = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  INVITE_PENDING: 'PENDING',
}

const nicosia = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Nicosia', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const formatDate = (iso: string) => nicosia.format(new Date(iso))

type Pending =
  | { kind: 'role'; row: AccountRow; role: AdminRoleValue }
  | { kind: 'active'; row: AccountRow; isActive: boolean }

export default function AccountsPage() {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState(ALL)
  const [createOpen, setCreateOpen] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const { page, setPage, pageSize } = useTablePagination({ defaultPageSize: 20 })
  const { data: me } = useCurrentUser()

  const { data, isLoading, isError, error } = useAccounts({
    q: search || undefined,
    role: role !== ALL ? role : undefined,
    page,
    pageSize,
  })
  const rows = useMemo(() => data?.data ?? [], [data])
  const update = useUpdateAccount()
  const resend = useResendInvite()

  const run = async (action: () => Promise<{ message: string }>, ok: string) => {
    try {
      await action()
      showToast({ type: 'success', title: ok })
    } catch (err) {
      showToast({ type: 'error', title: 'Request failed', description: err instanceof Error ? err.message : undefined })
    }
  }

  const confirm = async () => {
    if (!pending) return
    if (pending.kind === 'role') {
      await run(() => update.mutateAsync({ id: pending.row.id, role: pending.role }), 'Role updated')
    } else {
      await run(
        () => update.mutateAsync({ id: pending.row.id, isActive: pending.isActive }),
        pending.isActive ? 'Admin activated' : 'Admin deactivated',
      )
    }
    setPending(null)
  }

  const isSelf = (a: AccountRow) => a.email.toLowerCase() === me?.email?.toLowerCase()
  const actor = { email: me?.email, adminRole: me?.adminRole }
  const canManage = (a: AccountRow) => canManageTarget(actor, { email: a.email, role: a.role })
  const mayCreate = canAccessAccounts({ adminRole: me?.adminRole })
  const assignable = assignableRoles(actor)

  const columns: ColumnDef<AccountRow>[] = [
    {
      key: 'name',
      header: 'Admin',
      render: (a) => (
        <div>
          <p className="font-medium">{a.name || '—'}</p>
          <p className="text-xs text-muted-foreground">{a.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (a) =>
        canManage(a) ? (
          <select
            aria-label={`Role for ${a.email}`}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={a.role}
            disabled={update.isPending}
            onChange={(e) => setPending({ kind: 'role', row: a, role: e.target.value as AdminRoleValue })}
          >
            {assignable.map((r) => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
          </select>
        ) : (
          <span className="text-sm">{ADMIN_ROLE_LABELS[a.role]}</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <span title={a.status === 'INVITE_PENDING' ? 'Invite pending' : undefined}>
          <StatusBadge status={STATUS_LABELS[a.status]} />
        </span>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      render: (a) => (a.lastLoginAt ? formatDate(a.lastLoginAt) : 'Never'),
    },
    { key: 'createdAt', header: 'Created', render: (a) => formatDate(a.createdAt) },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (a) =>
        isSelf(a) ? (
          <span className="text-xs text-muted-foreground">You</span>
        ) : !canManage(a) ? null : (
          <div className="flex justify-end gap-2">
            {a.status === 'INVITE_PENDING' && (
              <Button size="sm" variant="outline" disabled={resend.isPending}
                onClick={() => run(() => resend.mutateAsync(a.id), 'Invitation sent again')}>
                Resend invite
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={update.isPending}
              onClick={() => setPending({ kind: 'active', row: a, isActive: a.status === 'INACTIVE' })}>
              {a.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
            </Button>
          </div>
        ),
    },
  ]

  const dialog = pending && (pending.kind === 'role'
    ? {
        title: 'Change admin role?',
        message: `${pending.row.name || pending.row.email} will become ${ADMIN_ROLE_LABELS[pending.role]}. Their access changes on their next page load (up to 5 minutes).`,
        confirmLabel: 'Change role',
        variant: 'default' as const,
      }
    : pending.isActive
      ? { title: 'Activate admin?', message: `${pending.row.email} will be able to sign in again.`, confirmLabel: 'Activate', variant: 'default' as const }
      : {
          title: 'Deactivate admin?',
          message: `${pending.row.email} will be signed out and can no longer sign in.`,
          confirmLabel: 'Deactivate',
          variant: 'destructive' as const,
        })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Create system admins and assign their role"
        actions={
          mayCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Create admin
            </Button>
          ) : undefined
        }
      />
      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search by name or email..."
        filters={[
          {
            key: 'role', label: 'All roles', value: role,
            options: ADMIN_ROLES.map((r) => ({ label: ADMIN_ROLE_LABELS[r], value: r })),
            onChange: (v) => { setRole(v); setPage(1) },
          },
        ]}
      />
      {isError ? (
        <p className="py-12 text-center text-sm text-destructive">
          Could not load admin accounts{error instanceof Error ? `: ${error.message}` : '.'}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          keyExtractor={(a) => a.id}
          isLoading={isLoading}
          emptyMessage="No admins found"
          emptyAction={
            mayCreate ? (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" /> Create the first admin
              </Button>
            ) : undefined
          }
          pagination={{ page, pageSize, total: data?.meta.total ?? 0, onPageChange: setPage }}
        />
      )}
      <CreateAccountDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.confirmLabel}
        variant={dialog?.variant}
        loading={update.isPending}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
