import { describe, it, expect, vi, beforeEach } from 'vitest'

// after(): capture callbacks instead of running them, so a test can prove
// the response was built before the expiry work runs.
const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>)
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn((cb: () => unknown) => {
    afterCallbacks.push(cb)
  }),
}))

// A scheduler run that only finishes when the test says so.
const scheduler = vi.hoisted(() => ({
  run: vi.fn(),
  release: () => {},
}))
vi.mock('@/lib/queue/offer-expiry-scheduler', () => ({
  OfferExpiryScheduler: class {
    run = scheduler.run
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    merchantOffer: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    notificationEvent: { findMany: vi.fn().mockResolvedValue([]) },
    redemption: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))
vi.mock('@/lib/mobile-auth', () => ({
  getAuthenticatedMobileEmployee: vi.fn(async () => ({
    ok: true,
    employee: { id: 'emp-1', companyId: 'company-1' },
  })),
}))

import {
  THROTTLE_MS,
  resetOfferExpiryTrigger,
  runOfferExpiryThrottled,
  triggerOfferExpiry,
} from '@/lib/offer-expiry-trigger'
import { GET as listMobileOffers } from '@/app/api/mobile/offers/route'

const T0 = 1_000_000_000_000

beforeEach(() => {
  resetOfferExpiryTrigger()
  afterCallbacks.length = 0
  scheduler.run.mockReset()
  scheduler.run.mockImplementation(
    () => new Promise<void>((resolve) => { scheduler.release = resolve }),
  )
})

describe('runOfferExpiryThrottled', () => {
  it('skips while a run is in progress', async () => {
    const first = runOfferExpiryThrottled(T0)
    // Far beyond the throttle window, but the first run has not finished.
    expect(await runOfferExpiryThrottled(T0 + 2 * THROTTLE_MS)).toBe(false)
    expect(scheduler.run).toHaveBeenCalledTimes(1)

    scheduler.release()
    expect(await first).toBe(true)
  })

  it('skips within 10 minutes of the last start, runs again after', async () => {
    scheduler.run.mockResolvedValue(undefined)

    expect(await runOfferExpiryThrottled(T0)).toBe(true)
    expect(await runOfferExpiryThrottled(T0 + THROTTLE_MS - 1)).toBe(false)
    expect(await runOfferExpiryThrottled(T0 + THROTTLE_MS)).toBe(true)
    expect(scheduler.run).toHaveBeenCalledTimes(2)
    expect(THROTTLE_MS).toBe(10 * 60 * 1000)
  })

  it('logs and swallows scheduler errors, and frees the lock', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    scheduler.run.mockRejectedValueOnce(new Error('db down'))

    await expect(runOfferExpiryThrottled(T0)).resolves.toBe(true)
    expect(spy).toHaveBeenCalled()

    scheduler.run.mockResolvedValue(undefined)
    expect(await runOfferExpiryThrottled(T0 + THROTTLE_MS)).toBe(true)
    spy.mockRestore()
  })
})

describe('triggerOfferExpiry', () => {
  it('only schedules work via after() and never throws', () => {
    expect(() => triggerOfferExpiry()).not.toThrow()
    expect(afterCallbacks).toHaveLength(1)
    expect(scheduler.run).not.toHaveBeenCalled()
  })
})

describe('offer GET route', () => {
  it('responds without waiting for the expiry run', async () => {
    const res = await listMobileOffers(new Request('http://localhost/api/mobile/offers') as any)

    // Response is complete while the expiry work has not even started.
    expect(res.status).toBe(200)
    expect(scheduler.run).not.toHaveBeenCalled()
    expect(afterCallbacks).toHaveLength(1)

    // Once Next runs the after() callback, the (still pending) run starts.
    const pending = afterCallbacks[0]!()
    expect(scheduler.run).toHaveBeenCalledTimes(1)
    scheduler.release()
    await pending
  })
})
