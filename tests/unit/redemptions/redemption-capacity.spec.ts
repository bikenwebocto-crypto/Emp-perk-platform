import { describe, it, expect, vi } from 'vitest'
import {
  ensureCapacityRow,
  reserveCapacity,
  releaseCapacity,
  claimAttempt,
  deriveCapacityStatus,
  OfferNotActiveError,
  OfferLimitReachedError,
  AlreadyRedeemedError,
} from '@/lib/redemption-tracking'

describe('redemption capacity tracking', () => {
  describe('ensureCapacityRow', () => {
    it('upserts a zeroed row for the offer', async () => {
      const upsert = vi.fn().mockResolvedValue({})
      const tx = { offerRedemptionCapacity: { upsert } }

      await ensureCapacityRow(tx as any, 'offer-1', 100)

      expect(upsert).toHaveBeenCalledWith({
        where: { offerId: 'offer-1' },
        create: { offerId: 'offer-1', maxRedemptions: 100, redeemedCount: 0 },
        update: {},
      })
    })
  })

  describe('reserveCapacity', () => {
    it('reports ok:false when the conditional UPDATE matches 0 rows', async () => {
      const tx = { $executeRaw: vi.fn().mockResolvedValue(0) }

      await expect(reserveCapacity(tx as any, 'offer-1')).resolves.toEqual({
        ok: false,
      })
    })

    it('returns the refreshed capacity when a slot was reserved', async () => {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        offerRedemptionCapacity: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ maxRedemptions: 100, redeemedCount: 5 }),
        },
      }

      const result = await reserveCapacity(tx as any, 'offer-1')

      expect(result.ok).toBe(true)
      expect(result.capacity?.redeemedCount).toBe(5)
      expect(tx.offerRedemptionCapacity.findUnique).toHaveBeenCalledWith({
        where: { offerId: 'offer-1' },
        select: { maxRedemptions: true, redeemedCount: true },
      })
    })
  })

  describe('releaseCapacity', () => {
    it('issues a guarded decrement that never underflows', async () => {
      const executeRaw = vi.fn().mockResolvedValue(1)
      const tx = { $executeRaw: executeRaw }

      await releaseCapacity(tx as any, 'offer-1')

      const [sql] = executeRaw.mock.calls[0] as unknown as [unknown]
      const text = String(sql)
      expect(text).toContain('"redeemedCount" = "redeemedCount" - 1')
      expect(text).toContain('"redeemedCount" > 0')
    })
  })

  describe('claimAttempt', () => {
    it('returns the attempt id on first claim', async () => {
      const tx = {
        offerRedemptionAttempt: {
          create: vi.fn().mockResolvedValue({ id: 'attempt-1' }),
        },
      }

      await expect(
        claimAttempt(tx as any, 'offer-1', 'emp-1'),
      ).resolves.toEqual({ ok: true, attemptId: 'attempt-1' })
    })
  })

  describe('deriveCapacityStatus', () => {
    it('is ACTIVE with no capacity row', () => {
      expect(deriveCapacityStatus(null)).toBe('ACTIVE')
    })

    it('is ACTIVE for an unlimited capacity', () => {
      expect(deriveCapacityStatus({ maxRedemptions: null, redeemedCount: 99 })).toBe('ACTIVE')
    })

    it('is ENDED when redeemedCount reaches maxRedemptions', () => {
      expect(deriveCapacityStatus({ maxRedemptions: 10, redeemedCount: 10 })).toBe('ENDED')
    })

    it('is ACTIVE while under the limit', () => {
      expect(deriveCapacityStatus({ maxRedemptions: 10, redeemedCount: 9 })).toBe('ACTIVE')
    })
  })

  describe('error classes', () => {
    it('carry stable machine-readable codes', () => {
      expect(new OfferNotActiveError().code).toBe('OFFER_INACTIVE')
      expect(new OfferLimitReachedError().code).toBe('OFFER_LIMIT_REACHED')
      expect(new AlreadyRedeemedError().code).toBe('ALREADY_REDEEMED')
    })
  })
})