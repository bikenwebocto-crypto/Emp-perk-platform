import { NextRequest, NextResponse } from 'next/server'
import { OfferExpiryScheduler } from '@/lib/queue/offer-expiry-scheduler'

// GET|POST /api/cron/expire-offers
//
// Moves LIVE offers past their endDate to EXPIRED and sends the
// expiring/expired notices to employees who saved them. Meant to be called
// hourly by a scheduler (Vercel cron, Supabase pg_cron + pg_net, or any
// external cron) with `Authorization: Bearer <CRON_SECRET>`. Idempotent, so
// overlapping or repeated calls are safe.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[CRON expire-offers] CRON_SECRET is not set')
    return NextResponse.json(
      { success: false, error: { code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set' } },
      { status: 500 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 },
    )
  }

  const startedAt = Date.now()
  await new OfferExpiryScheduler().run()
  return NextResponse.json({ success: true, durationMs: Date.now() - startedAt })
}

export const GET = handle
export const POST = handle
