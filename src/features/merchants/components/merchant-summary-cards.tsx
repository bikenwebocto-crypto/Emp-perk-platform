'use client'
import {
  Store,
  Clock,
  Star,
  Home,
  Package,
  TrendingUp,
  Receipt,
  Activity,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { MerchantDashboardSummary } from '@/types'

interface SummaryCardsProps {
  summary?: MerchantDashboardSummary
  isLoading?: boolean
}

interface CardSpec {
  key: keyof MerchantDashboardSummary
  label: string
  icon: any
  gradient: string
  bg: string
  iconColor: string
  href?: string
  formatter?: (v: number) => string
  sublabel?: () => string
}

// First day of the current month in Cyprus time, e.g. "Since 1 Sept"
function sinceStartOfMonth(): string {
  const month = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    timeZone: 'Europe/Nicosia',
  }).format(new Date())
  return `Since 1 ${month}`
}

const SPECS: CardSpec[] = [
  {
    key: 'totalMerchants',
    label: 'Total Merchants',
    icon: Store,
    gradient: 'from-blue-500 to-indigo-600',
    bg: 'bg-blue-100 dark:bg-blue-950/40',
    iconColor: 'text-blue-600',
  },
  {
    key: 'pendingApproval',
    label: 'Pending Approval',
    icon: Clock,
    gradient: 'from-amber-500 to-orange-600',
    bg: 'bg-amber-100 dark:bg-amber-950/40',
    iconColor: 'text-amber-600',
  },
  {
    key: 'featured',
    label: 'Featured',
    icon: Star,
    gradient: 'from-yellow-500 to-amber-600',
    bg: 'bg-yellow-100 dark:bg-yellow-950/40',
    iconColor: 'text-yellow-600',
  },
  {
    key: 'homepageMerchants',
    label: 'Homepage',
    icon: Home,
    gradient: 'from-pink-500 to-rose-600',
    bg: 'bg-pink-100 dark:bg-pink-950/40',
    iconColor: 'text-pink-600',
  },
  {
    key: 'liveOffers',
    label: 'Live Offers',
    icon: Package,
    gradient: 'from-emerald-500 to-teal-600',
    bg: 'bg-emerald-100 dark:bg-emerald-950/40',
    iconColor: 'text-emerald-600',
  },
  {
    key: 'pendingOffers',
    label: 'Pending Offers',
    icon: TrendingUp,
    gradient: 'from-violet-500 to-purple-600',
    bg: 'bg-violet-100 dark:bg-violet-950/40',
    iconColor: 'text-violet-600',
  },
  {
    key: 'todaysRedemptions',
    label: 'Today Redemptions',
    icon: Activity,
    gradient: 'from-cyan-500 to-blue-600',
    bg: 'bg-cyan-100 dark:bg-cyan-950/40',
    iconColor: 'text-cyan-600',
  },
  {
    key: 'thisMonthRedemptions',
    label: 'Redemptions This Month',
    sublabel: sinceStartOfMonth,
    icon: Activity,
    gradient: 'from-rose-500 to-red-600',
    bg: 'bg-rose-100 dark:bg-rose-950/40',
    iconColor: 'text-rose-600',
  },
]

export function MerchantSummaryCards({ summary, isLoading }: SummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {SPECS.map((s) => (
          <Skeleton key={s.key} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      {SPECS.map((spec) => {
        const value = summary?.[spec.key] ?? 0
        const Icon = spec.icon
        const formatted = spec.formatter ? spec.formatter(value) : value.toLocaleString()
        const isAlert = spec.key === 'pendingApproval' && value > 0
        return (
          <Card
            key={spec.key}
            className="relative overflow-hidden border-0 shadow-sm"
          >
            <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${spec.gradient}`} />
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground">{spec.label}</p>
                  <p className="text-2xl font-bold tracking-tight tabular-nums">{formatted}</p>
                  {spec.sublabel && (
                    <p className="text-[10px] text-muted-foreground">{spec.sublabel()}</p>
                  )}
                </div>
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${spec.bg}`}>
                  <Icon className={`h-4 w-4 ${spec.iconColor}`} />
                </div>
              </div>
              {isAlert && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-amber-600">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                  </span>
                  Needs attention
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
