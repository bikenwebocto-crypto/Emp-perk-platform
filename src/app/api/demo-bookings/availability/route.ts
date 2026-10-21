import { NextRequest, NextResponse } from 'next/server';
import { clientIpFromRequest, getRateLimiter } from '@/lib/rate-limit';
import { corsHeaders, isOriginAllowed } from '@/lib/leads/cors';
import {
  ALLOWED_DURATIONS_MINUTES,
  BUSINESS_TIMEZONE,
  DEFAULT_DURATION_MINUTES,
  isValidDateKey,
} from '@/lib/demo-bookings/availability';
import { getAvailableSlots } from '@/lib/demo-bookings/scheduling.service';

const RATE_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 } as const;

/** The shared leads CORS helper advertises POST; this endpoint is a GET. */
function availabilityCors(origin: string | null): Record<string, string> {
  const base = corsHeaders(origin);
  if (Object.keys(base).length === 0) return base;
  return { ...base, 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
}

function json(origin: string | null, body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...availabilityCors(origin), ...headers } });
}

// OPTIONS /api/demo-bookings/availability — CORS preflight for PUBLIC_SITE_ORIGINS only
export function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || !isOriginAllowed(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: availabilityCors(origin) });
}

// GET /api/demo-bookings/availability?date=YYYY-MM-DD[&durationMinutes=30]
//
// Public read-only view of the open demo slots for one business day. The result
// is advisory: POST /api/demo-bookings always re-validates on the server, so a
// stale slot here can never be double-booked.
export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');
  try {
    if (!isOriginAllowed(origin)) {
      return json(null, { success: false, error: { code: 'FORBIDDEN', message: 'Origin not allowed' } }, 403);
    }

    const ip = clientIpFromRequest(request);
    const rateLimit = await getRateLimiter().consume(`demo-availability:${ip}`, RATE_LIMIT);
    if (!rateLimit.allowed) {
      return json(
        origin,
        {
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
          meta: { retryAfterSeconds: rateLimit.retryAfterSeconds },
        },
        429,
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      );
    }

    const date = request.nextUrl.searchParams.get('date') ?? '';
    if (!isValidDateKey(date)) {
      return json(origin, { success: false, error: { code: 'VALIDATION', message: 'Provide a date as YYYY-MM-DD' } }, 400);
    }

    const durationParam = request.nextUrl.searchParams.get('durationMinutes');
    const durationMinutes = durationParam === null ? DEFAULT_DURATION_MINUTES : Number(durationParam);
    if (!(ALLOWED_DURATIONS_MINUTES as readonly number[]).includes(durationMinutes)) {
      return json(origin, { success: false, error: { code: 'VALIDATION', message: 'Unsupported meeting duration' } }, 400);
    }

    const slots = await getAvailableSlots(date, durationMinutes);

    return json(origin, {
      success: true,
      date,
      timezone: BUSINESS_TIMEZONE,
      durationMinutes,
      slots: slots.map((slot) => ({ startsAt: slot.startsAt.toISOString(), endAt: slot.endAt.toISOString() })),
    }, 200);
  } catch (error) {
    console.error('Demo availability error:', error);
    return json(origin, { success: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again later.' } }, 500);
  }
}
