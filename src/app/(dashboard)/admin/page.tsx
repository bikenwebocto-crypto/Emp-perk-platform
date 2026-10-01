'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/shared/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDashboardStore } from '@/store/dashboard-store'
import { useActionQueueStore } from '@/store/action-queue-store'
import { useActionQueueStats } from '@/hooks/queries/use-action-queue'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Store,
  Building2,
  ShoppingBag,
  Clock,
  CheckCircle2,
  FileText,
  Tag,
  Shield,
  Bug,
  Bell,
  ArrowRight,
  Sparkles,
  Activity,
  Zap,
  ChevronRight,
  Euro,
  Repeat,
  Users,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { PendingApprovalsList } from '@/components/admin/dashboard/PendingApprovalsList'
import type { PendingApproval } from '@/lib/admin/approval-routes'
import { eurCompact, eurExact, orDash } from '@/lib/format'
import { cn } from '@/utils/cn'

export default function AdminDashboard() {
  const summary = useDashboardStore((s) => s.summary)
  const setSummary = useDashboardStore((s) => s.setSummary)
  const pendingCount = useActionQueueStore((s) => s.pendingCount)

  const [loading, setLoading] = useState(true)
  const [recentActivity, setRecentActivity] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])

  const { data: stats } = useActionQueueStats()

  useEffect(() => {
    const getData = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/admin/overview')
        if (!res.ok) throw new Error('Failed to fetch admin overview')
        const response = await res.json()
        const { summary, recentActivity, pendingApprovals } = response.data
        console.log('Admin overview data:', response.data)
        setSummary(summary)
        setRecentActivity(recentActivity ?? [])
        setPendingApprovals(pendingApprovals ?? [])
      } catch (error) {
        console.error('Dashboard fetch error:', error)
      } finally {
        setLoading(false)
      }
    }
    getData()
  }, [pendingCount])

  if (loading || !summary) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  const queueCards = [
    {
      title: 'Merchant Applications',
      subtitle: 'New signups awaiting review',
      value: stats?.merchantApplications ?? 0,
      icon: FileText,
      href: 'admin/merchants?tab=pending',
      gradient: 'from-blue-500 to-indigo-600',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Offer Approvals',
      subtitle: 'Offers & replacements',
      value: (stats?.offerApprovals ?? 0) + (stats?.offerReplacements ?? 0) + (stats?.profileChanges ?? 0),
      icon: Tag,
      href: '/admin/action-queue?tab=OFFER_APPROVAL',
      gradient: 'from-violet-500 to-purple-600',
      bg: 'bg-violet-50 dark:bg-violet-950/30',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      title: 'Company Activations',
      subtitle: 'Pending company onboarding',
      value: stats?.companyActivations ?? 0,
      icon: Shield,
      href: '/admin/action-queue?tab=COMPANY_ACTIVATION',
      gradient: 'from-emerald-500 to-teal-600',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Open Issues',
      subtitle: 'Reported problems',
      value: stats?.openIssues ?? 0,
      icon: Bug,
      href: '/admin/action-queue?tab=ISSUES',
      gradient: 'from-rose-500 to-red-600',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      iconColor: 'text-rose-600 dark:text-rose-400',
    },
    {
      title: 'System Alerts',
      subtitle: 'Renewals & missing perks',
      value: (stats?.renewalAlerts ?? 0) + (stats?.missingPerks ?? 0),
      icon: Bell,
      href: '/admin/action-queue?tab=ALERTS',
      gradient: 'from-amber-500 to-orange-600',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
  ]

  const totalPending = queueCards.reduce((sum, c) => sum + c.value, 0)
  const trend = summary.redemptionsTrend
  const isPositiveTrend = trend != null && trend >= 0
  const engagementSubtitle = summary.totalEmployees > 0
    ? `${summary.activeEmployees.toLocaleString()} of ${summary.totalEmployees.toLocaleString()} employees · last 30 days`
    : 'No active employees yet'

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <p className="text-sm font-medium text-primary">Admin Overview</p>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Platform Health Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Monitor activity, manage approvals, and keep your platform running smoothly.
            </p>
          </div>
          {totalPending > 0 && (
            <div className="flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 backdrop-blur">
              <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
              </div>
              <span className="text-sm font-medium">{totalPending} items need attention</span>
              <Link href="/admin/action-queue">
                <Button size="sm" variant="ghost" className="h-7 px-2">
                  Review <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Top stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Live Offers"
          value={summary.liveOffers.toLocaleString()}
          icon={Tag}
          gradient="from-blue-500 to-indigo-600"
          iconBg="from-blue-500/15 to-indigo-600/15"
          iconColor="text-blue-600"
        >
          <p className="text-xs text-muted-foreground">{summary.pendingOffers.toLocaleString()} pending review</p>
        </KpiCard>

        <KpiCard
          label="Registered Employees"
          value={summary.totalEmployees.toLocaleString()}
          icon={Users}
          gradient="from-emerald-500 to-teal-600"
          iconBg="from-emerald-500/15 to-teal-600/15"
          iconColor="text-emerald-600"
        >
          <p className="text-xs text-muted-foreground">+{summary.newEmployeesThisMonth.toLocaleString()} this month</p>
        </KpiCard>

        <KpiCard
          label="Engagement Rate"
          value={orDash(summary.engagementRate, (v) => `${v}%`)}
          icon={Activity}
          gradient="from-violet-500 to-purple-600"
          iconBg="from-violet-500/15 to-purple-600/15"
          iconColor="text-violet-600"
        >
          <p className="text-xs text-muted-foreground">{engagementSubtitle}</p>
        </KpiCard>

        <KpiCard
          label="Redemptions This Month"
          value={summary.redemptionsThisMonth.toLocaleString()}
          icon={ShoppingBag}
          gradient="from-amber-500 to-orange-600"
          iconBg="from-amber-500/15 to-orange-600/15"
          iconColor="text-amber-600"
        >
          {trend != null && (
            <p className={cn('text-xs font-medium', isPositiveTrend ? 'text-emerald-600' : 'text-rose-600')}>
              <span aria-hidden="true">{isPositiveTrend ? '▲' : '▼'}</span>{' '}
              <span className="sr-only">{isPositiveTrend ? 'Up' : 'Down'}</span>
              {Math.abs(trend)}% vs last month
            </p>
          )}
        </KpiCard>
      </div>

      {/* Action Queue Summary */}
      <Card className="overflow-hidden border-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-primary" />
                Action Queue
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Items waiting for your attention, organized by category
              </p>
            </div>
            <Link href="/admin/action-queue">
              <Button variant="outline" size="sm">
                View Queue
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {queueCards.map((card) => {
              const isUrgent = card.value > 0
              return (
                <Link key={card.title} href={card.href} className="group">
                  <div className={`relative h-full overflow-hidden rounded-xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${isUrgent ? 'border-amber-200/50 dark:border-amber-900/50' : ''}`}>
                    <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${card.gradient} opacity-60 transition-opacity group-hover:opacity-100`} />
                    <div className="flex items-start justify-between">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bg}`}>
                        <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                      </div>
                      {isUrgent && (
                        <Badge variant="pending" className="text-[9px] font-bold">
                          ACTION
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 space-y-0.5">
                      <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                      <p className="text-sm font-medium leading-tight">{card.title}</p>
                      <p className="text-[11px] text-muted-foreground">{card.subtitle}</p>
                    </div>
                    <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-primary" />
                  </div>
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Pending Approvals + Quick Stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden border-0 shadow-sm lg:col-span-2">
          <CardHeader className="border-b bg-muted/30 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Pending Approvals
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Latest items awaiting your decision
                </p>
              </div>
              <Link href="/admin/action-queue">
                <Button variant="outline" size="sm">
                  View All
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-2">
            <PendingApprovalsList items={pendingApprovals} />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-0 shadow-sm">
          <CardHeader className="border-b bg-muted/30 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              Platform Metrics
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Key performance indicators</p>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            <MetricRow
              icon={Euro}
              iconBg="bg-emerald-100 dark:bg-emerald-950/40"
              iconColor="text-emerald-600"
              label="Total Savings"
              value={orDash(summary.totalSavings, eurCompact.format)}
              sublabel="Delivered to employees"
            />
            <MetricRow
              icon={Tag}
              iconBg="bg-violet-100 dark:bg-violet-950/40"
              iconColor="text-violet-600"
              label="Avg Savings"
              value={orDash(summary.avgSavingsPerRedemption, eurExact.format)}
              sublabel="Per redemption"
            />
            <MetricRow
              icon={Repeat}
              iconBg="bg-sky-100 dark:bg-sky-950/40"
              iconColor="text-sky-600"
              label="Redemptions / Employee"
              value={orDash(summary.avgRedemptionsPerActiveEmployee, String)}
              sublabel="Active employees · 30 days"
            />
            <MetricRow
              icon={Store}
              iconBg="bg-blue-100 dark:bg-blue-950/40"
              iconColor="text-blue-600"
              label="Merchants"
              value={summary.activeMerchants ?? 0}
              sublabel={summary.pausedMerchants > 0 ? `${summary.pausedMerchants} paused` : 'Currently active'}
            />
            <MetricRow
              icon={Building2}
              iconBg="bg-amber-100 dark:bg-amber-950/40"
              iconColor="text-amber-600"
              label="Companies"
              value={summary.activeCompanies ?? 0}
              sublabel="Active subscriptions"
            />
            <div className="!mt-3 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-primary">Engagement Rate</p>
              </div>
              <p className="mt-1.5 text-2xl font-bold">{orDash(summary.engagementRate, (v) => `${v}%`)}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{engagementSubtitle}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="overflow-hidden border-0 shadow-sm">
        <CardHeader className="border-b bg-muted/30 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-emerald-600" />
                Recent Activity
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Latest actions across the platform
              </p>
            </div>
            <Link href="/admin/audit-logs">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {recentActivity.length > 0 ? (
            <div className="space-y-1">
              {recentActivity.map((item: any, idx: number) => (
                <div
                  key={item.id ?? idx}
                  className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-600 dark:from-emerald-950/40 dark:to-teal-950/40">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">{item.action}</span>{' '}
                      <span className="font-semibold">{item.user}</span>
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {item.time}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Activity className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-medium">No recent activity</p>
              <p className="mt-1 text-xs text-muted-foreground">Platform actions will appear here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon: Icon,
  gradient,
  iconBg,
  iconColor,
  children,
}: {
  label: string
  value: string
  icon: LucideIcon
  gradient: string
  iconBg: string
  iconColor: string
  children?: ReactNode
}) {
  return (
    <Card className="relative overflow-hidden border-0 shadow-sm">
      <div className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', gradient)} />
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {children}
          </div>
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br', iconBg)}>
            <Icon className={cn('h-6 w-6', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MetricRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sublabel,
}: {
  icon: any
  iconBg: string
  iconColor: string
  label: string
  value: string | number
  sublabel: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/30">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground/70">{sublabel}</p>
      </div>
      <p className="text-base font-bold tabular-nums">{value}</p>
    </div>
  )
}
