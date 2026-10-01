'use client'
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
  Sparkles,
  ExternalLink,
  Activity,
  BarChart3,
  Filter as FilterIcon,
  Clock,
  ArrowRight,
  Store,
} from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatPercent } from '@/components/analytics/analytics-charts'
import type { MerchantAnalyticsDetailResponse } from '@/types'
import type { AnalyticsDialogConfig } from '@/components/analytics/analytics-config'

// ============================================================================
// Merchant config builder
//
// Maps a MerchantAnalyticsDetailResponse into an AnalyticsDialogConfig.
// This is the ONLY place that knows "merchant" — the dialog itself is generic.
// ============================================================================

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function buildMerchantAnalyticsConfig(
  response: MerchantAnalyticsDetailResponse,
): AnalyticsDialogConfig {
  const m = response.data.merchant
  const summary = response.data.summary
  const offerPerformance = response.data.offerPerformance
  const charts = response.data.charts

  return {
    entityType: 'merchant',
    entityId: m.id,

    title: m.businessName,
    subtitle: [m.city, m.state].filter(Boolean).join(', ') || undefined,
    avatarUrl: m.logoUrl,
    statusNode: <StatusBadge status={m.status} />,
    badges: [
      ...(m.isFeatured
        ? [
            {
              key: 'featured',
              node: (
                <Badge variant="warning" className="gap-1 text-[10px]">
                  <Sparkles className="h-3 w-3" /> Featured
                </Badge>
              ),
            },
          ]
        : []),
      ...(m.isHomepageMerchant
        ? [
            {
              key: 'homepage',
              node: (
                <Badge variant="pending" className="gap-1 text-[10px]">
                  <ExternalLink className="h-3 w-3" /> Homepage
                </Badge>
              ),
            },
          ]
        : []),
    ],
    meta: [
      ...(m.category
        ? [
            {
              key: 'category',
              node: (
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" /> {m.category.name}
                </span>
              ),
            },
          ]
        : []),
      {
        key: 'rating',
        node: (
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" /> Avg rating {m.averageRating?.toFixed(1) ?? '—'} ★
          </span>
        ),
      },
    ],
    headerAction: (
      <a
        href={`/admin/merchants/${m.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline-flex sm:items-center sm:gap-1"
      >
        View full merchant <ExternalLink className="h-3 w-3" />
      </a>
    ),
    footer: (
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> Live since {formatDate(m.liveAt)}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Joined {formatDate(m.createdAt)}
          </span>
        </div>
        <span className="flex items-center gap-1 text-[10px]">
          ID: <code className="rounded bg-muted px-1.5 py-0.5">{m.id.slice(0, 8)}</code>
        </span>
      </div>
    ),

    kpis: [
      {
        key: 'totalOffers',
        label: 'Total Offers',
        value: summary.totalOffers,
        sublabel: `${summary.liveOffers} live`,
        icon: Package,
        color: 'from-blue-500 to-indigo-600',
        bg: 'bg-blue-100 dark:bg-blue-950/40',
        iconColor: 'text-blue-600',
      },
      {
        key: 'views',
        label: 'Views',
        value: summary.views,
        icon: Eye,
        color: 'from-cyan-500 to-blue-600',
        bg: 'bg-cyan-100 dark:bg-cyan-950/40',
        iconColor: 'text-cyan-600',
      },
      {
        key: 'saves',
        label: 'Saves',
        value: summary.saves,
        icon: Bookmark,
        color: 'from-violet-500 to-purple-600',
        bg: 'bg-violet-100 dark:bg-violet-950/40',
        iconColor: 'text-violet-600',
      },
      {
        key: 'clicks',
        label: 'Clicks',
        value: summary.clicks,
        icon: MousePointerClick,
        color: 'from-pink-500 to-rose-600',
        bg: 'bg-pink-100 dark:bg-pink-950/40',
        iconColor: 'text-pink-600',
      },
      {
        key: 'redemptions',
        label: 'Redemptions',
        value: summary.redemptions,
        icon: Receipt,
        color: 'from-emerald-500 to-teal-600',
        bg: 'bg-emerald-100 dark:bg-emerald-950/40',
        iconColor: 'text-emerald-600',
      },
      {
        key: 'conversion',
        label: 'Conversion',
        value: formatPercent(summary.conversionRate),
        sublabel: summary.conversionRate !== null ? 'redemptions / views' : 'no views yet',
        icon: TrendingUp,
        color: 'from-amber-500 to-orange-600',
        bg: 'bg-amber-100 dark:bg-amber-950/40',
        iconColor: 'text-amber-600',
      },
      {
        key: 'avgDiscount',
        label: 'Avg Discount',
        value: `€${summary.averageDiscount.toFixed(2)}`,
        icon: Tag,
        color: 'from-rose-500 to-red-600',
        bg: 'bg-rose-100 dark:bg-rose-950/40',
        iconColor: 'text-rose-600',
      },
      {
        key: 'avgSavings',
        label: 'Avg Savings',
        value: `€${summary.averageSavings.toFixed(2)}`,
        icon: Sparkles,
        color: 'from-fuchsia-500 to-pink-600',
        bg: 'bg-fuchsia-100 dark:bg-fuchsia-950/40',
        iconColor: 'text-fuchsia-600',
      },
    ],

    charts: [
      {
        key: 'statusPie',
        kind: 'pie',
        title: 'Offer Status Pie',
        subtitle: 'Breakdown by offer status',
        icon: FilterIcon,
        data: charts.statusDistribution,
        showLegend: true,
      },
      {
        key: 'funnel',
        kind: 'funnel',
        title: 'Offer Funnel',
        subtitle: 'From views to redemptions',
        icon: ArrowRight,
        data: charts.funnel,
        showDropOffSummary: true,
      },
      {
        key: 'dailyTrend',
        kind: 'line',
        title: 'Daily Redemption Line',
        subtitle: 'Redemptions over the last 30 days',
        icon: Activity,
        data: charts.dailyTrend,
        span: 8,
      },
      {
        key: 'categoryPie',
        kind: 'pie',
        title: 'Offer Category Pie',
        subtitle: 'Offers by category / type',
        icon: BarChart3,
        data: charts.categoryDistribution,
        showLegend: true,
        span: 4,
      },
    ],

    table: {
      key: 'offerPerformance',
      kind: 'offerPerformance',
      title: 'Offer Performance',
      subtitle: `${offerPerformance.length} ${offerPerformance.length === 1 ? 'offer' : 'offers'} · sorted by redemptions`,
      icon: Store,
      rows: offerPerformance as any,
      defaultSort: { key: 'redemptions', dir: 'desc' },
      pageSize: 5,
    },
  }
}
