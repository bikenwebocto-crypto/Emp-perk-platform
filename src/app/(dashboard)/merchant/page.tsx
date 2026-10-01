'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/utils/cn'
import {
  ShoppingBag,
  Eye,
  TrendingUp,
  Star,
  Gift,
  Plus,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ExternalLink,
  Banknote,
  Sparkles,
  Bell,
  AlertCircle,
  BarChart3,
  Activity,
  ChevronRight,
  Percent,
  FileText,
} from 'lucide-react'

interface DashboardData {
  businessName: string
  stats: {
    liveOffers: { value: number; change: number; trend: 'up' | 'down' }
    activeViews: { value: number; change: number; trend: 'up' | 'down' }
    redemptionCount: { value: number; change: number; trend: 'up' | 'down' }
    monthlySavings: { value: string; change: number; trend: 'up' | 'down' }
    activeBookings: { value: number }
  }
  redemptions: {
    code: string
    employee: { name: string; initials: string }
    discount: string
    time: string
    status: 'verified' | 'pending' | 'rejected'
  }[]
  activities: {
    type: 'redemption' | 'offer' | 'review' | 'alert'
    title: string
    description: string
    time: string
  }[]
}

function formatCurrency(n: number) {
  return `€${Number(n).toFixed(2)}`
}

function timeAgo(date: string | Date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

async function fetchDashboard(): Promise<DashboardData> {
  const [analyticsRes, overviewRes, redemptionsRes, profileRes] = await Promise.all([
    fetch('/api/merchant/analytics/summary'),
    fetch('/api/merchant/profile/business-overview'),
    fetch('/api/merchant/redemptions?pageSize=5'),
    fetch('/api/merchant/profile'),
  ])

  const analyticsJson = analyticsRes.ok ? await analyticsRes.json() : null
  const overviewJson = overviewRes.ok ? await overviewRes.json() : null
  const redemptionsJson = redemptionsRes.ok ? await redemptionsRes.json() : null
  const profileJson = profileRes.ok ? await profileRes.json() : null

  const summary = analyticsJson?.data?.summary
  const topOffers: any[] = analyticsJson?.data?.topOffers ?? []
  const banners = overviewJson?.data?.banners
  const redemptionRows: any[] = redemptionsJson?.data ?? []
  const businessName: string = profileJson?.data?.businessName ?? 'Your Business'

  const totalViews = topOffers.reduce((sum: number, o: any) => sum + (o.views ?? 0), 0)

  const redemptions = redemptionRows.map((r: any) => {
    const employeeName = r.employee
      ? `${r.employee.firstName ?? ''} ${r.employee.lastName ?? ''}`.trim()
      : 'Unknown'
    const initials = employeeName
      .split(' ')
      .map((s: string) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
    return {
      code: r.redemptionCode ?? r.id?.slice(0, 8) ?? '',
      employee: { name: employeeName, initials },
      discount: formatCurrency(r.discountAmount ?? 0),
      time: r.redeemedAt ? timeAgo(r.redeemedAt) : '',
      status: (r.isVerified ? 'verified' : r.status === 'REJECTED' ? 'rejected' : 'pending') as 'verified' | 'pending' | 'rejected',
    }
  })

  const activities = redemptions.slice(0, 4).map((r) => ({
    type: 'redemption' as const,
    title: `${r.employee.name} redeemed ${r.discount}`,
    description: `Code ${r.code}`,
    time: r.time,
  }))

  return {
    businessName,
    stats: {
      liveOffers: { value: summary?.liveOffers ?? 0, change: 0, trend: 'up' },
      activeViews: { value: totalViews, change: 0, trend: 'up' },
      redemptionCount: { value: summary?.totalRedemptions ?? 0, change: 0, trend: 'up' },
      monthlySavings: { value: formatCurrency(summary?.totalDiscount ?? 0), change: 0, trend: 'up' },
      activeBookings: { value: banners?.active?.length ?? 0 },
    },
    redemptions,
    activities,
  }
}

interface DashboardStat {
  title: string
  value: string | number
  href: string
  trend?: { value: number; isUp: boolean }
  description?: string
  icon: React.ElementType
  accentClass: string
}

function DashboardStatCard({ title, value, href, trend, description, icon: Icon, accentClass }: DashboardStat) {
  return (
    <Link href={href} className="block">
      <Card className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {trend && (
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-xs font-medium',
                      trend.isUp ? 'text-emerald-600' : 'text-red-600',
                    )}
                  >
                    {trend.isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(trend.value)}%
                  </span>
                  {description && <span className="text-xs text-muted-foreground">vs {description}</span>}
                </div>
              )}
            </div>
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', accentClass)}>
              <Icon className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export default function MerchantDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['merchant-dashboard'],
    queryFn: fetchDashboard,
    retry: false,
    staleTime: 60_000,
  })

  const d = data ?? {
    businessName: 'Your Business',
    stats: {
      liveOffers: { value: 0, change: 0, trend: 'up' as const },
      activeViews: { value: 0, change: 0, trend: 'up' as const },
      redemptionCount: { value: 0, change: 0, trend: 'up' as const },
      monthlySavings: { value: '€0.00', change: 0, trend: 'up' as const },
      activeBookings: { value: 0 },
    },
    redemptions: [],
    activities: [],
  }
  const s = d.stats

  return (
    <div className="space-y-8 pb-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 text-white sm:p-8">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        <div className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-100/80">Welcome back</p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {isLoading ? <Skeleton className="h-8 w-48 bg-white/20" /> : d.businessName}
              </h1>
              <p className="text-sm text-blue-100/70">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                &nbsp;&middot;&nbsp;Here&apos;s your business overview
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/merchant/offers/create">
                <Button size="sm" variant="secondary" className="gap-1.5 bg-white/15 text-white hover:bg-white/25">
                  <Plus className="h-3.5 w-3.5" /> New Offer
                </Button>
              </Link>
              <Link href="/merchant/analytics">
                <Button size="sm" variant="secondary" className="gap-1.5 bg-white/15 text-white hover:bg-white/25">
                  <BarChart3 className="h-3.5 w-3.5" /> Reports
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards - Business Overview with Drill-down */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Business Overview</h2>
          <Link href="/merchant/analytics">
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              Full analytics <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><div className="space-y-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-24" /><Skeleton className="h-3 w-16" /></div></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardStatCard
              title="Live Offers"
              value={s.liveOffers.value}
              href="/merchant/offers"
              trend={{ value: s.liveOffers.change, isUp: s.liveOffers.trend === 'up' }}
              description="last week"
              icon={Gift}
              accentClass="bg-blue-600"
            />
            <DashboardStatCard
              title="Offer Views"
              value={s.activeViews.value.toLocaleString()}
              href="/merchant/analytics"
              trend={{ value: s.activeViews.change, isUp: s.activeViews.trend === 'up' }}
              description="last week"
              icon={Eye}
              accentClass="bg-purple-600"
            />
            <DashboardStatCard
              title="Redemptions"
              value={s.redemptionCount.value}
              href="/merchant/redemptions"
              trend={{ value: s.redemptionCount.change, isUp: s.redemptionCount.trend === 'up' }}
              description="last month"
              icon={ShoppingBag}
              accentClass="bg-emerald-600"
            />
            <DashboardStatCard
              title="Campaign Expenditure"
              value={s.monthlySavings.value}
              href="/merchant/analytics"
              trend={{ value: s.monthlySavings.change, isUp: s.monthlySavings.trend === 'up' }}
              description="last month"
              icon={Banknote}
              accentClass="bg-amber-500"
            />
            <DashboardStatCard
              title="Active Bookings"
              value={s.activeBookings.value}
              href="/merchant/banners"
              icon={Sparkles}
              accentClass="bg-rose-500"
            />
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="grid gap-6 lg:grid-cols-4">
        <Link href="/merchant/offers" className="block lg:col-span-1">
          <Card className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 h-full">
            <CardContent className="flex flex-col items-center justify-center gap-2 p-5 text-center h-full">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
                <Gift className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Manage Offers</p>
                <p className="text-xs text-muted-foreground">Create, edit, replace offers</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/merchant/branches" className="block lg:col-span-1">
          <Card className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 h-full">
            <CardContent className="flex flex-col items-center justify-center gap-2 p-5 text-center h-full">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Branches</p>
                <p className="text-xs text-muted-foreground">Manage locations</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/merchant/redemptions" className="block lg:col-span-1">
          <Card className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 h-full">
            <CardContent className="flex flex-col items-center justify-center gap-2 p-5 text-center h-full">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
                <ShoppingBag className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Redemptions</p>
                <p className="text-xs text-muted-foreground">Track redemptions</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/merchant/banners" className="block lg:col-span-1">
          <Card className="group cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 h-full">
            <CardContent className="flex flex-col items-center justify-center gap-2 p-5 text-center h-full">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
                <Sparkles className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <p className="text-sm font-medium">Banner Bookings</p>
                <p className="text-xs text-muted-foreground">Manage sponsored banners</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>

      {/* Recent Redemptions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                  <ShoppingBag className="h-3.5 w-3.5" />
                </div>
                Recent Redemptions
              </CardTitle>
              <CardDescription>Latest employee redemptions across your offers</CardDescription>
            </div>
            <Link href="/merchant/redemptions">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                View all <ChevronRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : d.redemptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ShoppingBag className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <h3 className="mt-4 text-sm font-medium">No redemptions yet</h3>
              <p className="mt-1 text-center text-xs text-muted-foreground">When employees start redeeming your offers, they&apos;ll appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-3 pr-3 font-medium">Employee</th>
                    <th className="pb-3 pr-3 font-medium">Code</th>
                    <th className="pb-3 pr-3 font-medium">Discount</th>
                    <th className="pb-3 pr-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.redemptions.map((r, i) => {
                    const statusStyles: Record<string, string> = {
                      verified: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    }
                    const statusLabels: Record<string, string> = { verified: 'Verified', pending: 'Pending', rejected: 'Rejected' }
                    return (
                      <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/30 last:border-0">
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-[10px] font-medium">{r.employee.initials}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{r.employee.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-3">
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{r.code}</code>
                        </td>
                        <td className="py-3 pr-3 font-medium">{r.discount}</td>
                        <td className="py-3 pr-3">
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" /> {r.time}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', statusStyles[r.status])}>
                            {statusLabels[r.status]}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                  <Activity className="h-3.5 w-3.5" />
                </div>
                Recent Activity
              </CardTitle>
              <CardDescription>Latest updates from your dashboard</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                </div>
              ))}
            </div>
          ) : d.activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Activity className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <h3 className="mt-4 text-sm font-medium">No recent activity</h3>
              <p className="mt-1 text-center text-xs text-muted-foreground">Activity from your offers and redemptions will show up here</p>
            </div>
          ) : (
            <div>
              {d.activities.map((activity, i) => {
                const iconMap: Record<string, React.ElementType> = { redemption: ShoppingBag, offer: BarChart3, review: Star, alert: AlertCircle }
                const colorMap: Record<string, string> = {
                  redemption: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
                  offer: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
                  review: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
                  alert: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                }
                const Icon = iconMap[activity.type] || Bell
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={cn('flex h-8 w-8 items-center justify-center rounded-full', colorMap[activity.type])}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="mt-1 w-px flex-1 bg-border" />
                    </div>
                    <div className="min-w-0 flex-1 pb-6">
                      <p className="text-sm font-medium">{activity.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{activity.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/60">{activity.time}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
