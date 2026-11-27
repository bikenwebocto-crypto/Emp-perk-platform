'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useMerchantOffers, useRevokeMerchantOffer } from '@/hooks/queries/use-merchant-offers'
import { DataTable } from '@/components/shared/data-table'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { showToast } from '@/hooks/use-toast'
import { FeaturedLiveCarousel } from '@/components/merchant/FeaturedLiveCarousel'
import { Plus, Pencil, ExternalLink, Gift, RefreshCw, Copy, Clock, History, BadgeCheck, AlertCircle, Ban, Zap, Info } from 'lucide-react'

const ARCHIVED_INFO =
  'Flash offers you ended early, or offers taken down when an approved replacement went live.'

const DRAFTS_INFO =
  'Offers appear here when you click "Save as Draft" while creating an offer, or when a submitted offer fails automatic validation. Open a draft to finish editing and submit it for approval.'
import { Alert } from '@/components/ui/alert'
import { offerStatusRank } from '@/lib/offers/status-order'
import type { ColumnDef } from '@/types'
import { branchSelectionFromConfig, OFFER_CHANNELS } from '@/lib/offers/channel'

const FLASH_NOTE = 'Flash offers run only while your evergreen offer is live, up to 15 days.'

function channelLabel(o: any): string {
  if (!o.redemption) return '—'
  const { channel } = branchSelectionFromConfig(o.redemption.redemptionType, o.redemption.configuration)
  return OFFER_CHANNELS.find((c) => c.value === channel)?.label ?? '—'
}

function branchesLabel(o: any): string {
  if (!o.redemption) return '—'
  const sel = branchSelectionFromConfig(o.redemption.redemptionType, o.redemption.configuration)
  if (sel.channel === 'ONLINE') return 'Online only'
  if (sel.allBranches) return 'All branches'
  return `${sel.branchIds.length} branch${sel.branchIds.length === 1 ? '' : 'es'}`
}

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
  const [tab, setTab] = useState<'all' | 'flash' | 'drafts' | 'history'>('all')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<any>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const scope = tab === 'all' ? undefined : tab
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
        const labels: Record<string, string> = {
          FLAT: 'Flat amount', flat_rate: 'Flat amount',
          PERCENTAGE: 'Percentage', percentage: 'Percentage',
          BUY_X_GET_Y: 'Buy X get Y', buy_x_get_y: 'Buy X get Y',
        }
        return <span className="text-sm">{labels[o.offerType] ?? o.offerType}</span>
      },
    },
    {
      key: 'discountValue',
      header: 'Value',
      sortValue: (o: any) => {
        const cfg = (o.pricing?.configuration as Record<string, any>) ?? {}
        return Number(cfg.amount ?? cfg.percent ?? 0)
      },
      render: (o: any) => {
        const cfg = (o.pricing?.configuration as Record<string, any>) ?? {}
        const amount = Number(cfg.amount ?? cfg.percent ?? 0)
        const suffix = o.offerType === 'percentage' || o.offerType === 'PERCENTAGE' ? '%' : ''
        return <span>{o.offerType === 'percentage' || o.offerType === 'PERCENTAGE' ? `${amount}%` : `€${amount.toFixed(2)}`}</span>
      },
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (o: any) => <span className="text-sm">{channelLabel(o)}</span>,
    },
    {
      key: 'branches',
      header: 'Branches',
      render: (o: any) => <span className="text-sm">{branchesLabel(o)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (o: any) => offerStatusRank(o.status),
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
      sortValue: (o: any) => o.capacity?.redeemedCount ?? 0,
      render: (o: any) => {
        const max = o.capacity?.maxRedemptions ?? '∞'
        return <span>{o.capacity?.redeemedCount ?? 0}/{max}</span>
      },
    },
    {
      key: 'startDate',
      header: 'Start',
      sortValue: (o: any) => (o.startDate ? new Date(o.startDate).getTime() : undefined),
      render: (o: any) => new Date(o.startDate).toLocaleDateString('en-GB'),
    },
    {
      key: 'endDate',
      header: 'End',
      sortValue: (o: any) => (o.endDate ? new Date(o.endDate).getTime() : undefined),
      render: (o: any) => !o.endDate ? 'No end date' : new Date(o.endDate).toLocaleDateString('en-GB'),
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
                <Link href={`/merchant/offers/${o.id}/duplicate`} onClick={(e) => e.stopPropagation()} title="Duplicate offer">
                  <Copy className="h-3.5 w-3.5" />
                </Link>
              </Button>
              {o.isFlash && !o.isForever && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setRevokeTarget(o); setRevokeOpen(true) }}
                className="h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                title="End early"
              >
                <Ban className="h-3.5 w-3.5" /> End early
              </Button>
              )}
            </>
          )}
          {o.status === 'LIVE' && pendingReplacement && (
            <>
              <Button variant="outline" size="sm" asChild className="h-8 border-purple-200 text-purple-700 hover:bg-purple-50 hover:text-purple-800 dark:border-purple-800 dark:text-purple-400 dark:hover:bg-purple-950/50">
                <Link href={`/merchant/offers/${o.id}/duplicate`} onClick={(e) => e.stopPropagation()} title="Duplicate offer">
                  <Copy className="h-3.5 w-3.5" />
                </Link>
              </Button>
              {o.isFlash && !o.isForever && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setRevokeTarget(o); setRevokeOpen(true) }}
                className="h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/50"
                title="End early"
              >
                <Ban className="h-3.5 w-3.5" /> End early
              </Button>
              )}
            </>
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
          { key: 'flash', label: 'Flash Offer', icon: Zap },
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
            {t.key === 'drafts' && (
              <span
                title={DRAFTS_INFO}
                aria-label={DRAFTS_INFO}
                className="inline-flex cursor-help text-muted-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            )}
          </button>
        ))}
        <Link
          href="/merchant/offers/archived"
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <History className="h-4 w-4" /> Archived
          <span title={ARCHIVED_INFO} aria-label={ARCHIVED_INFO} className="inline-flex cursor-help">
            <Info className="h-3.5 w-3.5" />
          </span>
          &rarr;
        </Link>
      </div>

      {tab === 'flash' && (
        <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <Zap className="h-4 w-4 shrink-0" /> {FLASH_NOTE}
        </p>
      )}

      <div className="flex items-center gap-3">
        <input
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search offers..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
      </div>

      <DataTable
        columns={columns}
        data={offers}
        keyExtractor={(o: any) => o.id}
        isLoading={isLoading}
        emptyMessage={
          tab === 'drafts' ? `No drafts. ${DRAFTS_INFO}`
            : tab === 'history' ? 'No offer history'
            : tab === 'flash' ? 'No flash offers yet'
            : search ? 'No offers found'
            : "You haven't created any offers yet"
        }
        emptyAction={
          (tab === 'all' || tab === 'flash') && !search ? (
            <Link href={tab === 'flash' ? '/merchant/offers/create?flash=1' : '/merchant/offers/create'}>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                {tab === 'flash' ? 'Create a Flash Offer' : 'Create Your First Offer'}
              </Button>
            </Link>
          ) : undefined
        }
        pagination={{
          page,
          pageSize: 10,
          total: meta.total,
          onPageChange: setPage,
        }}
      />

      <ConfirmDialog
        open={revokeOpen}
        title="End this flash offer now?"
        message="Employees can no longer use it from now. This cannot be undone."
        confirmLabel="End offer"
        loading={revokeOffer.isPending}
        onConfirm={async () => {
          if (!revokeReason.trim() || !revokeTarget) {
            showToast({ type: 'error', title: 'Required', description: 'Please add a reason' })
            return
          }
          try {
            await revokeOffer.mutateAsync({ id: revokeTarget.id, reason: revokeReason.trim() })
            showToast({ type: 'success', title: 'Flash offer ended' })
            setRevokeOpen(false)
            setRevokeTarget(null)
            setRevokeReason('')
          } catch (err: any) {
            showToast({ type: 'error', title: 'Failed', description: err.message })
          }
        }}
        onCancel={() => { setRevokeOpen(false); setRevokeTarget(null); setRevokeReason('') }}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Reason</label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Why are you ending this offer early?"
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  )
}
