import type { Prisma } from '@prisma/client'

/**
 * Finds the lowest free slotNumber in [1, slotCount] for a banner, given a
 * date range. A slot is taken if any PENDING/APPROVED booking on that
 * bannerId overlaps the requested range on that slot.
 *
 * `excludeBookingId` excludes a booking's own row from the "taken" set —
 * required when re-validating an existing booking's new slot/dates, since
 * otherwise it would always find itself occupying a slot.
 */
export async function assignFreeSlot(
  tx: Prisma.TransactionClient,
  bannerId: string,
  slotCount: number,
  start: Date,
  end: Date,
  excludeBookingId?: string,
): Promise<number | null> {
  const conflicting = await tx.bannerBooking.findMany({
    where: {
      bannerId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lt: end },
      endDate: { gt: start },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: { slotNumber: true },
  })

  const takenSlots = new Set(conflicting.map((b) => b.slotNumber))

  for (let i = 1; i <= slotCount; i++) {
    if (!takenSlots.has(i)) return i
  }

  return null
}
