'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useMerchantOffers, useBulkDeleteMerchantOffers, useRevokeMerchantOffer } from '@/hooks/queries/use-merchant-offers'
import { DataTable } from '@/components/shared/data-table'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { showToast } from '@/hooks/use-toast'
import { FeaturedLiveCarousel } from '@/components/merchant/FeaturedLiveCarousel'
import { Plus, Pencil, ExternalLink, Gift, RefreshCw, Clock, History, Trash2, BadgeCheck, AlertCircle, Ban } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import type { ColumnDef } from '@/types'

const statusLabels: Record<string, string> = {
  LIVE: 'Live',
  DRAFT: 'Draft',
  VALIDATION_IN_PROGRESS: 'Validation In Progress',
  AWAITING_APPROVAL: 'Awaiting Approval',
  VALIDATION_FAILED: 'Validation Failed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  REPLACED: 'Replaced',
  ARCHIVED: 'Archived',
  CHANGES_REQUESTED: 'Changes Requested',
  PENDING_APPROVAL: 'Pending Approval',
  REPLACEMENT_PENDING: 'Replacement Pending',
}

function formatValue(o: any): string {
  const cfg = (o?.pricing?.configuration as Record<string, any>) ?? {}
  const offerType = o?.offerType
  if (offerType === 'percentage' || offerType === 'PERCENTAGE') {
    return `${Number(cfg.percent ?? cfg.amount ?? 0)}% OFF`
  }
  if (offerType === 'buy_x_get_y' || offerType === 'BUY_X_GET_Y') {
    return 'Buy X Get Y'
  }
  const amount = Number(cfg.amount ?? 0)
  return `€${amount.toFixed(2)} OFF`
}

export default function MerchantOffersPage() {
  const [showAdminNotes, setShowAdminNotes] = useState(true)
  const [showRejectionReason, setShowRejectionReason] = useState(true)
  const [tab, setTab] = useState<'all' | 'drafts' | 'history'>('all')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<any>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const scope = tab === 'drafts' ? 'drafts' : tab === 'history' ? 'history' : undefined
  const bulkDelete = useBulkDeleteMerchantOffers()
  const revokeOffer = useRevokeMerchantOffer()

  const { data, isLoading } = useMerchantOffers({
    page,
    pageSize: 10,
    scope ,
    q: search || undefined,
  })

  const offers = data?.data ?? []
  const currentLive = data?.currentLive ?? null
  const pendingReplacement = data?.pendingReplacement ?? null
  const pendingReplacementRequest = data?.pendingReplacementRequest ?? null
  const meta = data?.meta ?? { total: 0, totalPages: 1 }

  // Live offers for the Featured Carousel (top 5)
 const { data: liveData } = useMerchantOffers({
  page: 1,
  pageSize: 5,
  scope: undefined,
  })
const liveOffers = (liveData?.data ?? []).filter((o: any) => o.status === 'LIVE').slice(0, 5)

  const columns: ColumnDef<any>[] = [
    { key: 'title', header: 'Title' , render: (o: any) => <span className="font-medium">{o.title}</span> },
    {
      key: 'offerType',
      header: 'Type',
      render: (o: any) => {
        const labels: Record<string, string> = { FLAT: 'Flat', PERCENTAGE: '% Off', BUY_X_GET_Y: 'BOGO' }
        return <span className="text-sm">{labels[o.offerType] ?? o.offerType}</span>
      },
    },
    {
      key: 'discountValue',
      header: 'Value',
      render: (o: any) => {
        const cfg = (o.pricing?.configuration as Record<string, any>) ?? {}
        const amount = Number(cfg.amount ?? cfg.percent ?? 0)
        const suffix = o.offerType === 'percentage' || o.offerType === 'PERCENTAGE' ? '%' : ''
        return <span>{o.offerType === 'percentage' || o.offerType === 'PERCENTAGE' ? `${amount}%` : `€${amount.toFixed(2)}`}</span>
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (o: any) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={o.status}  />
          {currentLive && o.id === currentLive.id && pendingReplacement && (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
              <Clock className="h-3 w-3" /> Replacement Pending
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'currentRedemptions',
      header: 'Redemptions',
      align: 'center',
      render: (o: any) => {
        const max = o.capacity?.maxRedemptions ?? '∞'
        return <span>{o.capacity?.redeemedCount ?? 0}/{max}</span>
      },
    },
    {
      key: 'startDate',
      header: 'Start',
      render: (o: any) => new Date(o.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    {
      key: 'endDate',
      header: 'End',
      render: (o: any) => new Date(o.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    {
      key: 'actions',
      header: '',
      render: (o: any) => (
        <div className="flex items-center gap-1.5">
          {['DRAFT', 'VALIDATION_FAILED','ARCHIVED','AWAITING_APPROVAL'].includes(o.status) && (
            <Button variant="outline" size="sm" asChild className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/50">
              <Link href={`/merchant/offers/${o.id}/edit`} onClick={(e) => e.stopPropagation()} title="Edit offer">
                <Pencil className="h-3.5 w-3.5" /> 
              </Link>
            </Button>
          )}
          {o.status === 'LIVE' && !pendingReplacement && (
            <>
              <Button variant="outline" size="sm" asChild className="h-8 border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/50">
                <Link href={`/merchant/offers/${o.id}/replace`} onClick={(e) => e.stopPropagation()} title="Replace offer">
                  <RefreshCw className="h-3.5 w-3.5" /> 
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([o.id])); setRevokeTarget(o); setRevokeOpen(true) }}
                className="h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                title="Revoke offer"
              >
                <Ban className="h-3.5 w-3.5" /> 
              </Button>
            </>
          )}
          {o.status === 'LIVE' && pendingReplacement && (
            <>
              <Button variant="outline" size="sm" disabled className="h-8 opacity-50 cursor-not-allowed">
                <RefreshCw className="h-3.5 w-3.5" /> 
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([o.id])); setRevokeTarget(o); setRevokeOpen(true) }}
                className="h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                title="Revoke offer"
              >
                <Ban className="h-3.5 w-3.5" /> 
              </Button>
            </>
          )}
          {['DRAFT', 'VALIDATION_FAILED', 'REJECTED', 'EXPIRED', 'REPLACED', 'AWAITING_APPROVAL', 'ARCHIVED'].includes(o.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set([o.id])); setDeleteOpen(true) }}
              className="h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
              title="Delete offer"
            >
              <Trash2 className="h-3.5 w-3.5" /> 
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="h-8">
            <Link href={`/merchant/offers/${o.id}`} onClick={(e) => e.stopPropagation()} title="View details">
              <ExternalLink className="h-3.5 w-3.5" /> 
            </Link>
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Offers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your discount offers and promotions</p>
        </div>
        <Link href="/merchant/offers/create">
          <Button><Plus className="mr-1 h-4 w-4" /> Create New Offer</Button>
        </Link>
      </div>

      {/* Featured Live Offers Carousel */}
      <FeaturedLiveCarousel offers={liveOffers} isLoading={isLoading} />

      {/* Replacement Status Card */}
      {pendingReplacement && currentLive && (
        <Card className="border-blue-300">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              {pendingReplacement.status === 'CHANGES_REQUESTED' ? (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              ) : (
                <Clock className="h-4 w-4 text-blue-600" />
              )}
              Replacement {pendingReplacementRequest?.status === 'CLARIFICATION_REQUESTED' || pendingReplacement.status === 'CHANGES_REQUESTED' ? 'Changes Requested' : 'Pending Approval'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs uppercase text-muted-foreground">Current Offer</p>
                <p className="mt-1 font-medium">{currentLive.title}</p>
                <p className="text-xs text-muted-foreground">{formatValue(currentLive)}</p>
              </div>
              <div className="rounded-md border-2 border-blue-300 bg-blue-50/50 p-3 dark:bg-blue-950/20">
                <p className="text-xs uppercase text-muted-foreground">Replacement</p>
                <p className="mt-1 font-medium">{pendingReplacement.title}</p>
                <p className="text-xs text-muted-foreground">{formatValue(pendingReplacement)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="text-muted-foreground">
                <span>Submitted {new Date(pendingReplacement.createdAt ?? pendingReplacement.submittedAt ?? Date.now()).toLocaleDateString()}</span>
                <span className="mx-2">&middot;</span>
                <span>Status: <strong className="text-foreground">{statusLabels[pendingReplacement.status] ?? pendingReplacement.status}</strong></span>
              </div>
              <Link href={`/merchant/offers/${pendingReplacement.id}/edit`}>
                <Button size="sm" variant="outline">View Replacement</Button>
              </Link>
            </div>
            {pendingReplacement.status === 'CHANGES_REQUESTED' && pendingReplacement.review?.reviewNotes && showAdminNotes && (
              <Alert
                className="mt-3"
                variant="warning"
                title="Admin notes"
                description={pendingReplacement.review.reviewNotes}
                onClose={() => setShowAdminNotes(false)}
              />
            )}
            {pendingReplacement.status === 'REJECTED' && pendingReplacement.review?.rejectionReason && showRejectionReason && (
              <Alert
                className="mt-3"
                variant="error"
                title="Rejection reason"
                description={pendingReplacement.review.rejectionReason}
                onClose={() => setShowRejectionReason(false)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b gap-0">
        {([
          { key: 'all', label: 'All Offers', icon: Gift },
          { key: 'drafts', label: 'Drafts', icon: RefreshCw },
          { key: 'history', label: 'History', icon: History },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1) }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
        <Link
          href="/merchant/offers/archived"
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <History className="h-4 w-4" /> Archived &rarr;
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <input
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search offers..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1 text-sm">
            <span className="text-muted-foreground">{selectedIds.size} selected</span>
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete Selected
            </Button>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={offers}
        keyExtractor={(o: any) => o.id}
        isLoading={isLoading}
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        emptyMessage={tab === 'drafts' ? 'No drafts' : tab === 'history' ? 'No offer history' : 'No offers found'}
        pagination={{
          page,
          pageSize: 10,
          total: meta.total,
          onPageChange: setPage,
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Offers"
        message={`Are you sure you want to delete ${selectedIds.size} offer(s)? This will permanently remove them.`}
        confirmLabel={`Delete ${selectedIds.size} Offer(s)`}
        loading={bulkDelete.isPending}
        onConfirm={async () => {
          try {
            await bulkDelete.mutateAsync(Array.from(selectedIds))
            showToast({ type: 'success', title: `${selectedIds.size} offer(s) deleted` })
            setSelectedIds(new Set())
          } catch (err: any) {
            showToast({ type: 'error', title: 'Failed', description: err.message })
          } finally {
            setDeleteOpen(false)
          }
        }}
        onCancel={() => setDeleteOpen(false)}
      />

      <ConfirmDialog
        open={revokeOpen}
        title="Revoke Offer"
        message={`Are you sure you want to revoke "${revokeTarget?.title}"? This will deactivate the offer and it will no longer be visible to employees.`}
        confirmLabel="Revoke"
        loading={revokeOffer.isPending}
        onConfirm={async () => {
          if (!revokeReason.trim() || !revokeTarget) {
            showToast({ type: 'error', title: 'Required', description: 'Please provide a reason for revocation' })
            return
          }
          try {
            await revokeOffer.mutateAsync({ id: revokeTarget.id, reason: revokeReason.trim() })
            showToast({ type: 'success', title: 'Offer revoked' })
            setRevokeOpen(false)
            setRevokeTarget(null)
            setRevokeReason('')
            setSelectedIds(new Set())
          } catch (err: any) {
            showToast({ type: 'error', title: 'Failed', description: err.message })
          }
        }}
        onCancel={() => { setRevokeOpen(false); setRevokeTarget(null); setRevokeReason('') }}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Reason for revocation</label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Explain why you are revoking this offer..."
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
