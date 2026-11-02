'use client'

import { StatusBadge } from '@/components/shared/status-badge'
import { cn } from '@/utils/cn'
import {
  BANNER_AVAILABILITY_LABEL,
  BANNER_AVAILABILITY_HINT,
  type BannerAvailability,
} from '../utils/banner-availability'

const DOT_STYLES: Record<BannerAvailability, string> = {
  SCHEDULED: 'bg-amber-500',
  ACTIVE: 'bg-green-500',
  EXPIRED: 'bg-gray-400',
  INACTIVE: 'bg-red-500',
}

interface BannerStatusBadgeProps {
  status: BannerAvailability
  /** When the banner is SCHEDULED, used to render "Starts in 5 days". */
  daysUntilStart?: number | null
  /** Overrides the default hint line. Pass `null` to hide it. */
  hint?: string | null
  className?: string
}

/** Hint under the badge, e.g. "Starts in 5 days" for a scheduled banner. */
export function bannerStatusHint(
  status: BannerAvailability,
  daysUntilStart?: number | null,
): string {
  if (status === 'SCHEDULED' && typeof daysUntilStart === 'number' && daysUntilStart > 0) {
    return daysUntilStart === 1 ? 'Starts tomorrow' : `Starts in ${daysUntilStart} days`
  }
  return BANNER_AVAILABILITY_HINT[status]
}

export function BannerStatusBadge({
  status,
  daysUntilStart,
  hint,
  className,
}: BannerStatusBadgeProps) {
  const hintText = hint === undefined ? bannerStatusHint(status, daysUntilStart) : hint

  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn('h-2 w-2 shrink-0 rounded-full', DOT_STYLES[status])}
        />
        <StatusBadge status={status} label={BANNER_AVAILABILITY_LABEL[status]} />
      </span>
      {hintText && (
        <span className="text-xs text-muted-foreground">{hintText}</span>
      )}
    </div>
  )
}
