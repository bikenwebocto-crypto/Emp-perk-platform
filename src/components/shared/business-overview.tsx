'use client'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ShoppingBag,
  TrendingUp,
  Gauge,
  CalendarClock,
  Sparkles,
  AlertCircle,
  Clock,
  Award,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatMaxOfferCost } from '@/lib/merchant-performance-utils'
import type { MerchantBusinessOverview } from '@/lib/merchant-performance'

function formatCurrency(n: number) {
  return `€${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
}

function formatDateRange(startIso: string, endIso: string) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(startIso)} – ${fmt(endIso)}`
}

async function fetchOverview(url: string): Promise<MerchantBusinessOverview> {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to load business overview')
  return json.data
}

/**
 * Business Overview — four metric groups (Redemptions & Revenue, Offer
 * Capacity, Offer Expiry, Banner Bookings) rendered as separate cards.
 * Fetches from the dedicated business-overview endpoint (scoped by
 * surface) so the base profile/detail routes stay lean.
 */
export function BusinessOverview({
  merchantId,
  scope,
}: {
  merchantId: string
  scope: 'merchant' | 'admin'
}) {
  const url =
    scope === 'merchant'
      ? '/api/merchant/profile/business-overview'
      : `/api/admin/merchants/${merchantId}/business-overview`

  const { data, isLoading, error } = useQuery({
    queryKey: ['merchant-business-overview', merchantId, scope],
    queryFn: () => fetchOverview(url),
    retry: false,
  })

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-44" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <AlertCircle className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="text-sm font-medium">Business overview unavailable</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'Failed to load metrics.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  const { redemptions, topOffers, offerCapacity, expiry, banners } = data
  const hasDrift = offerCapacity.offers.some((o) => o.drift)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ─── Group A: Redemptions & Revenue ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
            Redemptions &amp; Revenue
          </CardTitle>
          <CardDescription>All-time performance across your offers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Total</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{redemptions.total}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">This Week</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{redemptions.thisWeek}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">This Month</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{redemptions.thisMonth}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Savings Driven</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">
                {formatCurrency(redemptions.totalSavings)}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Award className="h-3.5 w-3.5" /> Top Performing Offers
            </p>
            {topOffers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No redemptions yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {topOffers.map((o, i) => (
                  <li
                    key={o.offerId}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <strong className="mr-1">#{i + 1}</strong> {o.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {o.redemptions} redemptions · {formatCurrency(o.totalSavings)} saved
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Group B: Offer Capacity ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <Gauge className="h-3.5 w-3.5" />
            </div>
            Offer Capacity
          </CardTitle>
          <CardDescription>
            Redemption limits across your {offerCapacity.offers.length} live offer
            {offerCapacity.offers.length === 1 ? '' : 's'} · Max exposure{' '}
            {formatMaxOfferCost(offerCapacity.maxOfferCost)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {offerCapacity.offers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No live offers.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Offer</th>
                    <th className="pb-2 pr-3 text-right font-medium">Redeemed / Max</th>
                    <th className="pb-2 pr-3 text-right font-medium">Remaining</th>
                    <th className="pb-2 font-medium">Used</th>
                  </tr>
                </thead>
                <tbody>
                  {offerCapacity.offers.map((o) => (
                    <tr key={o.id} className="border-b border-border/50 last:border-0">
                      <td className="max-w-[180px] truncate py-2 pr-3">
                        {o.title}
                        {o.drift && (
                          <span
                            className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            title="Capacity and legacy counters differ for this offer — review before relying on these numbers."
                          >
                            drift
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {o.redeemed} / {o.maxRedemptions ?? '∞'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {o.remaining ?? 'Unlimited'}
                      </td>
                      <td className="py-2">
                        {o.percentUsed != null ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  o.percentUsed >= 100
                                    ? 'bg-red-500'
                                    : o.percentUsed >= 80
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500',
                                )}
                                style={{ width: `${Math.min(100, o.percentUsed)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {o.percentUsed}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hasDrift && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Flagged offers have mismatched values between the capacity tracker and the
                  legacy counter — treat their numbers as indicative.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Group C: Offer Expiry ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <CalendarClock className="h-3.5 w-3.5" />
            </div>
            Offer Expiry
          </CardTitle>
          <CardDescription>Renew or replace before offers lapse</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Expiring in the next 7 days
            </p>
            {expiry.expiringSoon.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No live offers expiring in the next 7 days.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {expiry.expiringSoon.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{o.title}</span>
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 text-xs font-medium',
                        o.daysRemaining <= 2 ? 'text-red-600' : 'text-amber-600',
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {o.daysRemaining === 0 ? 'Expires today' : `${o.daysRemaining} day${o.daysRemaining === 1 ? '' : 's'} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Expired offers (all time)</p>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold tabular-nums">
              {expiry.expiredCount}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ─── Group D: Banner Bookings ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            Banner Bookings
          </CardTitle>
          <CardDescription>Sponsored slot performance and spend</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Active</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{banners.active.length}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Pending Approval</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">{banners.pendingCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">Total Spent</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums">
                {formatCurrency(banners.totalSpent)}
              </p>
            </div>
          </div>

          {banners.active.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Active slots</p>
              <ul className="space-y-1.5">
                {banners.active.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.bannerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.position.replace(/_/g, ' ')} · {formatDateRange(b.startDate, b.endDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {b.expiringSoon && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Ends soon
                        </span>
                      )}
                      <span className="text-xs font-medium tabular-nums">
                        {formatCurrency(b.totalPrice)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {banners.upcoming.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Upcoming</p>
              <ul className="space-y-1.5">
                {banners.upcoming.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-md border p-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {b.bannerName}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({b.position.replace(/_/g, ' ')})
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Starts {new Date(b.startDate).toLocaleDateString('en-GB')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {banners.active.length === 0 &&
            banners.upcoming.length === 0 &&
            banners.pendingCount === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <ShoppingBag className="h-5 w-5 text-muted-foreground/60" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">No banner bookings yet.</p>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  )
}
