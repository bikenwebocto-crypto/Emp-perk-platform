'use client'
import { Gift, Clock, Tag, Star, Sparkles, MapPin, Store, Zap, Flame, BadgeCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface OfferMobilePreviewProps {
  title: string
  shortDescription: string
  description: string
  discountValue: string
  offerType: string
  startDate: string
  endDate: string
  imageUrls: string[]
  isFeatured: boolean
  isExclusive: boolean
  merchantName?: string
  categoryName?: string
  redemptionType?: string
  minSpend?: string
}

const offerTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  FLAT: { label: 'Flat Amount', icon: Tag, color: 'from-blue-500 to-indigo-600' },
  flat_rate: { label: 'Flat Rate', icon: Tag, color: 'from-blue-500 to-indigo-600' },
  fixed_amount: { label: 'Fixed Amount', icon: Tag, color: 'from-blue-500 to-indigo-600' },
  PERCENTAGE: { label: 'Percentage', icon: Zap, color: 'from-violet-500 to-purple-600' },
  percentage: { label: 'Percentage', icon: Zap, color: 'from-violet-500 to-purple-600' },
  BUY_X_GET_Y: { label: 'Buy X Get Y', icon: Flame, color: 'from-pink-500 to-rose-600' },
  buy_x_get_y: { label: 'Buy X Get Y', icon: Flame, color: 'from-pink-500 to-rose-600' },
}

const redemptionTypeConfig: Record<string, { label: string; bg: string }> = {
  IN_STORE_QR: { label: 'In-Store', bg: 'bg-amber-100 text-amber-800 border-amber-200' },
  ONLINE_CODE: { label: 'Online', bg: 'bg-sky-100 text-sky-800 border-sky-200' },
  BOOKING_LINK: { label: 'Booking', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  VIRTUAL_CARD_AUTO_VERIFY: { label: 'Virtual Card', bg: 'bg-violet-100 text-violet-800 border-violet-200' },
}

export function OfferMobilePreview({
  title,
  shortDescription,
  description,
  discountValue,
  offerType,
  startDate,
  endDate,
  imageUrls,
  isFeatured,
  isExclusive,
  merchantName,
  categoryName,
  redemptionType,
  minSpend,
}: OfferMobilePreviewProps) {
  const bannerImage = imageUrls.length > 0 ? imageUrls[0] : ''
  const typeConfig = (offerTypeConfig[offerType] ?? offerTypeConfig.FLAT)!
  const TypeIcon = typeConfig.icon
  const redemptionCfg = redemptionType ? redemptionTypeConfig[redemptionType] : null

  const formatDate = (d: string) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
      return d
    }
  }

  const discountLabel = () => {
    const val = discountValue ? Number(discountValue) : 0
    if (!val) return null
    if (offerType === 'PERCENTAGE' || offerType === 'percentage') {
      return { text: `${val}%`, suffix: 'OFF' }
    }
    if (offerType === 'BUY_X_GET_Y' || offerType === 'buy_x_get_y') {
      return { text: 'BOGO', suffix: 'FREE' }
    }
    return { text: `€${val.toFixed(0)}`, suffix: 'OFF' }
  }

  const discount = discountLabel()
  const isEmpty = !title && !discountValue && !bannerImage

  return (
    <div className="flex flex-col items-center">
      {/* Phone frame mockup */}
      <div className="relative">
        {/* Top notch */}
        <div className="absolute left-1/2 top-1.5 z-20 h-1 w-12 -translate-x-1/2 rounded-full bg-foreground/20" />

        <div className="mx-auto w-[300px] overflow-hidden rounded-[2rem] border-[3px] border-foreground/90 bg-background shadow-2xl">
          {/* Status bar */}
          <div className="flex items-center justify-between bg-foreground/95 px-5 py-1.5 text-[10px] font-medium text-background">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-background" />
              <div className="h-1.5 w-1.5 rounded-full bg-background" />
              <div className="h-1.5 w-1.5 rounded-full bg-background" />
            </div>
          </div>

          {/* Banner image with overlay */}
          <div className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${typeConfig.color}`}>
            {bannerImage ? (
              <>
                <img src={bannerImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30" />
              </>
            ) : (
              <>
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                <div className="flex h-full flex-col items-center justify-center text-white">
                  <div className="rounded-full bg-white/20 p-3 backdrop-blur-sm">
                    <Gift className="h-7 w-7" />
                  </div>
                  <p className="mt-2 text-xs font-medium opacity-90">Add an image</p>
                </div>
              </>
            )}

            {/* Top-left badges */}
            <div className="absolute left-2.5 top-2.5 flex flex-col gap-1.5">
              {isFeatured && (
                <div className="flex items-center gap-1 rounded-full bg-amber-500/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur-sm">
                  <Star className="h-2.5 w-2.5 fill-white" />
                  Featured
                </div>
              )}
              {isExclusive && (
                <div className="flex items-center gap-1 rounded-full bg-violet-500/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg backdrop-blur-sm">
                  <Sparkles className="h-2.5 w-2.5" />
                  Exclusive
                </div>
              )}
              {redemptionCfg && (
                <div className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md ${redemptionCfg.bg}`}>
                  {redemptionCfg.label}
                </div>
              )}
            </div>

            {/* Discount badge - bottom right */}
            {discount && (
              <div className="absolute bottom-2.5 right-2.5">
                <div className="relative">
                  <div className="absolute inset-0 rotate-3 rounded-2xl bg-white shadow-2xl" />
                  <div className="relative flex flex-col items-center justify-center rounded-2xl bg-white px-3 py-2 shadow-xl">
                    <span className="text-xl font-black leading-none tracking-tight text-foreground">
                      {discount.text}
                    </span>
                    <span className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      {discount.suffix}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Content section */}
          <div className="space-y-2.5 p-3.5">
            {/* Merchant row */}
            {merchantName && (
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-[8px] font-bold text-primary-foreground">
                  {merchantName.charAt(0).toUpperCase()}
                </div>
                <p className="text-[10px] font-medium text-muted-foreground">{merchantName}</p>
                <BadgeCheck className="h-3 w-3 text-primary" />
              </div>
            )}

            {/* Title */}
            <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground">
              {title || (
                <span className="text-muted-foreground/50">Your offer title will appear here</span>
              )}
            </h3>

            {/* Description */}
            {(shortDescription || description) && (
              <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                {shortDescription || description}
              </p>
            )}

            {/* Tags row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                <TypeIcon className="h-2.5 w-2.5" />
                {typeConfig.label}
              </div>
              {categoryName && (
                <div className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                  {categoryName}
                </div>
              )}
              {minSpend && Number(minSpend) > 0 && (
                <div className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">
                  Min. ${Number(minSpend).toFixed(0)}
                </div>
              )}
            </div>

            {/* Validity + distance row */}
            {(startDate || endDate) && (
              <div className="flex items-center gap-1.5 border-t border-border/50 pt-2.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="font-medium">Valid</span>
                <span>{formatDate(startDate)}</span>
                <span className="text-muted-foreground/60">→</span>
                <span>{formatDate(endDate)}</span>
              </div>
            )}

            {/* Action button */}
            <button
              type="button"
              className={`mt-1 w-full rounded-xl bg-gradient-to-r ${typeConfig.color} py-2.5 text-[12px] font-bold uppercase tracking-wide text-white shadow-lg transition-transform active:scale-[0.98]`}
            >
              {discount ? `Save ${discount.text}` : 'View Offer'}
            </button>
          </div>
        </div>

        {/* Phone home indicator */}
        <div className="mx-auto mt-1 h-1 w-24 rounded-full bg-foreground/20" />
      </div>

      {/* Empty state hint */}
      {isEmpty && (
        <div className="mt-4 flex items-center gap-2 rounded-full border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>Start typing on the left to see a live preview</span>
        </div>
      )}

      {/* Preview label */}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Store className="h-3 w-3" />
        Employee App Preview
      </div>
    </div>
  )
}
