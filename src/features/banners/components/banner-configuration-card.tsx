'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { eurExact } from '@/lib/format'
import type { BannerRecord } from '../types/banner'
import { DetailRow, DetailRowList } from './primitives'

interface BannerConfigurationCardProps {
  banner: BannerRecord
}

/** Position, ordering, pricing and booking limits for a banner. */
export function BannerConfigurationCard({ banner }: BannerConfigurationCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Banner Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <DetailRowList>
          <DetailRow label="Position">{banner.position}</DetailRow>
          <DetailRow label="Display Order">{banner.displayOrder ?? 0}</DetailRow>
          <DetailRow label="Price / Day">
            {eurExact.format(Number(banner.pricePerDay) || 0)}
          </DetailRow>
          <DetailRow label="Slots">{banner.slotCount}</DetailRow>
          <DetailRow label="Min Days">{banner.minDays}</DetailRow>
          <DetailRow label="Max Days">{banner.maxDays}</DetailRow>
        </DetailRowList>
      </CardContent>
    </Card>
  )
}
