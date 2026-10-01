'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/page-header'
import { AnalyticsKPICard } from '@/components/analytics/analytics-kpi-card'
import { AnalyticsBarChart } from '@/components/analytics/analytics-bar-chart'
import { AnalyticsLineChart } from '@/components/analytics/analytics-line-chart'
import { AnalyticsPieChart } from '@/components/analytics/analytics-pie-chart'
import { PIE_COLORS, formatNumber } from '@/components/analytics/analytics-charts'
import { ShoppingBag, TrendingUp, Building2, Store, Gift, Clock, Banknote } from 'lucide-react'

interface AnalyticsResponse {
  data: {
    period: { from: string; to: string }
    summary: { totalRedemptions: number; totalDiscount: number; totalSavings: number }
    byMerchant: { merchantId: string; businessName: string; city: string | null; state: string| null; logoUrl: string | null; redemptions: number; totalSavings: number }[]
    byCompany: { companyId: string; name: string; redemptions: number; totalSavings: number }[]
    byCity: { city: string; redemptions: number }[]
    byCategory: { name: string; redemptions: number }[]
    redemptionTrend: { date: string; total: number }[]
  }
}
  
interface OverviewResponse {
  data: {
    summary: { totalRedemptions: number; totalDiscount: number; totalSavings: number; activeMerchants: number; activeCompanies: number; activeOffers: number; pendingActions: number }
    periodComparison: { redemptionsChange: number; discountChange: number; savingsChange: number }
  }
}

function formatCurrency(n: number) {
  return `€${Number(n).toFixed(2)}`
}

export default function AdminAnalyticsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const RANK_BADGE = [
    'bg-gradient-to-br from-amber-300 to-yellow-500 text-amber-950',
    'bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900',
    'bg-gradient-to-br from-orange-300 to-amber-600 text-orange-950',
  ]
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['admin-analytics', params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/analytics?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json as AnalyticsResponse
    },
  })

  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['admin-overview-summary'],
    queryFn: async () => {
      const res = await fetch('/api/admin/overview')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
      return json as OverviewResponse
    },
  })

  const loading = analyticsLoading || overviewLoading
  const d = analyticsData?.data
  const ov = overviewData?.data
  const summary = d?.summary
  const ovSummary = ov?.summary
  const comp = ov?.periodComparison

  const byMerchant = d?.byMerchant ?? []
  const topMerchants = useMemo(() => byMerchant.slice(0, 8), [byMerchant])
  const byCompany = d?.byCompany ?? []
  const byCategory = d?.byCategory ?? []
  const trend = d?.redemptionTrend ?? []

  const merchantBarData = useMemo(() => {
    if (byMerchant.length === 0) return []
    return byMerchant.slice(0, 10).map((m) => ({
      name: m.businessName.length > 12 ? m.businessName.slice(0, 12) + '...' : m.businessName,
      Redemptions: m.redemptions,
    }))
  }, [byMerchant])

  const companyBarData = useMemo(() => {
    if (byCompany.length === 0) return []
    return byCompany.slice(0, 10).map((c) => ({
      name: c.name.length > 12 ? c.name.slice(0, 12) + '...' : c.name,
      Redemptions: c.redemptions,
    }))
  }, [byCompany])

  const trendLineData = useMemo(() => {
    if (trend.length === 0) return []
    return trend.map((t) => ({
      date: new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      Redemptions: t.total,
    }))
  }, [trend])

  const categoryPieData = useMemo(() => {
    if (byCategory.length === 0) return []
    return byCategory.map((c) => ({ name: c.name, value: c.redemptions }))
  }, [byCategory])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Analytics"
        description="Comprehensive platform-wide metrics and insights"
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          <Button variant="outline" onClick={() => { setFrom(''); setTo('') }} className="h-9">
            Reset
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsKPICard label="Total Redemptions" value={ovSummary?.totalRedemptions ?? summary?.totalRedemptions ?? 0} icon={ShoppingBag} iconBg="bg-blue-100 text-blue-600" accentColor="from-blue-500 to-indigo-600" loading={loading} trend={comp ? { value: comp.redemptionsChange, isUpward: comp.redemptionsChange >= 0 } : undefined} />
        <AnalyticsKPICard label="Total Savings" value={formatCurrency(ovSummary?.totalSavings ?? summary?.totalSavings ?? 0)} icon={Banknote} iconBg="bg-emerald-100 text-emerald-600" accentColor="from-emerald-500 to-teal-600" loading={loading} trend={comp ? { value: comp.savingsChange, isUpward: comp.savingsChange >= 0 } : undefined} />
        <AnalyticsKPICard label="Active Merchants" value={ovSummary?.activeMerchants ?? 0} icon={Store} iconBg="bg-purple-100 text-purple-600" accentColor="from-purple-500 to-pink-600" loading={loading} />
        <AnalyticsKPICard label="Active Companies" value={ovSummary?.activeCompanies ?? 0} icon={Building2} iconBg="bg-amber-100 text-amber-600" accentColor="from-amber-500 to-orange-600" loading={loading} />
        <AnalyticsKPICard label="Active Offers" value={ovSummary?.activeOffers ?? 0} icon={Gift} iconBg="bg-rose-100 text-rose-600" accentColor="from-rose-500 to-red-600" loading={loading} />
        <AnalyticsKPICard label="Pending Approvals" value={ovSummary?.pendingActions ?? 0} icon={Clock} iconBg="bg-orange-100 text-orange-600" accentColor="from-orange-500 to-red-600" loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> Redemption Trend
          </CardTitle>
          <CardDescription>Daily redemption activity across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No redemptions in the selected period.</p>
          ) : (
            <AnalyticsLineChart
              data={trendLineData}
              xKey="date"
              lines={[{ key: 'Redemptions', color: '#3b82f6', name: 'Redemptions', dot: true }]}
              height={250}
              emptyMessage="No redemptions yet"
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4" /> Top Merchants by Redemptions
            </CardTitle>
            <CardDescription>Most redeemed merchants in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <AnalyticsBarChart
                data={merchantBarData}
                xKey="name"
                bars={[{ key: 'Redemptions', color: '#3b82f6', name: 'Redemptions' }]}
                height={250}
                emptyMessage="No merchant data available"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Top Companies by Redemptions
            </CardTitle>
            <CardDescription>Most active companies in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <AnalyticsBarChart
                data={companyBarData}
                xKey="name"
                bars={[{ key: 'Redemptions', color: '#8b5cf6', name: 'Redemptions' }]}
                height={250}
                emptyMessage="No company data available"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4" /> Redemption by Category
            </CardTitle>
            <CardDescription>Offer category distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <AnalyticsPieChart
                data={categoryPieData}
                height={250}
                outerRadius={85}
                colors={PIE_COLORS}
                showLegend
                legendMax={6}
                emptyMessage="No category data available"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Top Merchants
            </CardTitle>
            <CardDescription>Highest redemption merchants</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : byMerchant.length === 0 ? (
              <p className="text-sm text-muted-foreground">No merchant data available.</p>
            ) : (
            <ul className="space-y-2">
  {topMerchants.map((m, i) => {
    const location = [m.city, m.state].filter(Boolean).join(', ')
    const share = summary?.totalRedemptions ? (m.redemptions / summary.totalRedemptions) * 100 : 0
    const barWidth = Math.min(100, share)

    return (
      <li
        key={m.merchantId}
        className={`flex items-center gap-3 rounded-xl border p-3 transition-all hover:border-primary/30 hover:shadow-sm ${
          i === 0 ? 'border-amber-300/60 bg-gradient-to-r from-amber-50/70 to-transparent dark:border-amber-500/30 dark:from-amber-950/20' : 'bg-card'
        }`}
      >
        {/* Rank */}
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            RANK_BADGE[i] ?? 'bg-muted text-muted-foreground'
          }`}
        >
          {i + 1}
        </span>

        {/* Logo with initials fallback */}
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-gradient-to-br from-primary/10 to-primary/20 text-xs font-semibold text-primary">
          {m.businessName.slice(0, 2).toUpperCase()}
          {m.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.logoUrl}
              alt={`${m.businessName} logo`}
              loading="lazy"
              className="absolute inset-0 h-full w-full bg-white object-contain p-1"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          )}
        </div>

        {/* Name, location, share bar */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{m.businessName}</p>
          <p className="truncate text-xs text-muted-foreground">{location || '—'}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {share.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="shrink-0 text-right">
          <p className="text-base font-bold leading-none tabular-nums">{m.redemptions}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {m.redemptions === 1 ? 'redemption' : 'redemptions'}
          </p>
          <p className="mt-1 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(m.totalSavings)}
          </p>
        </div>
      </li>
    )
  })}
</ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
