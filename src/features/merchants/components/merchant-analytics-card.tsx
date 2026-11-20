'use client'
import { useState } from 'react'
import {
  Eye,
  Bookmark,
  MousePointerClick,
  Receipt,
  TrendingUp,
  Package,
  Calendar,
  MapPin,
  Tag,
  ChevronRight,
  Store,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/shared/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MerchantAnalyticsDialog } from './merchant-analytics-dialog'
import type { MerchantAnalyticsRow } from '@/types'

interface MerchantAnalyticsCardProps {
  merchant: MerchantAnalyticsRow
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

// ---- mini stat cell ----

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

// ---- main card ----

export function MerchantAnalyticsCard({ merchant }: MerchantAnalyticsCardProps) {
  const [open, setOpen] = useState(false)
  const { statistics, businessName, logoUrl, status, category, city } = merchant
  const initial = businessName?.charAt(0)?.toUpperCase() ?? '?'

  return (
    <>
      <Card
        onClick={() => setOpen(true)}
        className="group relative h-full cursor-pointer overflow-hidden border-0 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
      >
        {/* gradient top accent based on health (proxy: redemptions) */}
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-pink-500 opacity-80 transition-opacity group-hover:opacity-100" />

        <CardContent className="space-y-3 p-4">
          {/* Header: logo + name + status */}
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12 flex-shrink-0 ring-2 ring-background">
              {logoUrl ? <AvatarImage src={logoUrl} alt={businessName} /> : null}
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-base font-bold text-white">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold leading-tight" title={businessName}>
                {businessName}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={status} />
                {category && (
                  <Badge variant="secondary" className="gap-1 px-1.5 text-[10px]">
                    <Tag className="h-2.5 w-2.5" />
                    {category.name}
                  </Badge>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
          </div>

          {/* Meta row: city + last offer date */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{city ?? 'No city'}</span>
            </span>
            <span className="flex items-center gap-1 truncate">
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{formatRelativeDate(statistics.lastOfferCreated)}</span>
            </span>
          </div>

          {/* Stat grid 2x2 */}
          <div className="grid grid-cols-2 gap-1.5">
            <MiniStat
              icon={Package}
              label="Offers"
              value={formatNumber(statistics.totalOffers)}
              color="text-blue-600"
            />
            <MiniStat
              icon={Eye}
              label="Views"
              value={formatNumber(statistics.totalViews)}
              color="text-cyan-600"
            />
            <MiniStat
              icon={Bookmark}
              label="Saves"
              value={formatNumber(statistics.totalSaves)}
              color="text-violet-600"
            />
            <MiniStat
              icon={MousePointerClick}
              label="Clicks"
              value={formatNumber(statistics.totalClicks)}
              color="text-pink-600"
            />
            <MiniStat
              icon={Receipt}
              label="Redeemed"
              value={formatNumber(statistics.totalRedemptions)}
              color="text-emerald-600"
            />
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between border-t border-dashed pt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              Click for details
            </span>
            <span className="flex items-center gap-1">
              <Store className="h-2.5 w-2.5" />
              {statistics.totalOffers > 0
                ? `${statistics.liveOffers} live`
                : 'No offers yet'}
            </span>
          </div>
        </CardContent>
      </Card>

      <MerchantAnalyticsDialog
        merchantId={merchant.id}
        merchantName={businessName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

// ---- skeleton ----

export function MerchantAnalyticsCardSkeleton() {
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
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  )
}

// ---- responsive grid ----

interface MerchantAnalyticsGridProps {
  merchants: MerchantAnalyticsRow[]
  isLoading?: boolean
  emptyMessage?: string
}

export function MerchantAnalyticsGrid({
  merchants,
  isLoading,
  emptyMessage = 'No merchants to display',
}: MerchantAnalyticsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <MerchantAnalyticsCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (merchants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">{emptyMessage}</p>
        <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters or search</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {merchants.map((m) => (
        <MerchantAnalyticsCard key={m.id} merchant={m} />
      ))}
    </div>
  )
}
