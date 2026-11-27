'use client'

import { Building2, Tag, Clock, MapPin, Mail, FileText, Percent } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { ReviewComponentProps } from './types'

function formatDiscount(offer: any): string {
  const config = offer.pricing?.configuration as Record<string, unknown> | undefined
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

const CHANNEL_LABEL: Record<string, string> = {
  IN_STORE: 'In-store',
  ONLINE: 'Online',
  BOTH: 'Both (Online + In-store)',
}

const TYPE_LABEL: Record<string, string> = {
  ONLINE_CODE: 'Online code',
  VIRTUAL_CARD_AUTO_VERIFY: 'In-store card',
  BOOKING_LINK: 'Booking link',
  IN_STORE_QR: 'In-store QR',
}

function RedemptionDetails({ offer }: { offer: any }) {
  const redemption = offer.redemption
  if (!redemption) return null
  const cfg = (redemption.configuration ?? {}) as Record<string, any>
  const channel: string | undefined = offer.redemptionChannel ?? cfg.channel
  const types: string[] =
    Array.isArray(redemption.redemptionTypes) && redemption.redemptionTypes.length > 0
      ? redemption.redemptionTypes
      : redemption.redemptionType
        ? [redemption.redemptionType]
        : []
  const hasOnline = channel ? channel !== 'IN_STORE' : types.includes('ONLINE_CODE')
  const hasInStore = channel ? channel !== 'ONLINE' : types.includes('VIRTUAL_CARD_AUTO_VERIFY')
  const online = (cfg.online ?? cfg) as Record<string, any>
  const branches: any[] = offer.redemptionBranches ?? []

  return (
    <div className="space-y-3 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">Redemption</p>
        {channel && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {CHANNEL_LABEL[channel] ?? channel}
          </span>
        )}
        {types.map((t) => (
          <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {TYPE_LABEL[t] ?? t}
          </span>
        ))}
      </div>

      <div className={`grid gap-3 ${hasOnline && hasInStore ? 'sm:grid-cols-2' : ''}`}>
        {hasOnline && (
          <div className="rounded-md bg-muted/30 p-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Online</p>
            <p><span className="text-muted-foreground">Code: </span><span className="font-mono">{online.code || '—'}</span></p>
            <p className="break-all">
              <span className="text-muted-foreground">Website: </span>
              {online.bookingUrl ? (
                <a href={online.bookingUrl} target="_blank" rel="noreferrer" className="text-primary underline">{online.bookingUrl}</a>
              ) : '—'}
            </p>
            {online.instructions && <p className="text-xs text-muted-foreground">{online.instructions}</p>}
          </div>
        )}
        {hasInStore && (
          <div className="rounded-md bg-muted/30 p-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              In-store card {offer.redemptionAllBranches ? '· all branches' : `· ${branches.length} selected branch${branches.length === 1 ? '' : 'es'}`}
            </p>
            {branches.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active in-store branches</p>
            ) : (
              <ul className="space-y-1">
                {branches.map((b) => (
                  <li key={b.id} className="text-xs">
                    <span className="font-medium">{b.name}</span>
                    {!b.isActive && <span className="ml-1 text-destructive">(inactive)</span>}
                    <span className="block text-muted-foreground">
                      {[b.addressLine1, b.addressLine2, b.city, b.postalCode].filter(Boolean).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function OfferReview({ entity }: ReviewComponentProps) {
  if (!entity) return null

  const pricingConfig = (entity.pricing?.configuration as Record<string, unknown> | undefined) ?? {}
  const review = entity.review
  const content = entity.content

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tag className="h-5 w-5" />
            Offer Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xl font-semibold">{entity.title}</p>
              {content?.shortDescription && (
                <p className="text-sm text-muted-foreground">{content.shortDescription}</p>
              )}
            </div>
            <StatusBadge status={entity.status} />
          </div>

          {content?.description && (
            <p className="text-sm text-muted-foreground">{content.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-md bg-muted/30 p-2">
              <p className="text-xs text-muted-foreground">Discount</p>
              <p className="font-semibold text-primary">{formatDiscount(entity)}</p>
            </div>
            {pricingConfig.minimumSpend != null && Number(pricingConfig.minimumSpend) > 0 && (
              <div className="rounded-md bg-muted/30 p-2">
                <p className="text-xs text-muted-foreground">Min. Spend</p>
                <p className="font-medium">€{Number(pricingConfig.minimumSpend).toFixed(2)}</p>
              </div>
            )}
            <div className="rounded-md bg-muted/30 p-2">
              <p className="text-xs text-muted-foreground">Offer Type</p>
              <p className="font-medium capitalize">{entity.offerType?.replace(/_/g, ' ') ?? 'N/A'}</p>
            </div>
            <div className="rounded-md bg-muted/30 p-2">
              <p className="text-xs text-muted-foreground">Max Redemptions</p>
              <p className="font-medium">{entity.capacity?.maxRedemptions ?? 'Unlimited'}</p>
            </div>
            {pricingConfig.maximumDiscount != null && Number(pricingConfig.maximumDiscount) > 0 && (
              <div className="rounded-md bg-muted/30 p-2">
                <p className="text-xs text-muted-foreground">Max Discount</p>
                <p className="font-medium">€{Number(pricingConfig.maximumDiscount).toFixed(2)}</p>
              </div>
            )}
            <div className="rounded-md bg-muted/30 p-2">
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="font-medium">{entity.capacity?.redeemedCount ?? 0}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(entity.startDate)} → {formatDate(entity.endDate)}</span>
            </div>
            {entity.isFeatured && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Featured</span>
            )}
            {entity.isExclusive && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Exclusive</span>
            )}
          </div>

          <RedemptionDetails offer={entity} />

          {content?.termsAndConditions && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <FileText className="h-3 w-3" /> Terms & Conditions
              </p>
              <p className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                {content.termsAndConditions}
              </p>
            </div>
          )}

          {review?.submissionNotes && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Merchant Submission Notes</p>
              <p className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                {review.submissionNotes}
              </p>
            </div>
          )}

          {review?.rejectionReason && (
            <div className="rounded-md bg-destructive/10 p-2 text-xs">
              <p className="font-medium text-destructive">Previous Rejection</p>
              <p className="text-muted-foreground">{review.rejectionReason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Merchant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {entity.merchant ? (
            <>
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{(entity.merchant.businessName ?? '?').charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{entity.merchant.businessName}</p>
                  <StatusBadge status={entity.merchant.status} />
                </div>
              </div>
              {entity.merchant.email && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="h-3 w-3" /> {entity.merchant.email}
                </div>
              )}
              {entity.merchant.city && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {entity.merchant.city}
                  {entity.merchant.state ? `, ${entity.merchant.state}` : ''}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Merchant not available</p>
          )}
          <div className="rounded-md bg-muted/30 p-2 text-xs">
            <p className="font-medium">Approval Rules</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              <li className="flex items-center gap-1"><Percent className="h-3 w-3" /> offer.status → LIVE</li>
              <li className="flex items-center gap-1"><Percent className="h-3 w-3" /> merchant.status → ACTIVE</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export const offerEditableFields = [
  { key: 'title', label: 'Title' },
  { key: 'shortDescription', label: 'Short Description' },
  { key: 'description', label: 'Description' },
  { key: 'termsAndConditions', label: 'Terms & Conditions' },
  { key: 'discountValue', label: 'Discount Value ($)' },
  { key: 'discountPercent', label: 'Discount Percent (%)' },
  { key: 'minimumSpend', label: 'Minimum Spend ($)' },
  { key: 'maxRedemptions', label: 'Max Redemptions' },
]
