import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  AlreadyRedeemedError,
  OfferLimitReachedError,
  claimAttempt,
  deriveCapacityStatus,
  ensureCapacityRow,
  linkAttemptToRedemption,
  releaseCapacity,
  reserveCapacity,
} from '@/lib/redemption-tracking'

// Minimal mock transaction/client with just the methods our helpers call.
type TxMock = {
  offerRedemptionCapacity: {
    upsert: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
  }
  offerRedemptionAttempt: {
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  $executeRaw: ReturnType<typeof vi.fn>
}

function makeTx(): TxMock {
  return {
    offerRedemptionCapacity: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    offerRedemptionAttempt: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $executeRaw: vi.fn(),
  }
}

describe('redemption-tracking helpers', () => {
  describe('deriveCapacityStatus', () => {
    it('returns ACTIVE when no capacity row exists', () => {
      expect(deriveCapacityStatus(null)).toBe('ACTIVE')
      expect(deriveCapacityStatus(undefined)).toBe('ACTIVE')
    })

    it('returns ACTIVE when maxRedemptions is null (unlimited)', () => {
      expect(deriveCapacityStatus({ maxRedemptions: null, redeemedCount: 9999 })).toBe('ACTIVE')
    })

    it('returns ACTIVE when redeemedCount < maxRedemptions', () => {
      expect(deriveCapacityStatus({ maxRedemptions: 100, redeemedCount: 72 })).toBe('ACTIVE')
    })

    it('returns ENDED when redeemedCount === maxRedemptions', () => {
      expect(deriveCapacityStatus({ maxRedemptions: 100, redeemedCount: 100 })).toBe('ENDED')
    })

    it('returns ENDED when redeemedCount exceeds maxRedemptions (clamped)', () => {
      expect(deriveCapacityStatus({ maxRedemptions: 50, redeemedCount: 51 })).toBe('ENDED')
    })
  })

  describe('ensureCapacityRow', () => {
    it('upserts the capacity row with the given limit', async () => {
      const tx = makeTx()
      await ensureCapacityRow(tx as any, 'offer-1', 100)
      expect(tx.offerRedemptionCapacity.upsert).toHaveBeenCalledWith({
        where: { offerId: 'offer-1' },
        create: { offerId: 'offer-1', maxRedemptions: 100, redeemedCount: 0 },
        update: {},
      })
    })

    it('passes null for unlimited offers', async () => {
      const tx = makeTx()
      await ensureCapacityRow(tx as any, 'offer-2', null)
      expect(tx.offerRedemptionCapacity.upsert).toHaveBeenCalledWith({
        where: { offerId: 'offer-2' },
        create: { offerId: 'offer-2', maxRedemptions: null, redeemedCount: 0 },
        update: {},
      })
    })
  })

  describe('reserveCapacity', () => {
    it('returns ok=true when UPDATE affects a row', async () => {
      const tx = makeTx()
      tx.$executeRaw.mockResolvedValueOnce(1)
      tx.offerRedemptionCapacity.findUnique.mockResolvedValueOnce({
        maxRedemptions: 100,
        redeemedCount: 73,
      })
      const res = await reserveCapacity(tx as any, 'offer-1')
      expect(res.ok).toBe(true)
      expect(res.capacity).toEqual({ maxRedemptions: 100, redeemedCount: 73 })
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
      const arg = tx.$executeRaw.mock.calls[0]![0] as Prisma.Sql
      expect(arg.sql).toMatch(/"maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions"/)
    })

    it('returns ok=false when UPDATE affects 0 rows (limit reached)', async () => {
      const tx = makeTx()
      tx.$executeRaw.mockResolvedValueOnce(0)
      const res = await reserveCapacity(tx as any, 'offer-1')
      expect(res.ok).toBe(false)
      expect(res.capacity).toBeUndefined()
    })
  })

  describe('releaseCapacity', () => {
    it('runs a guarded decrement that does not underflow below zero', async () => {
      const tx = makeTx()
      tx.$executeRaw.mockResolvedValueOnce(1)
      await releaseCapacity(tx as any, 'offer-1')
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
      const arg = tx.$executeRaw.mock.calls[0]![0] as Prisma.Sql
      expect(arg.sql).toMatch(/"redeemedCount" > 0/)
    })
  })

  describe('claimAttempt', () => {
    it('returns ok=true with the new attempt id on first claim', async () => {
      const tx = makeTx()
      tx.offerRedemptionAttempt.create.mockResolvedValueOnce({ id: 'attempt-1' })
      const res = await claimAttempt(tx as any, 'offer-1', 'emp-1')
      expect(res.ok).toBe(true)
      expect(res.attemptId).toBe('attempt-1')
    })

    it('returns ok=false on unique-constraint violation (already redeemed)', async () => {
      const tx = makeTx()
      const err = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' },
      )
      tx.offerRedemptionAttempt.create.mockRejectedValueOnce(err)
      const res = await claimAttempt(tx as any, 'offer-1', 'emp-1')
      expect(res.ok).toBe(false)
      expect(res.attemptId).toBeUndefined()
    })

    it('rethrows non-constraint errors', async () => {
      const tx = makeTx()
      tx.offerRedemptionAttempt.create.mockRejectedValueOnce(new Error('boom'))
      await expect(claimAttempt(tx as any, 'offer-1', 'emp-1')).rejects.toThrow('boom')
    })
  })

  describe('linkAttemptToRedemption', () => {
    it('updates the attempt with the redemptionId', async () => {
      const tx = makeTx()
      tx.offerRedemptionAttempt.update.mockResolvedValueOnce({ id: 'attempt-1' })
      await linkAttemptToRedemption(tx as any, 'attempt-1', 'redemption-1')
      expect(tx.offerRedemptionAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { redemptionId: 'redemption-1' },
      })
    })

    it('swallows errors (best-effort)', async () => {
      const tx = makeTx()
      tx.offerRedemptionAttempt.update.mockRejectedValueOnce(new Error('nope'))
      await expect(
        linkAttemptToRedemption(tx as any, 'attempt-1', 'redemption-1'),
      ).resolves.toBeUndefined()
    })
  })

  describe('error classes', () => {
    it('OfferLimitReachedError has the expected code and message', () => {
      const e = new OfferLimitReachedError()
      expect(e.code).toBe('OFFER_LIMIT_REACHED')
      expect(e.message).toMatch(/reached its maximum redemption limit/i)
    })

    it('AlreadyRedeemedError has the expected code and message', () => {
      const e = new AlreadyRedeemedError()
      expect(e.code).toBe('ALREADY_REDEEMED')
      expect(e.message).toMatch(/already redeemed/i)
    })
  })
})
