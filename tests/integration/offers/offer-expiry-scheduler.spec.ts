import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory fake: one LIVE offer past its endDate, saved by two employees.
const db = vi.hoisted(() => ({
  status: 'LIVE' as string,
  sent: [] as Array<{ type: string; title: string; employeeId: string; referenceId: string }>,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: {
      findMany: vi.fn(async ({ where }: any) => {
        // Only the "expired" query (endDate < now) matches this fixture.
        if (where.endDate?.lt && !where.endDate?.gt && !where.endDate?.gte && db.status === 'LIVE') {
          return [{ id: 'offer-1', title: 'Coffee', endDate: new Date(Date.now() - 60_000) }]
        }
        return []
      }),
      updateMany: vi.fn(async () => {
        await Promise.resolve() // let concurrent runs interleave
        if (db.status !== 'LIVE') return { count: 0 }
        db.status = 'EXPIRED'
        return { count: 1 }
      }),
    },
    notificationEvent: {
      findMany: vi.fn(async ({ where, distinct }: any) => {
        if (distinct) return [{ employeeId: 'emp-1' }, { employeeId: 'emp-2' }] // savers
        return db.sent
          .filter((n) => n.type === where.type && n.title === where.title && n.referenceId === where.referenceId)
          .map((n) => ({ employeeId: n.employeeId }))
      }),
    },
  },
}))

vi.mock('@/services/notification.service', () => ({
  NotificationService: {
    publish: vi.fn(async (opts: any) => {
      for (const r of opts.recipients) {
        db.sent.push({ type: opts.type, title: opts.title, employeeId: r.id, referenceId: opts.referenceId })
      }
      return []
    }),
  },
}))

import { OfferExpiryScheduler } from '@/lib/queue/offer-expiry-scheduler'

beforeEach(() => {
  db.status = 'LIVE'
  db.sent = []
})

describe('OfferExpiryScheduler', () => {
  it('two concurrent runs expire the offer once and notify each saver once', async () => {
    await Promise.all([new OfferExpiryScheduler().run(), new OfferExpiryScheduler().run()])

    expect(db.status).toBe('EXPIRED')
    const expired = db.sent.filter((n) => n.type === 'OFFER_EXPIRED')
    expect(expired.map((n) => n.employeeId).sort()).toEqual(['emp-1', 'emp-2'])
  })

  it('does not re-notify an employee who already has the notice', async () => {
    db.sent.push({ type: 'OFFER_EXPIRED', title: 'Offer expired', employeeId: 'emp-1', referenceId: 'offer-1' })

    await new OfferExpiryScheduler().run()

    const expired = db.sent.filter((n) => n.type === 'OFFER_EXPIRED')
    expect(expired.map((n) => n.employeeId).sort()).toEqual(['emp-1', 'emp-2'])
  })
})
