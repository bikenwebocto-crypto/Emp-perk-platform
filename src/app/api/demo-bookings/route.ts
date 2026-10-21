import { NextRequest, NextResponse } from 'next/server';
import { clientIpFromRequest, getRateLimiter } from '@/lib/rate-limit';
import { corsHeaders, isOriginAllowed } from '@/lib/leads/cors';
import { readLeadBody } from '@/lib/leads/parse';
import { parseDemoBooking } from '@/lib/demo-bookings/schema';
import { formatBusinessLocal, MEETING_MODE } from '@/lib/demo-bookings/availability';
import { scheduleDemoBooking } from '@/lib/demo-bookings/scheduling.service';
import { createAuditLog } from '@/services/audit-log.service';
import { channels, publishBusinessToAdmins } from '@/services/business-notification.service';

const RATE_LIMIT = { limit: 5, windowMs: 10 * 60 * 1000 } as const;

function json(origin: string | null, body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(origin), ...headers } });
}

function validationError(origin: string | null, errors: Record<string, string>) {
  return json(origin, {
    success: false,
    errors,
    error: { code: 'VALIDATION', message: 'Validation failed', details: errors },
  }, 400);
}

// OPTIONS /api/demo-bookings — CORS preflight for PUBLIC_SITE_ORIGINS only
export function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || !isOriginAllowed(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// POST /api/demo-bookings — public "Book a Demo" submissions.
//
// Intentionally unauthenticated: the submitter is a lead, not an employee,
// merchant or company admin. Do not add getCurrentUser()/authenticateFromBearer()
// or any session check here. Abuse is handled by the origin allow-list, the
// per-IP rate limit and the honeypot, like the public leads API.
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  try {
    if (!isOriginAllowed(origin)) {
      return json(null, { success: false, error: { code: 'FORBIDDEN', message: 'Origin not allowed' } }, 403);
    }

    const ip = clientIpFromRequest(request);
    const rateLimit = await getRateLimiter().consume(`demo-bookings:${ip}`, RATE_LIMIT);
    if (!rateLimit.allowed) {
      return json(
        origin,
        {
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many submissions. Please try again later.' },
          meta: { retryAfterSeconds: rateLimit.retryAfterSeconds },
        },
        429,
        { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      );
    }

    const read = await readLeadBody(request);
    if (!read.ok) {
      if (read.status === 413) {
        return json(origin, { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: read.message } }, 413);
      }
      return validationError(origin, { form: read.message });
    }

    // Honeypot: bots fill pm_hp. Pretend success and save nothing.
    if (typeof read.body.pm_hp === 'string' ? read.body.pm_hp.trim() : read.body.pm_hp) {
      return json(origin, { success: true }, 200);
    }

    const parsed = parseDemoBooking(read.body);
    if (!parsed.ok) return validationError(origin, parsed.errors);
    const input = parsed.input;

    const result = await scheduleDemoBooking({
      lead: input.lead,
      email: input.email,
      startsAt: input.booking.startsAt,
      timezone: input.booking.timezone,
      durationMinutes: input.booking.durationMinutes,
      notes: input.booking.notes,
    });

    // An already-held time is not an error for the visitor: the request is
    // stored as PENDING and an admin reschedules it if it clashes.
    if (!result.ok) return validationError(origin, { [result.violation.field]: result.violation.message });

    const { booking, overlapCount } = result;

    // Public submission, no acting user: recorded as a system action.
    await createAuditLog({
      actorType: 'system',
      action: 'demo_booking.created',
      entityType: 'demo_booking',
      entityId: booking.id,
      metadata: { reference: booking.reference, leadId: booking.leadId, startsAt: booking.startsAt.toISOString(), overlapCount },
    });

    // Notifications are best-effort: a failure must not lose the booking.
    try {
      await publishBusinessToAdmins({
        type: 'SYSTEM',
        title: `New demo request: ${input.lead.companyName}`,
        message: `${input.lead.firstName} ${input.lead.lastName} (${input.email}) requested a ${booking.durationMinutes}-minute ${MEETING_MODE.toLowerCase()} on ${formatBusinessLocal(booking.startsAt)} (Nicosia time).${
          overlapCount > 0 ? ` This overlaps ${overlapCount} other booking(s) — reschedule one of them.` : ''
        }`,
        priority: overlapCount > 0 ? 'HIGH' : 'NORMAL',
        channels: channels('IN_APP'),
        referenceType: 'demo_booking',
        referenceId: booking.id,
        metadata: { leadId: booking.leadId, reference: booking.reference },
      });
    } catch (error) {
      console.error('Demo booking admin notification failed:', error);
    }

    // Only what the public frontend needs: no lead fields, no ids, no DB details.
    return json(
      origin,
      {
        success: true,
        reference: booking.reference,
        status: booking.status,
        message: "Thank you — we've received your demo request and will be in touch to confirm.",
      },
      201,
    );
  } catch (error) {
    console.error('Demo booking submission error:', error);
    return json(origin, { success: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again later.' } }, 500);
  }
}
