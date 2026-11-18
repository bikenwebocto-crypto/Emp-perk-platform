'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DataTable } from '@/components/shared/data-table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { StatusBadge } from '@/components/shared/status-badge'
import { showToast } from '@/hooks/use-toast'
import { Trash2, RotateCcw, Search } from 'lucide-react'
import type { ColumnDef, TableSortConfig } from '@/types'

const PAGE_SIZE = 10

type DeletedOffer = {
  id: string
  title: string
  status: string
  deletedAt: string | null
  merchant: { id: string; businessName: string } | null
  _count?: { redemptions: number }
} & Record<string, unknown>

type PendingAction = { type: 'restore' | 'delete'; offer: DeletedOffer } | null

export default function AdminDeletedOffersPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<TableSortConfig>({ key: 'deletedAt', direction: 'desc' })
  const [pending, setPending] = useState<PendingAction>(null)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin-deleted-offers', page, q, sort.key, sort.direction],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sortBy: sort.key,
        sortDir: sort.direction,
      })
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/offers/deleted?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to fetch')
      return json as {
        data: DeletedOffer[]
        meta: { page: number; pageSize: number; total: number; totalPages: number }
      }
    },
  })

  const offers = data?.data ?? []
  const total = data?.meta?.total ?? 0

  // If the current page became empty (e.g. after restoring the last row), step back
  useEffect(() => {
    if (!isFetching && data && offers.length === 0 && page > 1) setPage((p) => p - 1)
  }, [isFetching, data, offers.length, page])

  const onDone = (title: string) => {
    showToast({ type: 'success', title })
    setPending(null)
    queryClient.invalidateQueries({ queryKey: ['admin-deleted-offers'] })
  }

  const restoreMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await fetch(`/api/admin/offers/${offerId}/restore`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to restore')
      return json
    },
    onSuccess: () => onDone('Offer restored'),
    onError: (err: Error) => showToast({ type: 'error', title: err.message }),
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await fetch(`/api/admin/offers/${offerId}/permanent`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to permanently delete')
      return json
    },
    onSuccess: () => onDone('Offer permanently deleted'),
    onError: (err: Error) => showToast({ type: 'error', title: err.message }),
  })

  const busy = restoreMutation.isPending || permanentDeleteMutation.isPending

  const columns = useMemo<ColumnDef<DeletedOffer>[]>(
    () => [
      {
        key: 'merchant',
        header: 'Merchant',
        render: (o) => (
          <span className="font-medium">{o.merchant?.businessName ?? 'Unknown'}</span>
        ),
      },
      {
        key: 'title',
        header: 'Offer Title',
        render: (o) => (
          <div className="flex items-center gap-2">
            <span>{o.title}</span>
            <StatusBadge status={o.status} label={o.status} />
          </div>
        ),
      },
      {
        key: 'deletedAt',
        header: 'Date Deleted',
        render: (o) =>
          o.deletedAt ? (
            <span className="text-muted-foreground">
              {new Date(o.deletedAt).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          ) : (
            '-'
          ),
      },
      {
        key: 'actions',
        header: 'Action',
        sortable: false,
        align: 'right',
        render: (o) => (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                setPending({ type: 'restore', offer: o })
              }}
            >
              <RotateCcw className="mr-1 h-4 w-4" /> Restore
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                setPending({ type: 'delete', offer: o })
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete Forever
            </Button>
          </div>
        ),
      },
    ],
    [busy],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recycle Bin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage soft-deleted offers. Restore or permanently delete.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent py-1 pl-9 pr-3 text-sm"
          placeholder="Search by offer title or merchant..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <DataTable<DeletedOffer>
            columns={columns}
            data={offers}
            keyExtractor={(o) => o.id}
            isLoading={isLoading}
            emptyMessage={q ? 'No deleted offers match your search' : 'No deleted offers found'}
            sortConfig={sort}
            onSort={(cfg) => {
              setSort(cfg.key ? cfg : { key: 'deletedAt', direction: 'desc' })
              setPage(1)
            }}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total,
              onPageChange: setPage,
            }}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pending?.type === 'restore'}
        title="Restore offer?"
        message={`"${pending?.offer.title ?? ''}" will be restored to the merchant's offers with its previous status.`}
        confirmLabel="Restore"
        variant="default"
        loading={restoreMutation.isPending}
        onConfirm={() => pending && restoreMutation.mutate(pending.offer.id)}
        onCancel={() => !busy && setPending(null)}
      />

      <ConfirmDialog
        open={pending?.type === 'delete'}
        title="Permanently delete offer?"
        message={`"${pending?.offer.title ?? ''}" and its images, QR code and related data will be removed forever. This cannot be undone.`}
        confirmLabel="Delete Forever"
        variant="destructive"
        loading={permanentDeleteMutation.isPending}
        onConfirm={() => pending && permanentDeleteMutation.mutate(pending.offer.id)}
        onCancel={() => !busy && setPending(null)}
      />
    </div>
  )
}
