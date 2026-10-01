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
import { AnalyticsPieChart } from '@/components/analytics/analytics-pie-chart'
import { PIE_COLORS } from '@/components/analytics/analytics-charts'
import { Eye, ShoppingBag, TrendingUp, Gift, Banknote, Award } from 'lucide-react'

interface AnalyticsResponse {
  data: {
    period: { from: string; to: string }
    summary: {
      totalRedemptions: number
      totalDiscount: number
      totalSavings: number
      allTimeRedemptions: number
      allTimeSavings: number
      liveOffers: number
    }
    topOffers: {
      id: string
      title: string
      status: string
      views: number
      saves: number
      redemptions: number
      conversionRate: number
    }[]
    branchPerformance: { id: string; name: string; type: string; redemptions: number }[]
    redemptionTrend: { date: string; total: number }[]
  }
}

function formatCurrency(n: number) {
  return `€${Number(n).toFixed(2)}`
}

const STATUS_LABELS: Record<string, string> = {
  LIVE: 'Live', DRAFT: 'Draft', AWAITING_APPROVAL: 'Pending', EXPIRED: 'Expired', REJECTED: 'Rejected',
}

export default function MerchantAnalyticsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)

  const { data, isLoading } = useQuery({
    queryKey: ['merchant-analytics', params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/merchant/analytics/summary?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load analytics')
      return json as AnalyticsResponse
    },
  })

  const summary = data?.data.summary
  const topOffers = data?.data.topOffers ?? []
  const branches = data?.data.branchPerformance ?? []
  const trend = data?.data.redemptionTrend ?? []

  const barData = useMemo(() => {
    if (topOffers.length === 0) return []
    return topOffers.map((o) => ({
      name: o.title.length > 15 ? o.title.slice(0, 15) + '...' : o.title,
      Views: o.views,
      Redemptions: o.redemptions,
    }))
  }, [topOffers])

  const pieData = useMemo(() => {
    const counts: Record<string, number> = {}
    topOffers.forEach((o) => {
      const label = STATUS_LABELS[o.status] ?? o.status
      counts[label] = (counts[label] || 0) + 1
    })
    return Object.entries(counts).map(([name, value]) => ({ name, value }))
  }, [topOffers])

  const totalViews = topOffers.reduce((sum, o) => sum + o.views, 0)
  const totalRedemptions = summary?.totalRedemptions ?? 0
  const conversionRate = totalViews > 0 ? ((totalRedemptions / totalViews) * 100).toFixed(1) : '0.0'

  const loading = isLoading || !summary

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Performance insights for your offers, branches, and redemptions"
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AnalyticsKPICard label="Total Views" value={totalViews.toLocaleString()} icon={Eye} iconBg="bg-blue-100 text-blue-600" accentColor="from-blue-500 to-indigo-600" loading={loading} />
        <AnalyticsKPICard label="Total Redemptions" value={summary?.totalRedemptions ?? 0} icon={ShoppingBag} iconBg="bg-emerald-100 text-emerald-600" accentColor="from-emerald-500 to-teal-600" loading={loading} />
        <AnalyticsKPICard label="Conversion Rate" value={`${conversionRate}%`} icon={TrendingUp} iconBg="bg-purple-100 text-purple-600" accentColor="from-purple-500 to-pink-600" loading={loading} />
        <AnalyticsKPICard label="Campaign Expenditure" value={formatCurrency(summary?.totalSavings ?? 0)} icon={Banknote} iconBg="bg-amber-100 text-amber-600" accentColor="from-amber-500 to-orange-600" loading={loading} />
        <AnalyticsKPICard label="Active Offers" value={summary?.liveOffers ?? 0} icon={Gift} iconBg="bg-rose-100 text-rose-600" accentColor="from-rose-500 to-red-600" loading={loading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100">
                <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
              </div>
              Views vs Redemptions
            </CardTitle>
            <CardDescription>Per-offer view and redemption comparison</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <AnalyticsBarChart
                data={barData}
                xKey="name"
                bars={[
                  { key: 'Views', color: '#3b82f6', name: 'Views' },
                  { key: 'Redemptions', color: '#22c55e', name: 'Redemptions' },
                ]}
                height={300}
                emptyMessage="Offer data will appear here once your campaigns get engagement"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100">
                <Gift className="h-3.5 w-3.5 text-purple-600" />
              </div>
              Offer Status Distribution
            </CardTitle>
            <CardDescription>Current breakdown of your offer statuses</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <AnalyticsPieChart
                data={pieData}
                height={300}
                innerRadius={60}
                outerRadius={100}
                colors={PIE_COLORS}
                showLegend
                emptyMessage="Create offers to see your status distribution"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4" /> Top Offers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : topOffers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offer data yet.</p>
            ) : (
              <ul className="space-y-2">
                {topOffers.map((o, i) => (
                  <li key={o.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        #{i + 1} {o.title}
                      </p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{o.status}</span>
                    </div>
                    <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {o.views} views</span>
                      <span className="inline-flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> {o.redemptions} redemptions</span>
                      <span>{o.conversionRate}% conv.</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4" /> Branch Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No branches yet.</p>
            ) : (
              <ul className="space-y-2">
                {branches.map((b) => (
                  <li key={b.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <div>
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{b.type}</p>
                    </div>
                    <span className="text-sm font-semibold">{b.redemptions}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Redemption Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No redemptions in the selected period.</p>
          ) : (
            <AnalyticsBarChart
              data={trend.map((t) => ({ date: new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), Redemptions: t.total }))}
              xKey="date"
              bars={[{ key: 'Redemptions', color: '#3b82f6', name: 'Redemptions' }]}
              height={200}
              emptyMessage="No redemptions in the selected period."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
