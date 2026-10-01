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
import { PIE_COLORS } from '@/components/analytics/analytics-charts'
import { ShoppingBag, TrendingUp, Users, Banknote, Award, Store } from 'lucide-react'

interface AnalyticsResponse {
  data: {
    summary: {
      totalRedemptions: number
      totalDiscount: number
      totalSavings: number
      allTimeSavings: number
      activeEmployees: number
    }
    topOffers: { offerId: string; title: string; redemptions: number; totalSavings: number }[]
    topMerchants: { merchantId: string; businessName: string; logoUrl: string | null; redemptions: number; totalSavings: number }[]
    usageTrend: { date: string; total: number }[]
  }
}

function formatCurrency(n: number) {
  return `€${Number(n).toFixed(2)}`
}

export default function CompanyAnalyticsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const { data, isLoading } = useQuery({
    queryKey: ['company-analytics', params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/company/analytics?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load analytics')
      return json as AnalyticsResponse
    },
  })

  const summary = data?.data.summary
  const topOffers = data?.data.topOffers ?? []
  const topMerchants = data?.data.topMerchants ?? []
  const trend = data?.data.usageTrend ?? []

  const trendLineData = useMemo(() => {
    if (trend.length === 0) return []
    return trend.map((t) => ({
      date: new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      Redemptions: t.total,
    }))
  }, [trend])

  const offerBarData = useMemo(() => {
    if (topOffers.length === 0) return []
    return topOffers.map((o) => ({
      name: o.title.length > 15 ? o.title.slice(0, 15) + '...' : o.title,
      Redemptions: o.redemptions,
    }))
  }, [topOffers])

  const merchantPieData = useMemo(() => {
    if (topMerchants.length === 0) return []
    return topMerchants.map((m) => ({
      name: m.businessName,
      value: m.redemptions,
    }))
  }, [topMerchants])

  const loading = isLoading || !summary

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Employee engagement and redemption insights"
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
        <AnalyticsKPICard label="Total Redemptions" value={summary?.totalRedemptions ?? 0} icon={ShoppingBag} iconBg="bg-blue-100 text-blue-600" accentColor="from-blue-500 to-indigo-600" loading={loading} />
        <AnalyticsKPICard label="Active Employees" value={summary?.activeEmployees ?? 0} icon={Users} iconBg="bg-emerald-100 text-emerald-600" accentColor="from-emerald-500 to-teal-600" loading={loading} />
        <AnalyticsKPICard label="Savings (Period)" value={formatCurrency(summary?.totalSavings ?? 0)} icon={Banknote} iconBg="bg-purple-100 text-purple-600" accentColor="from-purple-500 to-pink-600" loading={loading} sublabel={`All-time: ${formatCurrency(summary?.allTimeSavings ?? 0)}`} />
        <AnalyticsKPICard label="Total Discount" value={formatCurrency(summary?.totalDiscount ?? 0)} icon={TrendingUp} iconBg="bg-amber-100 text-amber-600" accentColor="from-amber-500 to-orange-600" loading={loading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> Redemption Trend
          </CardTitle>
          <CardDescription>Daily employee redemption activity</CardDescription>
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
              lines={[{ key: 'Redemptions', color: '#10b981', name: 'Redemptions', dot: true }]}
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
              <Award className="h-4 w-4" /> Top Offers by Redemptions
            </CardTitle>
            <CardDescription>Most redeemed offers by your employees</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <AnalyticsBarChart
                data={offerBarData}
                xKey="name"
                bars={[{ key: 'Redemptions', color: '#3b82f6', name: 'Redemptions' }]}
                height={250}
                emptyMessage="No offer redemption data available"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4" /> Top Merchants by Redemptions
            </CardTitle>
            <CardDescription>Most popular merchants among your employees</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[250px] w-full" />
            ) : (
              <AnalyticsPieChart
                data={merchantPieData}
                height={250}
                outerRadius={85}
                colors={PIE_COLORS}
                showLegend
                legendMax={5}
                emptyMessage="No merchant redemption data available"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
