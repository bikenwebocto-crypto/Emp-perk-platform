'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Star, Sparkles, Clock, Eye, Pencil, Tag, Zap, Flame, BadgeCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/utils/cn'

interface LiveOffersCarouselProps {
  offers: any[]
  isLoading?: boolean
}

const typeLabels: Record<string, string> = {
  FLAT: 'Flat',
  PERCENTAGE: '% Off',
  BUY_X_GET_Y: 'BOGO',
  flat_rate: 'Flat',
  percentage: '% Off',
  buy_x_get_y: 'BOGO',
}

const typeIcons: Record<string, any> = {
  FLAT: Tag,
  PERCENTAGE: Zap,
  BUY_X_GET_Y: Flame,
}

const gradients = [
  'from-blue-600 via-blue-500 to-indigo-600',
  'from-violet-600 via-purple-500 to-pink-600',
  'from-emerald-600 via-teal-500 to-cyan-600',
  'from-orange-600 via-amber-500 to-yellow-600',
  'from-rose-600 via-pink-500 to-fuchsia-600',
]

function formatValue(o: any): string {
  const cfg = (o?.pricing?.configuration as Record<string, any>) ?? {}
  const offerType = o?.offerType
  const v = Number(cfg.amount ?? cfg.percent ?? o?.discountValue ?? 0)
  if (offerType === 'percentage' || offerType === 'PERCENTAGE') return `${Number(cfg.percent ?? o?.discountPercent ?? v)}% OFF`
  if (offerType === 'buy_x_get_y' || offerType === 'BUY_X_GET_Y') return 'BOGO'
  return `€${v.toFixed(2)} OFF`
}

export function LiveOffersCarousel({ offers, isLoading }: LiveOffersCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const updateIndex = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const cardWidth = el.clientWidth + 16
    const idx = Math.round(el.scrollLeft / cardWidth)
    setCurrentIndex(Math.min(idx, Math.max(offers.length - 1, 0)))
  }, [offers.length])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('scroll', updateIndex, { passive: true })
    return () => el.removeEventListener('scroll', updateIndex)
  }, [updateIndex])

  const scrollTo = useCallback((index: number) => {
    const el = containerRef.current
    if (!el) return
    const child = el.children[index] as HTMLElement
    if (child) {
      child.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
    }
  }, [])

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-full md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
              <Skeleton className="h-80 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (offers.length === 0) return null

  return (
    <section className="space-y-3" aria-labelledby="live-offers-heading">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 id="live-offers-heading" className="text-lg font-semibold tracking-tight">
            Live Offers
          </h2>
          <Badge variant="live" className="text-[11px] font-semibold px-2.5 py-0.5">
            <BadgeCheck className="h-3 w-3 mr-1" />
            {offers.length} active
          </Badge>
        </div>
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          tabIndex={0}
          role="region"
          aria-label="Live offers carousel"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); scrollTo(Math.max(0, currentIndex - 1)) }
            if (e.key === 'ArrowRight') { e.preventDefault(); scrollTo(Math.min(offers.length - 1, currentIndex + 1)) }
          }}
        >
          {offers.map((offer, idx) => (
            <div
              key={offer.id}
              className="snap-start shrink-0 w-full md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]"
              role="group"
              aria-label={`Offer ${idx + 1} of ${offers.length}: ${offer.title}`}
            >
              <LiveOfferCard offer={offer} gradient={gradients[idx % gradients.length]!} />
            </div>
          ))}
        </div>

        {offers.length > 1 && (
          <>
            <button
              onClick={() => scrollTo(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 hidden md:flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md hover:bg-accent disabled:opacity-0 disabled:cursor-default transition-all z-10"
              aria-label="Previous offer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => scrollTo(Math.min(offers.length - 1, currentIndex + 1))}
              disabled={currentIndex >= offers.length - 1}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 hidden md:flex h-9 w-9 items-center justify-center rounded-full border bg-background shadow-md hover:bg-accent disabled:opacity-0 disabled:cursor-default transition-all z-10"
              aria-label="Next offer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {offers.length > 1 && (
        <div className="flex items-center justify-center md:justify-start gap-1.5">
          {offers.map((_, idx) => (
            <button
              key={idx}
              onClick={() => scrollTo(idx)}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                idx === currentIndex
                  ? 'w-6 bg-primary'
                  : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
              aria-label={`Go to offer ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function LiveOfferCard({ offer, gradient }: { offer: any; gradient: string }) {
  const bannerImage = offer?.content?.imageUrls
  console.log('bannerImage', bannerImage, offer)
  const TypeIcon = typeIcons[offer.offerType] ?? Tag

  return (
    <div className="group relative flex flex-col rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 h-full">
      <div className={cn(
        'relative h-64 sm:h-72 lg:h-80 overflow-hidden',
        !bannerImage && `bg-gradient-to-br ${gradient}`
      )}>
        {bannerImage ? (
          <img
            src={bannerImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 lg:group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

        <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-1.5 z-10">
          {offer.isFeatured && (
            <Badge className="bg-amber-500/90 text-white border-0 text-[10px] py-0.5 shadow-lg">
              <Star className="h-2.5 w-2.5 mr-0.5 fill-white" /> Featured
            </Badge>
          )}
          {offer.isExclusive && (
            <Badge className="bg-violet-500/90 text-white border-0 text-[10px] py-0.5 shadow-lg">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> Exclusive
            </Badge>
          )}
          <Badge variant="secondary" className="bg-white/20 text-white border-0 text-[10px] py-0.5 backdrop-blur-sm shadow-lg">
            <TypeIcon className="h-2.5 w-2.5 mr-0.5" />
            {typeLabels[offer.offerType] ?? offer.offerType}
          </Badge>
        </div>

        <div className="absolute bottom-3 right-3 z-10">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-xl">
            <p className="text-lg font-black leading-none text-gray-900">
              {formatValue(offer)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 gap-1.5 p-3.5 border border-t-0 border-border/50 rounded-b-xl">
        <h3 className="font-semibold text-sm leading-snug line-clamp-1">{offer.title}</h3>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {offer.endDate
              ? `Expires ${new Date(offer.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'No expiry'
            }
          </span>
        </div>

        <div className="flex items-center gap-2 mt-auto pt-2">
          <Link href={`/merchant/offers/${offer.id}`} className="flex-1 min-w-0">
            <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1">
              <Eye className="h-3 w-3 shrink-0" />
              <span className="truncate">Quick View</span>
            </Button>
          </Link>
          {['DRAFT', 'VALIDATION_FAILED', 'AWAITING_APPROVAL'].includes(offer.status) && (
            <Link href={`/merchant/offers/${offer.id}/edit`}>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
