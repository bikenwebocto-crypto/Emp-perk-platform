'use client'
import { eurExact } from '@/lib/format'
import {
  Eye,
  Bookmark,
  MousePointerClick,
  Receipt,
  TrendingUp,
  Users,
  Package,
  Building2,
  Calendar,
  MapPin,
  Briefcase,
  Sparkles,
  ExternalLink,
  Activity,
  BarChart3,
  Filter as FilterIcon,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CompanyAnalyticsDetailResponse } from '@/types'
import type { AnalyticsDialogConfig } from '@/components/analytics/analytics-config'

// ============================================================================
// Company config builder
//
// Maps a CompanyAnalyticsDetailResponse into an AnalyticsDialogConfig.
// Mirror of the merchant builder. The dialog itself is generic — the only
// difference is this mapping.
// ============================================================================

function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function buildCompanyAnalyticsConfig(
  response: CompanyAnalyticsDetailResponse,
): AnalyticsDialogConfig {
  const c = response.data.company
  const overview = response.data.overview
  const mostActiveEmployees = response.data.mostActiveEmployees
  const mostUsedMerchants = response.data.mostUsedMerchants
  const charts = response.data.charts

  return {
    entityType: 'company',
    entityId: c.id,

    title: c.name,
    subtitle: [c.city, c.state].filter(Boolean).join(', ') || undefined,
    avatarUrl: c.logo,
    statusNode: (
      <Badge variant="outline" className="text-[10px]">
        {c.status.replace(/_/g, ' ')}
      </Badge>
    ),
    badges: [
      ...(c.industry
        ? [
            {
              key: 'industry',
              node: (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Briefcase className="h-3 w-3" /> {c.industry}
                </Badge>
              ),
            },
          ]
        : []),
    ],
    meta: [
      {
        key: 'email',
        node: <span className="truncate">{c.email}</span>,
      },
      {
        key: 'employeeCount',
        node: (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {c.employeeCount} employees
          </span>
        ),
      },
    ],
    headerAction: (
      <a
        href={`/admin/companies/${c.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline-flex sm:items-center sm:gap-1"
      >
        View full company <ExternalLink className="h-3 w-3" />
      </a>
    ),
    footer: (
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Joined {formatDate(c.createdAt)}
          </span>
          {c.approvedAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Approved {formatDate(c.approvedAt)}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px]">
          ID: <code className="rounded bg-muted px-1.5 py-0.5">{c.id.slice(0, 8)}</code>
        </span>
      </div>
    ),

    kpis: [
      {
        key: 'employees',
        label: 'Employees',
        value: overview.employees,
        sublabel: `${overview.active} active`,
        icon: Users,
        color: 'from-blue-500 to-indigo-600',
        bg: 'bg-blue-100 dark:bg-blue-950/40',
        iconColor: 'text-blue-600',
      },
      {
        key: 'active',
        label: 'Active',
        value: overview.active,
        icon: Users,
        color: 'from-emerald-500 to-teal-600',
        bg: 'bg-emerald-100 dark:bg-emerald-950/40',
        iconColor: 'text-emerald-600',
      },
      {
        key: 'inactive',
        label: 'Inactive',
        value: overview.inactive,
        icon: Users,
        color: 'from-gray-400 to-gray-600',
        bg: 'bg-gray-100 dark:bg-gray-900/40',
        iconColor: 'text-gray-600',
      },
      {
        key: 'neverLoggedIn',
        label: 'Never Logged In',
        value: overview.neverLoggedIn,
        icon: Users,
        color: 'from-amber-500 to-orange-600',
        bg: 'bg-amber-100 dark:bg-amber-950/40',
        iconColor: 'text-amber-600',
      },
      {
        key: 'views',
        label: 'Views',
        value: overview.views,
        icon: Eye,
        color: 'from-cyan-500 to-blue-600',
        bg: 'bg-cyan-100 dark:bg-cyan-950/40',
        iconColor: 'text-cyan-600',
      },
      {
        key: 'saves',
        label: 'Saves',
        value: overview.saves,
        icon: Bookmark,
        color: 'from-violet-500 to-purple-600',
        bg: 'bg-violet-100 dark:bg-violet-950/40',
        iconColor: 'text-violet-600',
      },
      {
        key: 'clicks',
        label: 'Clicks',
        value: overview.clicks,
        icon: MousePointerClick,
        color: 'from-pink-500 to-rose-600',
        bg: 'bg-pink-100 dark:bg-pink-950/40',
        iconColor: 'text-pink-600',
      },
      {
        key: 'redeemed',
        label: 'Redeemed',
        value: overview.redeemed,
        sublabel: `Avg save ${eurExact.format(overview.averageSaving)}`,
        icon: Receipt,
        color: 'from-emerald-500 to-teal-600',
        bg: 'bg-emerald-100 dark:bg-emerald-950/40',
        iconColor: 'text-emerald-600',
      },
    ],

    charts: [
      {
        key: 'categoryPie',
        kind: 'pie',
        title: 'Category Pie',
        subtitle: 'Redemptions by category',
        icon: FilterIcon,
        data: charts.categoryPie,
        showLegend: true,
      },
      {
        key: 'funnel',
        kind: 'funnel',
        title: 'Employee Funnel',
        subtitle: 'From views to redemptions',
        icon: ArrowRight,
        data: charts.employeeFunnel,
        showDropOffSummary: true,
      },
      {
        key: 'dailyRedemptionLine',
        kind: 'line',
        title: 'Daily Redemption Line',
        subtitle: 'Redemptions over the last 30 days',
        icon: Activity,
        data: charts.dailyRedemptionLine,
        span: 8,
      },
      {
        key: 'merchantPie',
        kind: 'pie',
        title: 'Merchant Pie',
        subtitle: 'Redemptions by merchant',
        icon: BarChart3,
        data: charts.merchantPie,
        showLegend: true,
        span: 4,
      },
    ],

    // Companies don't have a single "Offer Performance" table — they have
    // most-active-employees + most-used-merchants. We can add a second
    // table type later; for now we use the same `offerPerformance` kind
    // by aliasing it to the most-used-merchants rows since the column
    // shape is similar (name, count, savings).
    table: {
      key: 'topMerchants',
      kind: 'offerPerformance',
      title: 'Top Merchants Used',
      subtitle: `${mostUsedMerchants.length} ${mostUsedMerchants.length === 1 ? 'merchant' : 'merchants'} · sorted by redemptions`,
      icon: Building2,
      rows: mostUsedMerchants.map((m) => ({
        id: m.id,
        title: m.businessName,
        status: 'ACTIVE',
        views: 0,
        saves: 0,
        clicks: 0,
        redemptions: m.redemptions,
        conversionRate: null,
      })),
      defaultSort: { key: 'redemptions', dir: 'desc' },
      pageSize: 5,
    },
  }
}
