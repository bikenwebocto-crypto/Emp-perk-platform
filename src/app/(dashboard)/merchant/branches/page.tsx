'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, MapPin, Building2, Globe, Eye, Pencil, Power, PowerOff, Trash2, Star, AlertTriangle,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { showToast } from '@/hooks/use-toast'
import {
  useMerchantBranches,
  useDeleteBranch,
} from '@/hooks/queries/use-merchant-branches'
import {
  BRANCH_STATUS_LABELS,
  BRANCH_STATUS_STYLES,
  BRANCH_TYPE_LABELS,
  BRANCH_DISPLAY_TYPE_LABELS,
  BRANCH_DISPLAY_TYPE_STYLES,
  getBranchDisplayType,
} from '@/lib/branch-helpers'
import type { BranchType } from '@/types'

type StatusFilter = 'all' | 'active' | 'inactive'

export default function MerchantBranchesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<BranchType | 'ALL'>('ALL')
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; name: string } | null>(null)
  const [confirmActivate, setConfirmActivate] = useState<{ id: string; name: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null)

  const { data, isLoading, isFetching } = useMerchantBranches({
    status: 'all',                 // always fetch all; the tab filters on the client
    type: typeFilter,
    q: search.trim() || undefined,
  })
  const deleteBranch = useDeleteBranch()
  const allBranches = (data?.data ?? []) as any[]
  const isBranchActive = (b: any) => b.isActive && b.status === 'ACTIVE'
    const counts = useMemo(() => {
    const active = allBranches.filter(isBranchActive).length
    return { all: allBranches.length, active, inactive: allBranches.length - active }
    }, [allBranches])

const branches = useMemo(() => {
  if (statusFilter === 'active') return allBranches.filter(isBranchActive)
  if (statusFilter === 'inactive') return allBranches.filter((b) => !isBranchActive(b))
  return allBranches
}, [allBranches, statusFilter])

  const [activating, setActivating] = useState(false)
  const [deactivating, setDeactivating] = useState(false)

  async function handleActivate(id: string) {
    setActivating(true)
    try {
      const res = await fetch(`/api/merchant/branches/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to activate')
      showToast({ type: 'success', title: 'Branch activated' })
      router.refresh()
    } catch (e: any) {
      showToast({ type: 'error', title: 'Failed to activate', description: e.message })
    }
    setActivating(false)
    setConfirmActivate(null)
  }

  async function handleDeactivate(id: string) {
    setDeactivating(true)
    try {
      const res = await fetch(`/api/merchant/branches/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Failed to deactivate')
      showToast({ type: 'success', title: 'Branch deactivated' })
      router.refresh()
    } catch (e: any) {
      showToast({ type: 'error', title: 'Failed to deactivate', description: e.message })
    }
    setDeactivating(false)
    setConfirmDeactivate(null)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    try {
      await deleteBranch.mutateAsync(confirmDelete.id)
      showToast({ type: 'success', title: 'Branch closed' })
    } catch (e: any) {
      showToast({ type: 'error', title: 'Failed to close branch', description: e.message })
    }
    setConfirmDelete(null)
  }
const hasFilter =
  statusFilter !== 'all' || typeFilter !== 'ALL' || search.trim() !== ''
  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="Manage physical and online branches for your business"
        actions={
          <Link href="/merchant/branches/new">
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              Add Branch
            </Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search branches by name, city, or address…"
            className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as BranchType | 'ALL')}
          >
            <option value="ALL">All Types</option>
            <option value="IN_STORE">In-Store</option>
            <option value="ONLINE">Online</option>
          </select>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {([
          { key: 'all', label: `All (${counts.all})` },
          { key: 'active', label: `Active (${counts.active})` },
          { key: 'inactive', label: `Inactive (${counts.inactive})` },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key as StatusFilter)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
  <div className="space-y-2">
    {[...Array(3)].map((_, i) => (
      <Skeleton key={i} className="h-20 w-full" />
    ))}
  </div>
) : branches.length === 0 ? (
  <Card>
    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
      <Building2 className="h-10 w-10 text-muted-foreground" />
      <p className="mt-3 text-lg font-medium">
        {hasFilter ? 'No branches match this filter' : 'No branches yet'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasFilter
          ? 'Try another tab or clear the search.'
          : 'Add your first branch so employees can find and redeem your offers.'}
      </p>
      {!hasFilter && (
        <Link href="/merchant/branches/new" className="mt-4">
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            Add Branch
          </Button>
        </Link>
      )}
    </CardContent>
  </Card>
) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b: any) => {
                const displayType = getBranchDisplayType(b)
                const isActive = b.isActive && b.status === 'ACTIVE'
                return (
                  <tr key={b.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5">
                          {b.branchType === 'ONLINE' ? (
                            <Globe className="h-4 w-4 text-purple-600" />
                          ) : (
                            <Building2 className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium">{b.name}</p>
                            {b.isPrimary && (
                              <Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-label="Primary" />
                            )}
                          </div>
                          {b.branchType === 'ONLINE' && (
                            <p className="text-xs text-muted-foreground">
                              {b.isNationwide
                                ? 'Nationwide'
                                : b.deliveryRadiusKm
                                ? `Delivers within ${b.deliveryRadiusKm} km`
                                : 'Pure digital'}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {b.branchType === 'IN_STORE' ? (
                        <div className="text-xs">
                          <p>{b.city}{b.state ? `, ${b.state}` : ''}</p>
                          <p className="text-muted-foreground">{b.country}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BRANCH_DISPLAY_TYPE_STYLES[displayType]}`}>
                        {BRANCH_DISPLAY_TYPE_LABELS[displayType]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BRANCH_STATUS_STYLES[b.status as keyof typeof BRANCH_STATUS_STYLES]}`}>
                        {BRANCH_STATUS_LABELS[b.status as keyof typeof BRANCH_STATUS_LABELS]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(b.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Link href={`/merchant/branches/${b.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="View">
                            <Eye className="h-3 w-3" />
                          </Button>
                        </Link>
                        <Link href={`/merchant/branches/${b.id}/edit`}>
                          <Button size="sm" variant="ghost" className="h-7 px-2" aria-label="Edit">
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </Link>
                        {isActive ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            aria-label="Deactivate"
                            onClick={() => setConfirmDeactivate({ id: b.id, name: b.name })}
                          >
                            <PowerOff className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            aria-label="Activate"
                            onClick={() => setConfirmActivate({ id: b.id, name: b.name })}
                          >
                            <Power className="h-3 w-3 text-green-600" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive"
                          aria-label="Delete"
                          onClick={() => setConfirmDelete({ id: b.id, name: b.name })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeactivate}
        title="Deactivate branch?"
        message={`${confirmDeactivate?.name} will be hidden from employees. You can re-activate it later.`}
        confirmLabel="Deactivate"
        loading={deactivating}
        onConfirm={() => confirmDeactivate && handleDeactivate(confirmDeactivate.id)}
        onCancel={() => setConfirmDeactivate(null)}
      />
      <ConfirmDialog
        open={!!confirmActivate}
        title="Activate branch?"
        message={`${confirmActivate?.name} will become visible to employees again.`}
        confirmLabel="Activate"
        variant="default"
        loading={activating}
        onConfirm={() => confirmActivate && handleActivate(confirmActivate.id)}
        onCancel={() => setConfirmActivate(null)}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="Close this branch?"
        message={`${confirmDelete?.name} will be closed and archived. This action cannot be undone.${branches.length <= 1 ? ' You must keep at least one branch.' : ''}`}
        confirmLabel="Close Branch"
        loading={deleteBranch.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
