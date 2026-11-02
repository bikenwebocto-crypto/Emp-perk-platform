'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  daysUntilBannerStart,
  getBannerAvailability,
  type BannerAvailability,
} from '../utils/banner-availability'
import { formatBannerDate } from '../utils/format-date'
import type { BannerRecord } from '../types/banner'
import { BannerStatusBadge } from './banner-status-badge'
import { DetailRow, DetailRowList } from './primitives'

interface BannerScheduleCardProps {
  banner: BannerRecord
  /** Derived status from the API. Recomputed locally when omitted. */
  status?: BannerAvailability
  daysUntilStart?: number | null
  /** Injectable for tests / deterministic rendering. */
  now?: Date
}

/**
 * The scheduling part of a banner: when it opens, when it closes, and the
 * availability that follows from those dates. Availability is derived here,
 * never stored.
 */
export function BannerScheduleCard({
  banner,
  status,
  daysUntilStart,
  now = new Date(),
}: BannerScheduleCardProps) {
  const resolvedStatus = status ?? getBannerAvailability(banner, now)
  const start = formatBannerDate(banner.startDate)
  const expiry = formatBannerDate(banner.expiresAt)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Schedule</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailRowList>
          <DetailRow label="Start Date">{start ?? 'Immediately'}</DetailRow>
          <DetailRow label="Expiry Date">{expiry ?? 'No expiry'}</DetailRow>
          <DetailRow label="Availability">
            <BannerStatusBadge
              status={resolvedStatus}
              daysUntilStart={
                daysUntilStart !== undefined
                  ? daysUntilStart
                  : daysUntilBannerStart(banner, now)
              }
            />
          </DetailRow>
          <DetailRow label="Available from">{start ?? 'Now'}</DetailRow>
        </DetailRowList>
      </CardContent>
    </Card>
  )
}
