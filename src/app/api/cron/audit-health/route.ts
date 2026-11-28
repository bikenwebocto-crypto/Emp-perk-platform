import { NextRequest, NextResponse } from 'next/server'
import { getAuditHealth } from '@/lib/monitoring/audit-health'

// GET /api/cron/audit-health
//
// Read-only probe for audit integrity and background-job health. Call it from
// the same scheduler as /api/cron/expire-offers with
// `Authorization: Bearer <CRON_SECRET>`. Returns 200 when healthy and 503 when any
// check fails, so an uptime monitor can alert on the status code alone.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
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

  try {
    const health = await getAuditHealth()
    return NextResponse.json({ success: health.ok, data: health }, { status: health.ok ? 200 : 503 })
  } catch (err) {
    console.error('[CRON audit-health] failed', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { success: false, error: { code: 'CHECK_FAILED', message: 'Health check could not run' } },
      { status: 503 },
    )
  }
}
