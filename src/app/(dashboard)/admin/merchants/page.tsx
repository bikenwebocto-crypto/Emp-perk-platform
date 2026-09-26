'use client'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Package, Activity, FileText } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PendingMerchantCard } from '@/features/merchants/components/pending-merchant-card'
// import { MerchantImportExport } from '@/features/merchants/components/merchant-import-export'
import { MerchantSummaryCards } from '@/features/merchants/components/merchant-summary-cards'
import { MerchantFiltersBar } from '@/features/merchants/components/merchant-filters-bar'
import { MerchantOperationsTable } from '@/features/merchants/components/merchant-operations-table'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  usePendingMerchants,
  useApproveMerchant,
  useDeleteMerchant,
  useMerchantDashboard,
  useUpdateMerchantPriority,
  useToggleMerchantFeatured,
  useToggleMerchantHomepage,
  useSuspendMerchant,
  useActivateMerchant,
  usePauseMerchant,
} from '@/hooks/queries/use-merchants'
import { useTablePagination } from '@/hooks/use-table-pagination'
import { showToast } from '@/hooks/use-toast'
import type {
  MerchantDashboardFilters,
  MerchantHealth,
  MerchantStatus,
  TableSortConfig,
} from '@/types'

type TabKey = 'all' | 'pending'

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: 'all', label: 'All Merchants', icon: Package },
  { key: 'pending', label: 'Pending Approval', icon: Activity },
]



export default function MerchantsPage() {
  const router = useRouter()
  const navigateToMerchant = useCallback((id: string) => router.push(`/admin/merchants/${id}`), [router])
  
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  const [activeTab, setActiveTab] = useState<TabKey>(
    tabParam && TABS.some((t) => t.key === tabParam)
      ? (tabParam as TabKey)
      : "all",
  )

  useEffect(() => {
    if (tabParam && TABS.some((t) => t.key === tabParam)) {
      setActiveTab(tabParam as TabKey)
    }
  }, [tabParam])
  // ----- UI State -----
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MerchantStatus | 'ALL'>('ALL')
  const [cityFilter, setCityFilter] = useState('')
  const [featuredFilter, setFeaturedFilter] = useState<boolean | null>(null)
  const [homepageFilter, setHomepageFilter] = useState<boolean | null>(null)
  const [healthFilter, setHealthFilter] = useState<MerchantHealth | 'ALL'>('ALL')
  const [hasLiveOffersFilter, setHasLiveOffersFilter] = useState<boolean | null>(null)
  const [hasPendingOffersFilter, setHasPendingOffersFilter] = useState<boolean | null>(null)
  const [priorityMinFilter, setPriorityMinFilter] = useState<number | null>(null)
  // const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [sortConfig, setSortConfig] = useState<TableSortConfig>({ key: 'priority', direction: 'desc' })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'suspend' | 'reject' | 'delete'>('suspend')
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null)
  const [suspendReasonText, setSuspendReasonText] = useState('')

  const { page, setPage, pageSize } = useTablePagination({ defaultPageSize: 20 })

  // ----- Server state -----
  const dashboardFilters = useMemo<MerchantDashboardFilters>(
    () => ({
      status: statusFilter,
      city: cityFilter || undefined,
      featured: featuredFilter === null ? undefined : featuredFilter,
      homepage: homepageFilter === null ? undefined : homepageFilter,
      health: healthFilter,
      hasLiveOffers: hasLiveOffersFilter === null ? undefined : hasLiveOffersFilter,
      hasPendingOffers: hasPendingOffersFilter === null ? undefined : hasPendingOffersFilter,
      priorityMin: priorityMinFilter ?? undefined,
      q: search || undefined,
      sortBy: sortConfig.key as MerchantDashboardFilters['sortBy'],
      sortDir: sortConfig.direction,
      page,
      pageSize,
    }),
    [
      statusFilter, cityFilter, featuredFilter, homepageFilter, healthFilter,
      hasLiveOffersFilter, hasPendingOffersFilter, priorityMinFilter, search,
      sortConfig, page, pageSize,
    ],
  )

  // The dashboard endpoint has all the analytics we need
  const { data: dashboardData, isLoading: dashboardLoading } = useMerchantDashboard(dashboardFilters)

  // Pending tab uses legacy hook (returns merchant list with status=PENDING)
  const { data: pendingData, isLoading: pendingLoading } = usePendingMerchants()

  // ----- Mutations -----
  const approveMutation = useApproveMerchant()
  const deleteMutation = useDeleteMerchant()
  const updatePriority = useUpdateMerchantPriority()
  const toggleFeatured = useToggleMerchantFeatured()
  const toggleHomepage = useToggleMerchantHomepage()
  const suspendMutation = useSuspendMerchant()
  const activateMutation = useActivateMerchant()
  const pauseMutation = usePauseMerchant()

  // ----- Derived data -----
  const dashboardRows = dashboardData?.data ?? []
  const summary = dashboardData?.summary
  const dashboardMeta = dashboardData?.meta
  const pendingMerchants = pendingData?.data ?? []

  // Existing list data (used for PendingMerchantCard)
  const pendingCards = useMemo(
    () =>
      (pendingData?.data ?? []).map((m: any) => ({
        id: m.id,
        businessName: m.businessName ?? '',
        ownerName: m.ownerName ?? '',
        email: m.email ?? '',
        category: typeof m.category === 'string' ? m.category : (m.category?.name ?? ''),
        submittedAt: m.createdAt ?? m.submittedAt ?? new Date().toISOString(),
      })),
    [pendingData],
  )

  // Derive unique cities from current dashboard results
  const cityOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of dashboardRows) if (r.city) set.add(r.city)
    return Array.from(set).sort()
  }, [dashboardRows])

  // Pending tab badge count
  const pendingCount = summary?.pendingApproval ?? pendingMerchants.length

  // ----- Handlers -----
  const clearAllFilters = useCallback(() => {
    setSearch('')
    setStatusFilter('ALL')
    setCityFilter('')
    setFeaturedFilter(null)
    setHomepageFilter(null)
    setHealthFilter('ALL')
    setHasLiveOffersFilter(null)
    setHasPendingOffersFilter(null)
    setPriorityMinFilter(null)
    setPage(1)
  }, [setPage])

  const handleDelete = (id: string) => {
    setSelectedMerchant(id)
    setConfirmAction('delete')
    setConfirmOpen(true)
  }

  const handleReject = (id: string) => {
    setSelectedMerchant(id)
    setConfirmAction('reject')
    setConfirmOpen(true)
  }

  const handleSuspendClick = (id: string) => {
    setSelectedMerchant(id)
    setSuspendReasonText('')
    setConfirmAction('suspend')
    setConfirmOpen(true)
  }

  const handleApprove = (merchantId: string) => {
    approveMutation.mutate(
      { merchantId, status: 'ACTIVE' as MerchantStatus },
      {
        onSuccess: (res: any) => showToast({ type: 'success', title: res.message ?? 'Merchant approved' }),
        onError: (err: Error) => showToast({ type: 'error', title: 'Approval failed', description: err.message }),
      },
    )
  }

  const handleConfirmAction = useCallback(() => {
    if (!selectedMerchant) return
    if (confirmAction === 'delete') {
      deleteMutation.mutate(selectedMerchant, {
        onSuccess: (res: any) => {
          showToast({ type: 'success', title: res.message ?? 'Merchant deleted' })
          setConfirmOpen(false)
          setSelectedMerchant(null)
        },
        onError: (err: Error) => {
          showToast({ type: 'error', title: 'Delete failed', description: err.message })
          setConfirmOpen(false)
          setSelectedMerchant(null)
        },
      })
    } else if (confirmAction === 'reject') {
      approveMutation.mutate(
        { merchantId: selectedMerchant, status: 'REJECTED' as MerchantStatus },
        {
          onSuccess: (res: any) => showToast({ type: 'success', title: res.message ?? 'Merchant rejected' }),
          onError: (err: Error) => showToast({ type: 'error', title: 'Failed to reject', description: err.message }),
          onSettled: () => {
            setConfirmOpen(false)
            setSelectedMerchant(null)
          },
        },
      )
    } else if (confirmAction === 'suspend') {
      if (!suspendReasonText.trim()) {
        showToast({ type: 'error', title: 'Required', description: 'Please provide a reason' })
        return
      }
      suspendMutation.mutate(
        { id: selectedMerchant, reason: suspendReasonText.trim() },
        {
          onSuccess: () => {
            showToast({ type: 'success', title: 'Merchant suspended' })
            setConfirmOpen(false)
            setSelectedMerchant(null)
            setSuspendReasonText('')
          },
          onError: (err: Error) =>
            showToast({ type: 'error', title: 'Failed to suspend', description: err.message }),
        },
      )
    }
  }, [selectedMerchant, confirmAction, suspendReasonText, deleteMutation, approveMutation, suspendMutation])

  // ----- Sort handler (replaces page state) -----
  const handleSortChange = useCallback(
    (config: TableSortConfig) => {
      setSortConfig(config)
      setPage(1)
    },
    [setPage],
  )

  // ----- Quick action handlers -----
  const onChangePriority = useCallback(
    (id: string, value: number) => {
      updatePriority.mutate(
        { id, value },
        {
          onSuccess: () => showToast({ type: 'success', title: `Priority set to ${value}` }),
          onError: (err: Error) => showToast({ type: 'error', title: 'Update failed', description: err.message }),
        },
      )
    },
    [updatePriority],
  )

  const onToggleFeatured = useCallback(
    (id: string, value: boolean) => {
      toggleFeatured.mutate(
        { id, value },
        {
          onSuccess: () =>
            showToast({
              type: 'success',
              title: value ? 'Marked as Featured' : 'Removed from Featured',
            }),
          onError: (err: Error) => showToast({ type: 'error', title: 'Update failed', description: err.message }),
        },
      )
    },
    [toggleFeatured],
  )

  const onToggleHomepage = useCallback(
    (id: string, value: boolean) => {
      toggleHomepage.mutate(
        { id, value },
        {
          onSuccess: () =>
            showToast({
              type: 'success',
              title: value ? 'Added to Homepage' : 'Removed from Homepage',
            }),
          onError: (err: Error) => showToast({ type: 'error', title: 'Update failed', description: err.message }),
        },
      )
    },
    [toggleHomepage],
  )

  const onSuspend = useCallback(
    (id: string, reason: string) => {
      suspendMutation.mutate(
        { id, reason },
        {
          onSuccess: () => showToast({ type: 'success', title: 'Merchant suspended' }),
          onError: (err: Error) => showToast({ type: 'error', title: 'Failed to suspend', description: err.message }),
        },
      )
    },
    [suspendMutation],
  )

  const onActivate = useCallback(
    (id: string) => {
      activateMutation.mutate(id, {
        onSuccess: () => showToast({ type: 'success', title: 'Merchant reactivated' }),
        onError: (err: Error) => showToast({ type: 'error', title: 'Failed', description: err.message }),
      })
    },
    [activateMutation],
  )

  const onPause = useCallback(
    (id: string) => {
      pauseMutation.mutate(id, {
        onSuccess: () => showToast({ type: 'success', title: 'Merchant paused' }),
        onError: (err: Error) => showToast({ type: 'error', title: 'Failed', description: err.message }),
      })
    },
    [pauseMutation],
  )

   const onResume = useCallback(
    (id: string) => {
      activateMutation.mutate(id, {
        onSuccess: () => showToast({ type: 'success', title: 'Merchant resumed' }),
        onError: (err: Error) => showToast({ type: 'error', title: 'Failed to resume', description: err.message }),
      })
    },
    [activateMutation],
  )
  

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Merchant Operations"
        description="Manage merchants, monitor health, and curate featured & homepage placements"
        actions={(
          <div className="flex items-center gap-2">
          
            <Link href="/admin/merchants/add">
              <Button className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Merchant
              </Button>
            </Link>
          </div>
        )}
      />

      {/* ===== Summary cards ===== */}
      <MerchantSummaryCards summary={summary} isLoading={dashboardLoading} />

      {/* ===== Tabs (preserve existing) ===== */}
      <div className="flex items-center gap-4 overflow-x-auto border-b [scrollbar-width:none]">
        {TABS.map((t) => {
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key)
                if (t.key === 'all') {
                  // Going back to all resets pending-specific filters
                }
              }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.key === 'pending' && pendingCount > 0 && (
                <Badge variant="pending" className="ml-1 h-5 px-1.5 text-[10px]">
                  {pendingCount}
                </Badge>
              )}
            </button>
          )
        })}
      </div>

      {/* ===== Tab content ===== */}
      {activeTab === 'all' ? (
        <div className="min-w-0 space-y-4">
          {/* ===== Filters ===== */}
          <MerchantFiltersBar
            search={search}
            onSearchChange={(v) => { setSearch(v); setPage(1) }}
            status={statusFilter}
            onStatusChange={(v) => { setStatusFilter(v); setPage(1) }}
            city={cityFilter}
            onCityChange={(v) => { setCityFilter(v); setPage(1) }}
            featured={featuredFilter}
            onFeaturedChange={(v) => { setFeaturedFilter(v); setPage(1) }}
            homepage={homepageFilter}
            onHomepageChange={(v) => { setHomepageFilter(v); setPage(1) }}
            health={healthFilter}
            onHealthChange={(v) => { setHealthFilter(v); setPage(1) }}
            hasLiveOffers={hasLiveOffersFilter}
            onHasLiveOffersChange={(v) => { setHasLiveOffersFilter(v); setPage(1) }}
            hasPendingOffers={hasPendingOffersFilter}
            onHasPendingOffersChange={(v) => { setHasPendingOffersFilter(v); setPage(1) }}
            priorityMin={priorityMinFilter}
            onPriorityMinChange={(v) => { setPriorityMinFilter(v); setPage(1) }}
            onClearAll={clearAllFilters}
            cities={cityOptions}
          />

          {/* ===== Operations table ===== */}
          {/* ===== Operations table (horizontal scroll) ===== */}
            <div className="w-full min-w-0">
              <div>
                <MerchantOperationsTable
                  data={dashboardRows}
                  isLoading={dashboardLoading && !dashboardData}
                  sortConfig={sortConfig}
                  onSortChange={handleSortChange}
                  onRowClick={navigateToMerchant}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onDelete={handleDelete}
                  onSuspend={onSuspend}
                  onActivate={onActivate}
                  onPause={onPause}
                  onResume={onResume}
                  onToggleFeatured={onToggleFeatured}
                  onToggleHomepage={onToggleHomepage}
                  onChangePriority={onChangePriority}
                  isActionProcessing={approveMutation.isPending || deleteMutation.isPending || suspendMutation.isPending || activateMutation.isPending || pauseMutation.isPending}
                />
              </div>
            </div>

          {/* ===== Pagination ===== */}
          {dashboardMeta && dashboardMeta.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t pt-4">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {dashboardMeta.totalPages} · {dashboardMeta.total} total
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= dashboardMeta.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* ===== Pending tab (preserve existing behavior) ===== */
        <div className="space-y-3">
          {pendingLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          ) : (
            <PendingMerchantCard
              merchants={pendingCards}
              onApprove={(id) => handleApprove(id)}
              onReject={(id) => handleReject(id)}
              isProcessing={approveMutation.isPending}
            />
          )}
        </div>
      )}

      {/* ===== Confirm dialog (handles delete, reject, suspend) ===== */}
      <ConfirmDialog
        open={confirmOpen}
        title={
          confirmAction === 'delete'
            ? 'Delete merchant'
            : confirmAction === 'suspend'
              ? 'Suspend merchant'
              : 'Reject merchant'
        }
        message={
          confirmAction === 'delete'
            ? 'This merchant will be soft-deleted. The record can be recovered later.'
            : confirmAction === 'suspend'
              ? 'Suspending will hide this merchant from employees. You can reactivate them later from the actions menu.'
              : 'Rejecting this application will mark the merchant as rejected. You can change the status later.'
        }
        confirmLabel={
          confirmAction === 'delete' ? 'Delete' : confirmAction === 'suspend' ? 'Suspend' : 'Reject'
        }
        loading={
          deleteMutation.isPending ||
          approveMutation.isPending ||
          suspendMutation.isPending
        }
        onConfirm={handleConfirmAction}
        onCancel={() => {
          setConfirmOpen(false)
          setSelectedMerchant(null)
          setSuspendReasonText('')
        }}
      >
        {confirmAction === 'suspend' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason for suspension</label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Policy violation, multiple complaints, payment failure..."
              value={suspendReasonText}
              onChange={(e) => setSuspendReasonText(e.target.value)}
            />
          </div>
        )}
      </ConfirmDialog>
    </div>
  )
}
