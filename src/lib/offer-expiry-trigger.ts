import { after } from 'next/server'
import { OfferExpiryScheduler } from '@/lib/queue/offer-expiry-scheduler'

// Request-triggered offer expiry. Offer GET routes call triggerOfferExpiry()
// (without await) so LIVE offers past their endDate are moved to EXPIRED even
// when no external cron is scheduled. The work runs in after(), i.e. once the
// response has been sent, so it never delays the request.
//
// Throttled per server instance: at most one run in progress, and no new run
// within THROTTLE_MS of the last start. The scheduler itself is safe to run
// concurrently across instances (and alongside /api/cron/expire-offers).

export const THROTTLE_MS = 10 * 60 * 1000

let running = false
let lastStartedAt = 0

/** For tests only. */
export function resetOfferExpiryTrigger(): void {
  running = false
  lastStartedAt = 0
}

/** Start an expiry run now unless one is running or started recently. */
export async function runOfferExpiryThrottled(now: number = Date.now()): Promise<boolean> {
  if (running || now - lastStartedAt < THROTTLE_MS) return false
  running = true
  lastStartedAt = now
  try {
    await new OfferExpiryScheduler().run()
  } catch (error) {
    console.error('[OfferExpiryTrigger] run failed', error)
  } finally {
    running = false
  }
  return true
}

/** Schedule a throttled expiry run after the current response. Never throws. */
export function triggerOfferExpiry(): void {
  try {
    after(() => runOfferExpiryThrottled())
  } catch (error) {
    // after() throws outside a request scope (e.g. scripts, some tests).
    console.error('[OfferExpiryTrigger] could not schedule', error)
  }
}
