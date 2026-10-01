"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import {
  ChevronLeft,
  ChevronRight,
  Gift,
  ShoppingBag,
  Eye,
  CalendarDays,
  Plus,
} from "lucide-react";

interface LiveOffer {
  id: string;
  title: string;
  offerType: string;
  endDate: string;
  pricing?: { configuration?: Record<string, unknown> };
  capacity?: { redeemedCount?: number; maxRedemptions?: number };
  views?: number;
  bannerGradient?: string;
  content?: { imageUrls?: string[] };
  status:
    | "LIVE"
    | "DRAFT"
    | "ARCHIVED"
    | "VALIDATION_FAILED"
    | "AWAITING_APPROVAL";
}

function formatOfferValue(offer: LiveOffer): string {
  const cfg = (offer.pricing?.configuration as Record<string, unknown>) ?? {};
  const offerType = offer.offerType;
  if (offerType === "percentage" || offerType === "PERCENTAGE") {
    return `${Number(cfg.percent ?? cfg.amount ?? 0)}% OFF`;
  }
  if (offerType === "buy_x_get_y" || offerType === "BUY_X_GET_Y") {
    return "Buy X Get Y";
  }
  const amount = Number(cfg.amount ?? 0);
  return `€${amount.toFixed(2)} OFF`;
}

function formatExpiry(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function usePerPage() {
  const [perPage, setPerPage] = useState(3);

  useEffect(() => {
    const queries: { mq: string; perPage: number }[] = [
      { mq: "(min-width: 1024px)", perPage: 3 },
      { mq: "(min-width: 640px)", perPage: 2 },
      { mq: "(min-width: 0px)", perPage: 1 },
    ];
    const update = () => {
      const matched = queries.find((q) => window.matchMedia(q.mq).matches);
      setPerPage(matched?.perPage ?? 1);
    };
    update();
    const mqls = queries.map((q) => {
      const mql = window.matchMedia(q.mq);
      mql.addEventListener("change", update);
      return mql;
    });
    return () =>
      mqls.forEach((mql) => mql.removeEventListener("change", update));
  }, []);

  return perPage;
}

function CarouselSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="flex h-[280px]">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
    </Card>
  );
}

function EmptyCarousel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Gift className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <h3 className="mt-4 text-base font-medium">No live offers yet</h3>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Create your first campaign to start reaching employees and tracking
          performance
        </p>
        <Link href="/merchant/offers/create">
          <Button className="mt-6 gap-1.5">
            <Plus className="h-4 w-4" /> Create Your First Offer
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

interface FeaturedLiveCarouselProps {
  offers: LiveOffer[];
  isLoading?: boolean;
}

export function FeaturedLiveCarousel({
  offers,
  isLoading,
}: FeaturedLiveCarouselProps) {
  const [page, setPage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const total = offers.length;
  const perPage = usePerPage();
  const pageCount = Math.max(1, Math.ceil(total / perPage));

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const goTo = useCallback(
    (index: number) => {
      setPage(Math.max(0, Math.min(index, pageCount - 1)));
    },
    [pageCount],
  );

  const goNext = useCallback(
    () => goTo(page + 1),
    [goTo, page],
  );
  const goPrev = useCallback(
    () => goTo(page - 1),
    [goTo, page],
  );

  useEffect(() => {
    if (isPaused || pageCount <= 1) return;
    intervalRef.current = setInterval(goNext, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPaused, goNext, pageCount]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? 0;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0]?.clientX ?? 0;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      diff > 0 ? goNext() : goPrev();
    }
  };

  if (isLoading) return <CarouselSkeleton />;
  if (total === 0) return <EmptyCarousel />;

  const visibleOffers = offers.slice(page * perPage, page * perPage + perPage);

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-2 p-2 sm:p-4 md:p-6">
          {visibleOffers.map((offer) => (
            <Link
              key={offer.id}
              href={`/merchant/offers/${offer.id}`}
              prefetch={false}
            >
              <div
                className={cn(
                  "relative w-full rounded-xl overflow-hidden transition-all duration-300",
                  "active:scale-[0.98] hover:scale-[1.02] hover:shadow-xl",
                  "h-[200px] xs:h-[220px] sm:h-[280px] md:h-[320px]",
                  // Desktop specific height
                  "lg:h-[380px] xl:h-[400px]",
                  // Max width for desktop
                  "lg:max-w-[450px] xl:max-w-[450px]",
                  // Center card in grid
                  "mx-auto w-full",
                  // Use image if available, otherwise fallback to gradient
                  offer.content?.imageUrls?.[0]
                    ? ""
                    : "bg-gradient-to-br from-gray-800 to-gray-900",
                )}
                style={{
                  backgroundImage: offer.content?.imageUrls?.[0]
                    ? `url(${offer.content.imageUrls[0]})`
                    : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {/* Gradient overlay - better for mobile readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20 transition-opacity group-hover:bg-black/30" />

                {/* Pattern overlay - reduced opacity on mobile */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-5 xs:opacity-10 sm:opacity-20" />

                {/* Status Badge - Mobile optimized */}
                <div className="absolute left-2 top-2 z-10 xs:left-3 xs:top-3 sm:left-4 sm:top-4">
                  <Badge
                    variant={offer.status === "LIVE" ? "live" : "default"}
                    className={cn(
                      "uppercase tracking-wider shadow-sm backdrop-blur-sm border-none",
                      "text-[8px] xs:text-[10px] sm:text-[10px] lg:text-xs",
                      "px-1.5 py-0.5 xs:px-2 xs:py-0.5 sm:px-3 sm:py-1",
                      offer.status === "LIVE"
                        ? "bg-green-500/80 text-white"
                        : "bg-gray-600/80 text-white",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block rounded-full mr-1",
                        "w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-1.5 sm:h-1.5",
                        offer.status === "LIVE"
                          ? "bg-green-300 animate-pulse"
                          : "bg-gray-300",
                      )}
                    />
                    {offer.status === "LIVE" ? "Live" : offer.status}
                  </Badge>
                </div>

                {/* Offer Type Badge - Top Right */}
                <div className="absolute right-2 top-2 z-10 xs:right-3 xs:top-3 sm:right-4 sm:top-4">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-white/30 text-white backdrop-blur-sm",
                      "text-[8px] xs:text-[10px] sm:text-[10px] lg:text-xs",
                      "px-1.5 py-0.5 xs:px-2 xs:py-0.5 sm:px-3 sm:py-1",
                      "bg-black/30 hover:bg-black/40",
                    )}
                  >
                    {offer.offerType === "flat_rate"
                      ? "Flat"
                      : offer.offerType === "percentage"
                        ? "% Off"
                        : "BXGY"}
                  </Badge>
                </div>

                {/* Content */}
                <div className="relative z-10 flex h-full flex-col justify-between p-3 xs:p-4 sm:p-6 lg:p-8">
                  {/* Top section */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 xs:space-y-1 sm:space-y-2 flex-1 min-w-0">
                      <h3
                        className={cn(
                          "font-bold tracking-tight text-white line-clamp-2",
                          "text-sm xs:text-base sm:text-xl lg:text-2xl xl:text-2xl",
                        )}
                      >
                        {offer.title}
                      </h3>
                      <p
                        className={cn(
                          "text-white/90 font-medium",
                          "text-[10px] xs:text-xs sm:text-sm lg:text-base",
                        )}
                      >
                        {formatOfferValue(offer)}
                      </p>
                    </div>

                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md backdrop-blur-sm transition-all",
                        "bg-white/20 hover:bg-white/30 active:bg-white/40",
                        "text-[10px] xs:text-xs sm:text-sm lg:text-base",
                        "px-1.5 py-1 xs:px-2 xs:py-1 sm:px-3 sm:py-1.5 lg:px-4 lg:py-2",
                        "font-medium text-white flex-shrink-0",
                      )}
                    >
                      <span className="hidden xs:inline">View</span>
                      <span className="xs:hidden">→</span>
                      <span className="hidden xs:inline">Details</span>
                      <ChevronRight
                        className={cn(
                          "h-2.5 w-2.5 xs:h-3 xs:w-3 sm:h-4 sm:w-4 lg:h-5 lg:w-5",
                        )}
                      />
                    </span>
                  </div>

                  {/* Bottom section - Responsive metadata */}
                  <div className="flex flex-wrap items-center gap-1 xs:gap-1.5 sm:gap-2 lg:gap-3">
                    {/* Redemptions */}
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 xs:gap-1 sm:gap-1.5 lg:gap-2",
                        "bg-black/30 sm:bg-black/20 backdrop-blur-sm rounded-full",
                        "px-1.5 py-0.5 xs:px-2 xs:py-0.5 sm:px-3 sm:py-1 lg:px-4 lg:py-1.5",
                      )}
                    >
                      <ShoppingBag className="h-2.5 w-2.5 xs:h-3 xs:w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4" />
                      <span
                        className={cn(
                          "text-white/90",
                          "text-[8px] xs:text-[10px] sm:text-xs lg:text-sm",
                        )}
                      >
                        {offer.capacity?.redeemedCount ?? 0}
                      </span>
                      <span className="hidden xs:inline text-white/70 text-[8px] xs:text-[10px] sm:text-xs lg:text-sm">
                        redemptions
                      </span>
                    </span>

                    {/* Views - if available */}
                    {offer.views !== undefined && offer.views > 0 && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 xs:gap-1 sm:gap-1.5 lg:gap-2",
                          "bg-black/30 sm:bg-black/20 backdrop-blur-sm rounded-full",
                          "px-1.5 py-0.5 xs:px-2 xs:py-0.5 sm:px-3 sm:py-1 lg:px-4 lg:py-1.5",
                        )}
                      >
                        <Eye className="h-2.5 w-2.5 xs:h-3 xs:w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4" />
                        <span
                          className={cn(
                            "text-white/90",
                            "text-[8px] xs:text-[10px] sm:text-xs lg:text-sm",
                          )}
                        >
                          {offer.views}
                        </span>
                        <span className="hidden sm:inline text-white/70 text-[8px] xs:text-[10px] sm:text-xs lg:text-sm">
                          views
                        </span>
                      </span>
                    )}

                    {/* Expiry */}
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 xs:gap-1 sm:gap-1.5 lg:gap-2",
                        "bg-black/30 sm:bg-black/20 backdrop-blur-sm rounded-full",
                        "px-1.5 py-0.5 xs:px-2 xs:py-0.5 sm:px-3 sm:py-1 lg:px-4 lg:py-1.5",
                      )}
                    >
                      <CalendarDays className="h-2.5 w-2.5 xs:h-3 xs:w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4" />
                      <span className="hidden xs:inline text-white/70 text-[8px] xs:text-[10px] sm:text-xs lg:text-sm">
                        Expires
                      </span>
                      <span
                        className={cn(
                          "text-white/90",
                          "text-[8px] xs:text-[10px] sm:text-xs lg:text-sm",
                        )}
                      >
                        {formatExpiry(offer.endDate)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
      </div>

      {pageCount > 1 && (
        <>
          <button
            onClick={goPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
            aria-label="Previous offers"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={goNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
            aria-label="Next offers"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  "rounded-full transition-all duration-300",
                  i === page
                    ? "h-2 w-6 bg-white"
                    : "h-2 w-2 bg-white/50 hover:bg-white/70",
                )}
                aria-label={`Go to page ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
