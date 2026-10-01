import { describe, it, expect, vi } from 'vitest'
import { assignFreeSlot } from '@/lib/banner-slots'

function txWithBookings(bookings: Array<{ slotNumber: number }>) {
  return {
    bannerBooking: {
      findMany: vi.fn().mockResolvedValue(bookings),
    },
  }
}

describe('assignFreeSlot', () => {
  it('returns slot 1 when no bookings overlap the range', async () => {
    const tx = txWithBookings([])
    const slot = await assignFreeSlot(tx as any, 'banner-1', 3, new Date('2026-01-01'), new Date('2026-01-08'))
    expect(slot).toBe(1)
  })

  it('skips slots already taken by an overlapping PENDING/APPROVED booking', async () => {
    const tx = txWithBookings([{ slotNumber: 1 }, { slotNumber: 2 }])
    const slot = await assignFreeSlot(tx as any, 'banner-1', 3, new Date('2026-01-01'), new Date('2026-01-08'))
    expect(slot).toBe(3)
  })

  it('returns null when every slot is taken', async () => {
    const tx = txWithBookings([{ slotNumber: 1 }, { slotNumber: 2 }, { slotNumber: 3 }])
    const slot = await assignFreeSlot(tx as any, 'banner-1', 3, new Date('2026-01-01'), new Date('2026-01-08'))
    expect(slot).toBeNull()
  })

  it('queries only PENDING/APPROVED bookings that overlap the requested date range', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const tx = { bannerBooking: { findMany } }
    const start = new Date('2026-02-01')
    const end = new Date('2026-02-10')

    await assignFreeSlot(tx as any, 'banner-1', 3, start, end)

    expect(findMany).toHaveBeenCalledWith({
      where: {
        bannerId: 'banner-1',
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lt: end },
        endDate: { gt: start },
      },
      select: { slotNumber: true },
    })
  })

  it('excludes the booking being re-validated via excludeBookingId', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const tx = { bannerBooking: { findMany } }

    await assignFreeSlot(tx as any, 'banner-1', 3, new Date(), new Date(), 'booking-self')

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'booking-self' } }),
      }),
    )
  })
})
