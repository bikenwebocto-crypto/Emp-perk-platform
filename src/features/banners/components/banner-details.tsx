'use client'

import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { BANNER_AVAILABILITY_LABEL } from '../utils/banner-availability'
import type { BannerDetail } from '../types/banner'
import { BannerConfigurationCard } from './banner-configuration-card'
import { BannerScheduleCard } from './banner-schedule-card'
import { BannerSlotAvailability } from './banner-slot-availability'
import { BannerStatusBadge } from './banner-status-badge'

interface BannerDetailsProps {
  banner: BannerDetail
  /** Header actions, e.g. an "Edit Banner" button. */
  actions?: ReactNode
  className?: string
  now?: Date
}

/**
 * Admin view of a single banner: identity + derived status, configuration,
 * schedule and per-slot occupancy. Availability shown here comes from the same
 * helper the merchant APIs use, so the two can never disagree.
 */
export function BannerDetails({ banner, actions, className, now }: BannerDetailsProps) {
  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{banner.name}</h2>
            <BannerStatusBadge
              status={banner.availabilityStatus}
              daysUntilStart={banner.daysUntilStart}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {BANNER_AVAILABILITY_LABEL[banner.availabilityStatus]} banner ·{' '}
            {banner.position} position · display order {banner.displayOrder ?? 0}
          </p>
          {banner.description && (
            <p className="text-sm text-muted-foreground">{banner.description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BannerConfigurationCard banner={banner} />
        <BannerScheduleCard
          banner={banner}
          status={banner.availabilityStatus}
          daysUntilStart={banner.daysUntilStart}
          now={now}
        />
      </div>

      <BannerSlotAvailability slotCount={banner.slotCount} slots={banner.slots} />
    </div>
  )
}
