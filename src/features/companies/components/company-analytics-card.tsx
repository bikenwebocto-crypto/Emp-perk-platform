'use client'
import { useState } from 'react'
import {
  Eye,
  Bookmark,
  MousePointerClick,
  Receipt,
  TrendingUp,
  Users,
  MapPin,
  Calendar,
  Tag,
  ChevronRight,
  Building2,
  Sparkles,
  Briefcase,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { CompanyAnalyticsDialog } from './company-analytics-dialog'
import type { CompanyAnalyticsRow } from '@/types'

interface CompanyAnalyticsCardProps {
  company: CompanyAnalyticsRow
}

// ---- helpers ----

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined) return '--'
  if (n === 0) return '0%'
  if (n < 1) return `${n.toFixed(2)}%`
  return `${n.toFixed(1)}%`
}

function formatRelativeDate(date: string | null | undefined): string {
  if (!date) return 'Never'
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffDay < 0) return d.toLocaleDateString()
  if (diffDay === 0) return 'Today'
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}

function MiniStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/30 p-1.5">
      <div className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide ${color}`}>
        <Icon className="h-2.5 w-2.5" />
        <span className="truncate">{label}</span>
      </div>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED_PENDING_PAYMENT: 'Awaiting Payment',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-500',
  APPROVED_PENDING_PAYMENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-500',
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-500',
  PAUSED: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  SUSPENDED: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-500',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-500',
}

export function CompanyAnalyticsCard({ company }: CompanyAnalyticsCardProps) {
  const [open, setOpen] = useState(false)
  const { statistics, name, logo, status } = company
  const initial = name?.charAt(0)?.toUpperCase() ?? '?'
  const statusLabel = STATUS_LABELS[status] ?? status
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING

  return (
    <>
      <Card
        onClick={() => setOpen(true)}
        className="group relative h-full cursor-pointer overflow-hidden border-0 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-500 opacity-80 transition-opacity group-hover:opacity-100" />

        <CardContent className="space-y-3 p-4">
          {/* Header: logo + name + status */}
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12 flex-shrink-0 ring-2 ring-background">
              {logo ? <AvatarImage src={logo} alt={name} /> : null}
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-cyan-600 text-base font-bold text-white">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold leading-tight" title={name}>
                {name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={`border-0 text-[10px] ${statusStyle}`}>
                  {statusLabel}
                </Badge>
                {company.employeeCount != null && (
                  <Badge variant="secondary" className="gap-1 px-1.5 text-[10px]">
                    <Users className="h-2.5 w-2.5" />
                    {company.employeeCount}
                  </Badge>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
          </div>

          {/* Meta row: city + last activity */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{(company as any).city ?? '—'}</span>
            </span>
            <span className="flex items-center gap-1 truncate">
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{(company as any).industry ?? '—'}</span>
            </span>
          </div>

          {/* Stat grid 2x4 (different layout from merchant — 8 stats) */}
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <MiniStat
              icon={Users}
              label="Active"
              value={formatNumber(statistics.activeEmployees)}
              color="text-emerald-600"
            />
            <MiniStat
              icon={Eye}
              label="Views"
              value={formatNumber(statistics.offersViewed)}
              color="text-cyan-600"
            />
            <MiniStat
              icon={Receipt}
              label="Redeemed"
              value={formatNumber(statistics.offersRedeemed)}
              color="text-blue-600"
            />
            <MiniStat
              icon={Bookmark}
              label="Saves"
              value={formatNumber(statistics.offersSaved)}
              color="text-violet-600"
            />
            <MiniStat
              icon={MousePointerClick}
              label="Clicks"
              value={formatNumber(statistics.offersClicked)}
              color="text-pink-600"
            />
            <MiniStat
              icon={TrendingUp}
              label="Avg Save"
              value={`€${statistics.averageSavings.toFixed(2)}`}
              color="text-amber-600"
            />
            <MiniStat
              icon={Sparkles}
              label="Monthly"
              value={`€${statistics.monthlySavings.toFixed(2)}`}
              color="text-emerald-600"
            />
            <MiniStat
              icon={Tag}
              label={statistics.topCategory ? 'Top Cat' : 'Top Cat'}
                value={statistics.topCategory ? statistics.topCategory.categoryName : '—'}
                color="text-rose-600"
            />
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between border-t border-dashed pt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              Click for details
            </span>
            <span className="flex items-center gap-1">
              <Building2 className="h-2.5 w-2.5" />
              {statistics.offersRedeemed > 0
                ? `${statistics.offersRedeemed} redemptions`
                : 'No redemptions yet'}
            </span>
          </div>
        </CardContent>
      </Card>

      <CompanyAnalyticsDialog
        companyId={company.id}
        companyName={name}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

export function CompanyAnalyticsCardSkeleton() {
  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  )
}

interface CompanyAnalyticsGridProps {
  companies: CompanyAnalyticsRow[]
  isLoading?: boolean
  emptyMessage?: string
}

export function CompanyAnalyticsGrid({
  companies,
  isLoading,
  emptyMessage = 'No companies to display',
}: CompanyAnalyticsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <CompanyAnalyticsCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Building2 className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">{emptyMessage}</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters or search</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {companies.map((c) => (
        <CompanyAnalyticsCard key={c.id} company={c} />
      ))}
    </div>
  )
}
