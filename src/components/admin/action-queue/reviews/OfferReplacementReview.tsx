'use client'

import { ArrowDown, Tag, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Badge } from '@/components/ui/badge'
import type { ReviewComponentProps } from './types'

function getPricingConfig(offer: any): Record<string, unknown> {
  return (offer?.pricing?.configuration as Record<string, unknown>) ?? {}
}

function getRedemptionConfig(offer: any): Record<string, unknown> {
  return (offer?.redemption?.configuration as Record<string, unknown>) ?? {}
}

function formatDiscount(offer: any): string {
  const config = getPricingConfig(offer)
  const percent = config?.percent as number | undefined
  const amount = config?.amount as number | undefined
  if (percent) return `${percent}% OFF`
  if (amount) return `€${Number(amount).toFixed(2)} OFF`
  return 'N/A'
}

function formatDate(d?: string | Date | null) {
  if (!d) return 'N/A'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function imagesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const aJson = JSON.stringify([...(a ?? [])].sort())
  const bJson = JSON.stringify([...(b ?? [])].sort())
  return aJson === bJson
}

function arraysEqual(a: any, b: any): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}

interface FieldRow {
  key: string
  label: string
  current: any
  next: any
  changed: boolean
  render?: (v: any) => string
}

function FieldDiffRow({ row }: { row: FieldRow }) {
  return (
    <div
      className={`grid grid-cols-2 gap-2 rounded-md border p-2 text-sm ${
        row.changed
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
          : 'border-transparent'
      }`}
    >
      <div>
        <p className="text-xs uppercase text-muted-foreground">{row.label}</p>
        <p className="text-sm">
          {row.render ? row.render(row.current) : row.current ?? '—'}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase text-muted-foreground">Replacement</p>
        <p className={row.changed ? 'font-semibold text-primary' : 'text-sm'}>
          {row.render ? row.render(row.next) : row.next ?? '—'}
        </p>
        {row.changed && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" /> Changed
          </span>
        )}
      </div>
    </div>
  )
}

function CompareTable({ current, next }: { current: any; next: any }) {
  if (!current || !next) return null

  const currentConfig = getPricingConfig(current)
  const nextConfig = getPricingConfig(next)
  const currentRedemptionConfig = getRedemptionConfig(current)
  const nextRedemptionConfig = getRedemptionConfig(next)

  const rows: FieldRow[] = [
    {
      key: 'title',
      label: 'Title',
      current: current.title,
      next: next.title,
      changed: current.title !== next.title,
    },
    {
      key: 'description',
      label: 'Description',
      current: current.content?.description,
      next: next.content?.description,
      changed: (current.content?.description ?? '') !== (next.content?.description ?? ''),
    },
    {
      key: 'categoryId',
      label: 'Category',
      current: current.categoryId,
      next: next.categoryId,
      changed: current.categoryId !== next.categoryId,
    },
    {
      key: 'discount',
      label: 'Discount',
      current: current,
      next: next,
      changed:
        Number(currentConfig.amount ?? 0) !== Number(nextConfig.amount ?? 0) ||
        Number(currentConfig.percent ?? 0) !== Number(nextConfig.percent ?? 0) ||
        Number(currentConfig.maximumDiscount ?? 0) !== Number(nextConfig.maximumDiscount ?? 0) ||
        Number(currentConfig.minimumSpend ?? 0) !== Number(nextConfig.minimumSpend ?? 0),
      render: (o: any) => formatDiscount(o),
    },
    {
      key: 'redemptionCode',
      label: 'Promo Code',
      current: currentRedemptionConfig.code,
      next: nextRedemptionConfig.code,
      changed: (currentRedemptionConfig.code ?? '') !== (nextRedemptionConfig.code ?? ''),
    },
    {
      key: 'redemptionInstructions',
      label: 'Redemption Instructions',
      current: currentRedemptionConfig.instructions,
      next: nextRedemptionConfig.instructions,
      changed:
        (currentRedemptionConfig.instructions ?? '') !==
        (nextRedemptionConfig.instructions ?? ''),
    },
    {
      key: 'terms',
      label: 'Terms & Conditions',
      current: current.content?.termsAndConditions,
      next: next.content?.termsAndConditions,
      changed:
        (current.content?.termsAndConditions ?? '') !== (next.content?.termsAndConditions ?? ''),
    },
    {
      key: 'images',
      label: 'Images',
      current: current.content?.imageUrls,
      next: next.content?.imageUrls,
      changed: !imagesEqual(current.content?.imageUrls, next.content?.imageUrls),
      render: (v: string[]) =>
        (v ?? []).length > 0 ? `${v.length} image(s)` : 'None',
    },
    {
      key: 'daysOfWeek',
      label: 'Days of Week',
      current: current.redemption?.daysOfWeek,
      next: next.redemption?.daysOfWeek,
      changed: !arraysEqual(current.redemption?.daysOfWeek, next.redemption?.daysOfWeek),
      render: (v: any) => {
        if (!Array.isArray(v)) return '—'
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        return v
          .slice()
          .sort()
          .map((d: number) => days[d] ?? `D${d}`)
          .join(', ')
      },
    },
    {
      key: 'startDate',
      label: 'Start Date',
      current: current.startDate,
      next: next.startDate,
      changed:
        new Date(current.startDate).getTime() !==
        new Date(next.startDate).getTime(),
      render: (v: any) => formatDate(v),
    },
    {
      key: 'endDate',
      label: 'End Date',
      current: current.endDate,
      next: next.endDate,
      changed:
        new Date(current.endDate).getTime() !==
        new Date(next.endDate).getTime(),
      render: (v: any) => formatDate(v),
    },
    {
      key: 'maxRedemptions',
      label: 'Max Redemptions',
      current: current.capacity?.maxRedemptions,
      next: next.capacity?.maxRedemptions,
      changed: (current.capacity?.maxRedemptions ?? 0) !== (next.capacity?.maxRedemptions ?? 0),
    },
  ]

  const changedCount = rows.filter((r) => r.changed).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Side-by-Side Comparison</span>
          {changedCount > 0 && (
            <Badge variant="secondary">
              {changedCount} field{changedCount === 1 ? '' : 's'} changed
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <FieldDiffRow key={row.key} row={row} />
        ))}
      </CardContent>
    </Card>
  )
}

function OfferSummary({ offer, label, accent }: { offer: any; label: string; accent?: boolean }) {
  if (!offer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not available</p>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className={accent ? 'border-primary/30' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{offer.title}</p>
          <StatusBadge status={offer.status} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/30 p-2">
            <p className="text-xs text-muted-foreground">Discount</p>
            <p className="font-semibold text-primary">{formatDiscount(offer)}</p>
          </div>
          <div className="rounded-md bg-muted/30 p-2">
            <p className="text-xs text-muted-foreground">Type</p>
            <p className="font-medium capitalize">{offer.offerType?.replace(/_/g, ' ') ?? 'N/A'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDate(offer.startDate)} → {formatDate(offer.endDate)}
        </div>
        {offer.content?.description && (
          <p className="line-clamp-3 text-xs text-muted-foreground">{offer.content.description}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function OfferReplacementReview({ entity, queueItem }: ReviewComponentProps) {
  const meta = (queueItem?.metadata as any) ?? {}
  const currentOffer = entity?.currentOffer ?? entity?.replacesOffer ?? null
  const newOffer = entity

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Replacement Flow</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Approving this request will <strong>archive</strong> the current
            live offer and promote the new offer to <strong>LIVE</strong>.
            The merchant will end up with exactly one LIVE offer.
          </p>
          <p className="mt-1">
            Rejecting keeps the current offer LIVE and marks the replacement as
            REJECTED. Requesting changes keeps the current offer LIVE and sets
            the replacement to <code>CHANGES_REQUESTED</code> for the merchant
            to edit and resubmit.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <OfferSummary offer={currentOffer} label="Current Live Offer" />
        <div>
          <div className="mb-2 flex justify-center">
            <ArrowDown className="h-5 w-5 text-primary" />
          </div>
          <OfferSummary offer={newOffer} label="Proposed Replacement" accent />
        </div>
      </div>

      <CompareTable current={currentOffer} next={newOffer} />

      {(meta.reason || meta.replacementReason) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Replacement Reason</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{meta.reason ?? meta.replacementReason}</p>
          </CardContent>
        </Card>
      )}

      {newOffer?.review?.reviewNotes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-amber-600" />
              Previous admin notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{newOffer.review.reviewNotes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export const offerReplacementEditableFields = [
  { key: 'title', label: 'New Offer Title' },
  { key: 'shortDescription', label: 'Short Description' },
  { key: 'description', label: 'Description' },
  { key: 'termsAndConditions', label: 'Terms & Conditions' },
  { key: 'discountValue', label: 'Discount Value ($)' },
  { key: 'discountPercent', label: 'Discount Percent (%)' },
  { key: 'minimumSpend', label: 'Minimum Spend ($)' },
  { key: 'maxRedemptions', label: 'Max Redemptions' },
]
