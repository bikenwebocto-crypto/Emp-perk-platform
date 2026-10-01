'use client'

import {
  Smartphone,
  RefreshCw,
  ImageIcon,
  ExternalLink,
  Sparkles,
  Star,
  FileText,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { OfferMobilePreview } from '@/components/merchant/offers/OfferMobilePreview'

export function OfferPreviewSection({ entity }: { entity: any }) {
  const pricingConfig = (entity?.pricing?.configuration as Record<string, unknown>) ?? {}
  const redemptionConfig = (entity?.redemption?.configuration as Record<string, unknown>) ?? {}
  const amount = pricingConfig.amount as number | string | undefined
  const percent = pricingConfig.percent as number | string | undefined
  const minimumSpend = pricingConfig.minimumSpend as number | string | undefined
  const discountValue =
    amount != null
      ? String(amount)
      : percent != null
        ? String(percent)
        : ''

  const imageUrls: string[] = Array.isArray(entity?.content?.imageUrls) ? entity.content.imageUrls : []
  const isReplacement = !!entity?.replacesOfferId || !!entity?.replacesOffer
  const titlePrefix = isReplacement ? 'Replacement: ' : ''
  const bannerImage = imageUrls[0] ?? ''

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Mobile preview — takes 2 columns */}
      <Card className="overflow-hidden border-0 shadow-sm lg:col-span-2">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500" />
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                <Smartphone className="h-4 w-4" />
              </div>
              Mobile Preview
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              How employees will see this offer
            </p>
          </div>
          {isReplacement && (
            <Badge variant="pending" className="gap-1">
              <RefreshCw className="h-3 w-3" />
              Replacement
            </Badge>
          )}
        </CardHeader>
        <CardContent className="bg-gradient-to-br from-background via-muted/20 to-muted/40 p-6">
          <div className="flex justify-center">
            <OfferMobilePreview
              title={`${titlePrefix}${entity?.title ?? ''}`}
              shortDescription={entity?.content?.shortDescription ?? ''}
              description={entity?.content?.description ?? ''}
              discountValue={discountValue}
              offerType={entity?.offerType ?? ''}
              startDate={entity?.startDate ?? ''}
              endDate={entity?.endDate ?? ''}
              imageUrls={imageUrls}
              isFeatured={!!entity?.isFeatured}
              isExclusive={!!entity?.isExclusive}
              merchantName={entity?.merchant?.businessName ?? 'Merchant'}
              categoryName={undefined}
              redemptionType={entity?.redemption?.redemptionType ?? undefined}
              minSpend={minimumSpend != null ? String(minimumSpend) : undefined}
            />
          </div>
        </CardContent>
      </Card>

      {/* Banner review — takes 3 columns */}
      <Card className="overflow-hidden border-0 shadow-sm lg:col-span-3">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white">
                <ImageIcon className="h-4 w-4" />
              </div>
              Banner & Design Review
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Inspect the banner image, copy, and visual presentation
            </p>
          </div>
          {imageUrls.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <ImageIcon className="h-3 w-3" />
              {imageUrls.length} {imageUrls.length === 1 ? 'image' : 'images'}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          {/* Main banner display */}
          {bannerImage ? (
            <div className="space-y-3">
              <div className="group relative overflow-hidden rounded-xl border-2 bg-muted shadow-sm">
                <div className="aspect-[16/9] w-full">
                  <img
                    src={bannerImage}
                    alt="Offer banner"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                {/* Discount overlay mimicking the actual offer presentation */}
                {(() => {
                  const ot = entity?.offerType
                  const cfg = (entity?.pricing?.configuration as Record<string, unknown>) ?? {}
                  const pct = cfg.percent as number | undefined
                  const amt = cfg.amount as number | undefined
                  let displayText = ''
                  let displaySuffix = 'OFF'
                  if (ot === 'PERCENTAGE' || ot === 'percentage') {
                    displayText = `${pct ?? amt ?? 0}%`
                  } else if (ot === 'BUY_X_GET_Y' || ot === 'buy_x_get_y') {
                    displayText = 'BOGO'
                    displaySuffix = 'FREE'
                  } else {
                    displayText = `€${Number(amt ?? 0).toFixed(0)}`
                  }
                  return displayText ? (
                    <div className="absolute right-3 top-3 flex flex-col items-center justify-center rounded-2xl bg-white px-4 py-2 shadow-xl">
                      <span className="text-2xl font-black leading-none tracking-tight text-foreground">
                        {displayText}
                      </span>
                      <span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {displaySuffix}
                      </span>
                    </div>
                  ) : null
                })()}
                {/* Featured/Exclusive overlay */}
                {(entity?.isFeatured || entity?.isExclusive) && (
                  <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                    {entity.isFeatured && (
                      <div className="flex items-center gap-1 rounded-full bg-amber-500/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur-sm">
                        <Star className="h-2.5 w-2.5 fill-white" />
                        Featured
                      </div>
                    )}
                    {entity.isExclusive && (
                      <div className="flex items-center gap-1 rounded-full bg-violet-500/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur-sm">
                        <Sparkles className="h-2.5 w-2.5" />
                        Exclusive
                      </div>
                    )}
                  </div>
                )}
                <div className="absolute bottom-3 right-3">
                  <a
                    href={bannerImage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/80"
                  >
                    View full size
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">No banner image uploaded</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The merchant has not provided a banner image for this offer
              </p>
            </div>
          )}

          {/* Additional gallery images */}
          {imageUrls.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Additional Images
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {imageUrls.slice(1).map((url: string, i: number) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square overflow-hidden rounded-lg border bg-muted transition-transform hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <img
                      src={url}
                      alt={`Offer image ${i + 2}`}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                      {i + 2}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Copy review */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="h-3 w-3" />
              Copy Review
            </p>
            <div>
              <p className="text-[10px] font-medium text-muted-foreground">Title</p>
              <p className="text-sm font-semibold">{entity?.title ?? '—'}</p>
            </div>
            {entity?.content?.shortDescription && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">Short Description</p>
                <p className="text-sm">{entity.content.shortDescription}</p>
              </div>
            )}
            {entity?.content?.description && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground">Description</p>
                <p className="text-sm leading-relaxed">{entity.content.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}