'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import {
  Star,
  Home,
  Package,
  Eye,
  Bookmark,
  Receipt,
  Heart,
  Activity,
  AlertCircle,
  TrendingUp,
  Building2,
  Users,
  Clock,
  MapPin,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  GitBranch,
  ExternalLink,
  HeartPulse,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/shared/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MerchantActionsMenu } from './merchant-actions-menu'
import type { MerchantDashboardRow, MerchantHealth, TableSortConfig } from '@/types'

interface MerchantOperationsTableProps {
  data: MerchantDashboardRow[]
  isLoading?: boolean
  sortConfig?: TableSortConfig
  onSortChange?: (config: TableSortConfig) => void
  onRowClick?: (id: string) => void
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onDelete?: (id: string) => void
  onSuspend?: (id: string, reason: string) => void
  onActivate?: (id: string) => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void  
  onToggleFeatured?: (id: string, value: boolean) => void
  onToggleHomepage?: (id: string, value: boolean) => void
  onChangePriority?: (id: string, value: number) => void
  isActionProcessing?: boolean
}

// ---- Helpers ----------------------------------------------------------------

function formatRelative(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  return d.toLocaleDateString()
}

function formatNumber(n: number | undefined | null): string {
  if (n === undefined || n === null) return '--'
  return n.toLocaleString()
}

function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--'
  return `${n.toFixed(1)}%`
}

// ---- Health badge -----------------------------------------------------------

function HealthBadge({ health }: { health: MerchantHealth }) {
  const config = {
    HEALTHY: {
      bg: 'bg-emerald-100 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200',
      dot: 'bg-emerald-500',
      label: 'Healthy',
    },
    WARNING: {
      bg: 'bg-amber-100 dark:bg-amber-950/40',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-200',
      dot: 'bg-amber-500',
      label: 'Warning',
    },
    CRITICAL: {
      bg: 'bg-rose-100 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-400',
      border: 'border-rose-200',
      dot: 'bg-rose-500',
      label: 'Critical',
    },
  }[health]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}

// ---- Priority cell ----------------------------------------------------------

function PriorityCell({ value }: { value: number }) {
  if (value === 0) {
    return <span className="text-muted-foreground text-sm">—</span>
  }
  return (
    <Badge variant="secondary" className="gap-1 text-[10px] font-bold">
      <ArrowUp className="h-2.5 w-2.5" />
      {value}
    </Badge>
  )
}

// ---- Compact stats cell -----------------------------------------------------

function CompactStatCell({
  icon: Icon,
  value,
  color,
}: {
  icon: any
  value: number
  color?: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon className={`h-3.5 w-3.5 ${color ?? 'text-muted-foreground'}`} />
      <span className="text-xs font-semibold tabular-nums">{formatNumber(value)}</span>
    </div>
  )
}

// ---- Sortable header cell ---------------------------------------------------

function SortHeader({
  label,
  sortKey,
  currentSort,
  align,
  onSort,
}: {
  label: string
  sortKey: string
  currentSort?: TableSortConfig
  align?: 'left' | 'center' | 'right'
  onSort?: (config: TableSortConfig) => void
}) {
  const isActive = currentSort?.key === sortKey
  const direction = isActive ? currentSort?.direction : undefined

  return (
    <th
      className={`pb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      }`}
    >
      <button
        type="button"
        disabled={!onSort}
        onClick={() => {
          if (!onSort) return
          if (isActive) {
            onSort({ key: sortKey, direction: direction === 'asc' ? 'desc' : 'asc' })
          } else {
            onSort({ key: sortKey, direction: 'desc' })
          }
        }}
        className={`inline-flex items-center gap-1 ${
          onSort ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
        } ${isActive ? 'text-foreground' : ''}`}
      >
        {label}
        {onSort && (
          <span className="flex flex-col leading-none">
            {direction === 'asc' && <ArrowUp className="h-2.5 w-2.5" />}
            {direction === 'desc' && <ArrowDown className="h-2.5 w-2.5" />}
            {!direction && <span className="text-[8px] opacity-50">↕</span>}
          </span>
        )}
      </button>
    </th>
  )
}

// ---- Main component ---------------------------------------------------------

export function MerchantOperationsTable({
  data,
  isLoading,
  sortConfig,
  onSortChange,
  onRowClick,
  onApprove,
  onReject,
  onDelete,
  onSuspend,
  onActivate,
  onPause,
  onResume,
  onToggleFeatured,
  onToggleHomepage,
  onChangePriority,
  isActionProcessing,
}: MerchantOperationsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">No merchants found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters or search</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ============================================================ */}
      {/* DESKTOP & TABLET (lg+) — full operations table               */}
      {/* ============================================================ */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-sm [scrollbar-width:thin] lg:block">
        <table className="w-full min-w-[1280px] whitespace-nowrap text-sm [&_td]:px-2 [&_th]:px-2 [&_th]:pt-3">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="w-12 px-2"></th>
              <SortHeader label="Merchant" sortKey="businessName" currentSort={sortConfig} onSort={onSortChange} />
              <SortHeader label="Status" sortKey="status" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <SortHeader label="Priority" sortKey="priority" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <th className="px-2 pb-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Flags</th>
              <SortHeader label="City" sortKey="city" currentSort={sortConfig} onSort={onSortChange} />
              <th className="px-2 pb-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Offers</th>
              <SortHeader label="Engagement" sortKey="views" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <SortHeader label="Redeemed" sortKey="redemptions" currentSort={sortConfig} onSort={onSortChange} align="center" />
              {/* <SortHeader label="Conversion" sortKey="redemptions" currentSort={sortConfig} onSort={onSortChange} align="center" /> */}
              <th className="px-2 pb-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Network</th>
              <th className="px-2 pb-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Health</th>
              <SortHeader label="Last activity" sortKey="lastActivity" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <SortHeader label="Created" sortKey="createdAt" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <th className="w-12 px-2 pb-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.id}
                className="border-b transition-colors last:border-0 hover:bg-muted/30"
              >
                {/* Logo */}
                <td className="px-2 py-3">
                  <Avatar
                    className="h-9 w-9 cursor-pointer"
                    onClick={() => onRowClick?.(row.id)}
                  >
                    {row.logoUrl ? <AvatarImage src={row.logoUrl} alt={row.businessName} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                      {row.businessName?.charAt(0)?.toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                </td>

                {/* Merchant */}
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => onRowClick?.(row.id)}
                    className="block max-w-[200px] text-left"
                  >
                    <p className="truncate font-semibold hover:text-primary hover:underline">{row.businessName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.email ?? row.contactName}
                    </p>
                  </button>
                </td>

                {/* Status */}
                <td className="py-3 text-center">
                  <StatusBadge status={row.status} />
                </td>

                {/* Priority */}
                <td className="py-3 text-center">
                  <PriorityCell value={row.displayPriority} />
                </td>

                {/* Flags: Featured / Homepage */}
                <td className="py-3">
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {row.isFeatured && (
                      <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />
                    )}
                    {row.isHomepageMerchant && (
                      <Home className="h-3.5 w-3.5 fill-pink-400 text-pink-500" />
                    )}
                    {!row.isFeatured && !row.isHomepageMerchant && (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </div>
                </td>

                {/* City */}
                <td className="py-3 text-xs text-muted-foreground">
                  {row.city ?? <span className="text-muted-foreground/40">—</span>}
                </td>

                {/* Offers (Live / Pending / Archived / Rejected) */}
                <td className="py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <Badge variant="live" className="gap-1 px-1.5 text-[10px]">
                      <span className="font-bold">{row.stats.live}</span>
                      <span className="opacity-80">live</span>
                    </Badge>
                    {row.stats.pending > 0 && (
                      <Badge variant="pending" className="gap-1 px-1.5 text-[10px]">
                        <span className="font-bold">{row.stats.pending}</span>
                        <span className="opacity-80">pend</span>
                      </Badge>
                    )}
                    {row.stats.archived > 0 && (
                      <Badge variant="secondary" className="gap-1 px-1.5 text-[10px]">
                        <span className="font-bold">{row.stats.archived}</span>
                      </Badge>
                    )}
                  </div>
                </td>

                {/* Engagement: views, saved */}
                <td className="py-3">
                  <div className="flex items-center justify-center gap-3 text-xs">
                    <span className="flex items-center gap-1" title="Views">
                      <Eye className="h-3 w-3 text-blue-500" />
                      <span className="font-medium tabular-nums">{formatNumber(row.engagement.views)}</span>
                    </span>
                    <span className="flex items-center gap-1" title="Saved">
                      <Bookmark className="h-3 w-3 text-violet-500" />
                      <span className="font-medium tabular-nums">{formatNumber(row.engagement.saved)}</span>
                    </span>
                  </div>
                </td>

                {/* Redeemed */}
                <td className="py-3 text-center text-sm">
                  <span className="font-semibold tabular-nums">{formatNumber(row.engagement.redeemed)}</span>
                  {row.totalRedemptions > 0 && row.totalRedemptions !== row.engagement.redeemed && (
                    <p className="text-[10px] text-muted-foreground">total {formatNumber(row.totalRedemptions)}</p>
                  )}
                </td>

                {/* Conversion */}
                {/* <td className="py-3 text-center">
                  {row.engagement.conversion === null ? (
                    <span className="text-muted-foreground/40 text-sm">--</span>
                  ) : (
                    <span className={`text-sm font-semibold tabular-nums ${
                      row.engagement.conversion >= 10 ? 'text-emerald-600' :
                      row.engagement.conversion >= 3 ? 'text-foreground' :
                      'text-muted-foreground'
                    }`}>
                      {formatPercent(row.engagement.conversion)}
                    </span>
                  )}
                </td> */}

                {/* Network: companies, employees, branches */}
                <td className="py-3">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-0.5" title="Companies">
                      <Building2 className="h-3 w-3" />
                      <span className="font-medium tabular-nums">{row.relations.companies}</span>
                    </span>
                    <span className="flex items-center gap-0.5" title="Employees">
                      <Users className="h-3 w-3" />
                      <span className="font-medium tabular-nums">{row.relations.employees}</span>
                    </span>
                    <span className="flex items-center gap-0.5" title="Branches">
                      <GitBranch className="h-3 w-3" />
                      <span className="font-medium tabular-nums">{row.relations.branches}</span>
                    </span>
                    {row.relations.openIssues > 0 && (
                      <span className="flex items-center gap-0.5 text-rose-600" title="Open issues">
                        <AlertCircle className="h-3 w-3" />
                        <span className="font-bold tabular-nums">{row.relations.openIssues}</span>
                      </span>
                    )}
                  </div>
                </td>

                {/* Health */}
                <td className="py-3 text-center">
                  <HealthBadge health={row.health} />
                </td>

                {/* Last activity */}
                <td className="py-3 text-center text-xs text-muted-foreground">
                  {formatRelative(row.lastActivityAt)}
                </td>

                {/* Created */}
                <td className="py-3 text-center text-xs text-muted-foreground">
                  {new Date(row.createdAt).toLocaleDateString()}
                </td>

                {/* Actions */}
                <td className="px-2 py-3 text-right">
                  <MerchantActionsMenu
                    row={row}
                    onApprove={onApprove}
                    onReject={onReject}
                    onDelete={onDelete}
                    onSuspend={onSuspend}
                    onActivate={onActivate}
                    onPause={onPause}
                    onResume={onResume}
                    onToggleFeatured={onToggleFeatured}
                    onToggleHomepage={onToggleHomepage}
                    onChangePriority={onChangePriority}
                    disabled={isActionProcessing}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ============================================================ */}
      {/* TABLET (sm to lg) — condensed table                          */}
      {/* ============================================================ */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card shadow-sm [scrollbar-width:thin] sm:block lg:hidden">
        <table className="w-full min-w-[640px] whitespace-nowrap text-sm [&_td]:px-2 [&_th]:px-2 [&_th]:pt-3">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="w-10 px-2"></th>
              <SortHeader label="Merchant" sortKey="businessName" currentSort={sortConfig} onSort={onSortChange} />
              <SortHeader label="Status" sortKey="status" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <SortHeader label="Priority" sortKey="priority" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <th className="px-2 pb-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Offers</th>
              <SortHeader label="Engagement" sortKey="redemptions" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <SortHeader label="Last activity" sortKey="lastActivity" currentSort={sortConfig} onSort={onSortChange} align="center" />
              <th className="w-12 px-2 pb-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-muted/30">
                <td className="px-2 py-3">
                  <Avatar
                    className="h-8 w-8 cursor-pointer"
                    onClick={() => onRowClick?.(row.id)}
                  >
                    {row.logoUrl ? <AvatarImage src={row.logoUrl} alt={row.businessName} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white">
                      {row.businessName?.charAt(0)?.toUpperCase() ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                </td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => onRowClick?.(row.id)}
                    className="block max-w-[180px] text-left"
                  >
                    <div className="flex items-center gap-1">
                      <p className="truncate font-semibold hover:text-primary hover:underline">{row.businessName}</p>
                      {row.isFeatured && <Star className="h-3 w-3 fill-yellow-400 text-yellow-500" />}
                      {row.isHomepageMerchant && <Home className="h-3 w-3 fill-pink-400 text-pink-500" />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{row.city ?? row.contactName}</p>
                  </button>
                </td>
                <td className="py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <StatusBadge status={row.status} />
                    <HealthBadge health={row.health} />
                  </div>
                </td>
                <td className="py-3 text-center">
                  <PriorityCell value={row.displayPriority} />
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-center gap-1">
                    <Badge variant="live" className="gap-1 px-1.5 text-[10px]">
                      <span className="font-bold">{row.stats.live}</span>
                    </Badge>
                    {row.stats.pending > 0 && (
                      <Badge variant="pending" className="gap-1 px-1.5 text-[10px]">
                        <span className="font-bold">{row.stats.pending}</span>
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="py-3 text-center text-xs">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1 tabular-nums">
                      <Eye className="h-3 w-3 text-blue-500" />
                      {formatNumber(row.engagement.views)}
                    </span>
                    <span className="flex items-center gap-1 tabular-nums">
                      <Receipt className="h-3 w-3 text-emerald-500" />
                      {formatNumber(row.engagement.redeemed)}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-center text-xs text-muted-foreground">
                  {formatRelative(row.lastActivityAt)}
                </td>
                <td className="px-2 py-3 text-right">
                  <MerchantActionsMenu
                    row={row}
                    onApprove={onApprove}
                    onReject={onReject}
                    onDelete={onDelete}
                    onSuspend={onSuspend}
                    onActivate={onActivate}
                    onPause={onPause}
                    onResume={onResume}
                    onToggleFeatured={onToggleFeatured}
                    onToggleHomepage={onToggleHomepage}
                    onChangePriority={onChangePriority}
                    disabled={isActionProcessing}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ============================================================ */}
      {/* MOBILE (< sm) — card list                                   */}
      {/* ============================================================ */}
      <div className="space-y-2 sm:hidden">
        {data.map((row) => (
          <MerchantMobileCard
            key={row.id}
            row={row}
            onRowClick={onRowClick}
            onApprove={onApprove}
            onReject={onReject}
            onDelete={onDelete}
            onSuspend={onSuspend}
            onActivate={onActivate}
            onPause={onPause}
            onResume={onResume}
            onToggleFeatured={onToggleFeatured}
            onToggleHomepage={onToggleHomepage}
            onChangePriority={onChangePriority}
            disabled={isActionProcessing}
          />
        ))}
      </div>
    </div>
  )
}

// ---- Mobile card ------------------------------------------------------------

interface MerchantMobileCardProps {
  row: MerchantDashboardRow
  onRowClick?: (id: string) => void
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onDelete?: (id: string) => void
  onSuspend?: (id: string, reason: string) => void
  onActivate?: (id: string) => void
  onPause?: (id: string) => void
  onResume?: (id: string) => void
  onToggleFeatured?: (id: string, value: boolean) => void
  onToggleHomepage?: (id: string, value: boolean) => void
  onChangePriority?: (id: string, value: number) => void
  disabled?: boolean
}

function MerchantMobileCard({
  row,
  onRowClick,
  ...actionProps
}: MerchantMobileCardProps) {
  return (
    <div
      className="cursor-pointer rounded-lg border bg-card p-3 shadow-sm"
      onClick={() => onRowClick?.(row.id)}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12 flex-shrink-0">
          {row.logoUrl ? <AvatarImage src={row.logoUrl} alt={row.businessName} /> : null}
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
            {row.businessName?.charAt(0)?.toUpperCase() ?? '?'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-semibold">{row.businessName}</p>
                {row.isFeatured && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" />}
                {row.isHomepageMerchant && <Home className="h-3.5 w-3.5 fill-pink-400 text-pink-500" />}
              </div>
              {row.city && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {row.city}
                </p>
              )}
            </div>
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <MerchantActionsMenu row={row} {...actionProps} />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={row.status} />
            <HealthBadge health={row.health} />
            {row.displayPriority > 0 && <PriorityCell value={row.displayPriority} />}
          </div>

          <div className="mt-2.5 grid grid-cols-4 gap-2 border-t pt-2.5 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Live</p>
              <p className="text-sm font-bold tabular-nums text-emerald-600">{row.stats.live}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Views</p>
              <p className="text-sm font-bold tabular-nums">{formatNumber(row.engagement.views)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saved</p>
              <p className="text-sm font-bold tabular-nums">{formatNumber(row.engagement.saved)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Redeemed</p>
              <p className="text-sm font-bold tabular-nums">{formatNumber(row.engagement.redeemed)}</p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last activity {formatRelative(row.lastActivityAt)}
            </span>
            <span>Joined {new Date(row.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
