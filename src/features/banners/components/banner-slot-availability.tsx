'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils/cn'
import { formatBannerDate } from '../utils/format-date'
import type { BannerSlotOccupancy } from '../types/banner'

interface BannerSlotAvailabilityProps {
  /** Total bookable slots on the banner (1..slotCount). */
  slotCount: number
  /** Live occupancy from the API. Missing slots are shown as available. */
  slots?: BannerSlotOccupancy[]
}

/**
 * Per-slot occupancy. There is no `BannerSlot` table: slots are the virtual
 * numbers 1..slotCount and "booked" simply means an active booking references
 * that number.
 */
export function BannerSlotAvailability({ slotCount, slots = [] }: BannerSlotAvailabilityProps) {
  const byNumber = new Map(slots.map((slot) => [slot.slotNumber, slot]))
  const slotNumbers = Array.from({ length: slotCount }, (_, index) => index + 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Slot Availability</CardTitle>
      </CardHeader>
      <CardContent>
        {slotNumbers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No slots configured.</p>
        ) : (
          <div className="divide-y divide-border">
            {slotNumbers.map((slotNumber) => {
              const occupancy = byNumber.get(slotNumber)
              const booked = occupancy?.status === 'BOOKED'
              const bookedUntil = formatBannerDate(occupancy?.bookedUntil)

              return (
                <div
                  key={slotNumber}
                  className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-medium">Slot {slotNumber}</span>
                  <div className="flex items-center gap-3 text-right">
                    {booked && (bookedUntil || occupancy?.bookings.length) ? (
                      <span className="text-xs text-muted-foreground">
                        {bookedUntil ? `Until ${bookedUntil}` : null}
                        {bookedUntil && occupancy?.bookings.length
                          ? ` · ${occupancy.bookings.length} booking${
                              occupancy.bookings.length === 1 ? '' : 's'
                            }`
                          : null}
                        {!bookedUntil && occupancy?.bookings.length
                          ? `${occupancy.bookings.length} booking${
                              occupancy.bookings.length === 1 ? '' : 's'
                            }`
                          : null}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        booked
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-500',
                      )}
                    >
                      {booked ? 'Booked' : 'Available'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
