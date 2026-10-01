'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmployeeLayout } from '@/components/employee/EmployeeLayout'
import { OfferCard } from '@/components/employee/OfferCard'
import { RedeemModal } from '@/components/employee/RedeemModal'
import {
  type EmployeeOffer,
  findOfferInList,
} from '@/components/employee/offers/employee-offer'
import { ShoppingBag, TrendingUp, Gift, Bookmark, ChevronRight, Search, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface Stats {
  redemptions: { allTime: number; today: number; thisWeek: number; thisMonth: number }
  totalSavings: number
  savedOffers: number
  activeOffers: number
}

interface OffersResponse {
  data: EmployeeOffer[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

const FEATURED_QUERY_KEY = ['employee-offers', 'featured'] as const

async function fetchStats(): Promise<{ data: Stats }> {
  const res = await fetch('/api/employee/dashboard/stats')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
  return json
}

async function fetchFeaturedOffers(): Promise<OffersResponse> {
  const res = await fetch('/api/employee/offers?pageSize=6&featured=true')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load')
  return json
}

export default function EmployeeHomePage() {
  const [search, setSearch] = useState('')
  // The dialog always reflects the current cache value so Save /
  // Redeem patches from the action components flow in instantly.
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['employee-dashboard-stats'],
    queryFn: fetchStats,
    retry: false,
  })
  const { data: offers, isLoading: offersLoading } = useQuery({
    queryKey: FEATURED_QUERY_KEY,
    queryFn: fetchFeaturedOffers,
    retry: false,
  })

  const selectedOffer = useMemo<EmployeeOffer | null>(() => {
    if (!selectedOfferId) return null
    const cached = queryClient.getQueryData<OffersResponse>(FEATURED_QUERY_KEY)
    const fromCache = cached
      ? findOfferInList(cached.data, selectedOfferId)?.offer
      : undefined
    return (
      fromCache ??
      offers?.data?.find((o) => o.id === selectedOfferId) ??
      null
    )
  }, [selectedOfferId, offers, queryClient])

  // Detect the COMPANY_INACTIVE response from the API. The stats
  // endpoint rejects with 403 + code COMPANY_INACTIVE when the
  // employee's company is paused/suspended/cancelled.
  const companyInactive =
    (statsError as unknown as { message?: string })?.message?.includes('COMPANY_INACTIVE') ||
    (stats as unknown as { error?: { code?: string } })?.error?.code === 'COMPANY_INACTIVE'

  return (
    <EmployeeLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Available Offers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discover and redeem exclusive offers from local merchants
          </p>
        </div>

        {companyInactive && (
          <div className="flex items-start gap-3 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Your company&apos;s access is currently inactive.</p>
              <p className="mt-1 text-xs">
                Please contact your company administrator to restore access. You can still
                view your profile and settings, but offers and redemptions are disabled.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="My Redemptions"
            value={stats?.data.redemptions.allTime ?? 0}
            subtitle={stats ? `${stats.data.redemptions.thisWeek} this week` : ''}
            icon={ShoppingBag}
            color="text-blue-600"
            loading={statsLoading}
          />
          <StatCard
            title="Total Saved"
            value={stats ? `€${stats.data.totalSavings.toFixed(2)}` : '€0.00'}
            subtitle={stats ? `${stats.data.redemptions.thisMonth} this month` : ''}
            icon={TrendingUp}
            color="text-green-600"
            loading={statsLoading}
          />
          <StatCard
            title="Active Offers"
            value={stats?.data.activeOffers ?? 0}
            subtitle="Live right now"
            icon={Gift}
            color="text-purple-600"
            loading={statsLoading}
          />
          <StatCard
            title="Saved Offers"
            value={stats?.data.savedOffers ?? 0}
            subtitle="Bookmarked"
            icon={Bookmark}
            color="text-amber-600"
            loading={statsLoading}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg">
              <span>Featured Offers</span>
              <Link href="/employee/offers">
                <Button variant="ghost" size="sm">
                  View all <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {offersLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-56" />
                <Skeleton className="h-56" />
                <Skeleton className="h-56" />
              </div>
            ) : !offers?.data || offers.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offers available right now.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {offers.data.map((o) => (
                  <OfferCard
                    key={o.id}
                    offer={o}
                    onOpen={(offer) => setSelectedOfferId(offer.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RedeemModal
        offer={selectedOffer}
        open={!!selectedOffer}
        onOpenChange={(o) => {
          if (!o) setSelectedOfferId(null)
        }}
      />
    </EmployeeLayout>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  loading,
}: {
  title: string
  value: number | string
  subtitle: string
  icon: React.ElementType
  color: string
  loading?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="mt-1 h-5 w-16" />
          ) : (
            <p className="text-xl font-bold">{value}</p>
          )}
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
