import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { clientIpFromRequest, getRateLimiter } from '@/lib/rate-limit';
import { corsHeaders, isOriginAllowed } from '@/lib/leads/cors';
import { parseLeadSubmission, readLeadBody } from '@/lib/leads/parse';
import { channels, publishBusinessToAdmins } from '@/services/business-notification.service';

const RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 } as const;

const LEAD_LABEL = { MERCHANT: 'merchant', EMPLOYER: 'employer', EMPLOYEE_ACCESS: 'employee access' } as const;

function json(origin: string | null, body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(origin), ...headers } });
}

function validationError(origin: string | null, errors: Record<string, string>) {
  // `error` mirrors the previous response shape for existing callers.
  return json(origin, {
    success: false,
    errors,
    error: { code: 'VALIDATION', message: 'Validation failed', details: errors },
  }, 400);
}

// OPTIONS /api/leads — CORS preflight for PUBLIC_SITE_ORIGINS only
export function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || !isOriginAllowed(origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// POST /api/leads — public website forms (employer_enquiry, merchant_application,
// employee_access) and the legacy camelCase payload
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  try {
    if (!isOriginAllowed(origin)) {
      return json(null, { success: false, error: { code: 'FORBIDDEN', message: 'Origin not allowed' } }, 403);
    }

    const ip = clientIpFromRequest(request);
    const rateLimit = await getRateLimiter().consume(`leads:${ip}`, RATE_LIMIT);
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

    const parsed = parseLeadSubmission(read.body);
    if (!parsed.ok) return validationError(origin, parsed.errors);
    const input = parsed.input;

    // Duplicate rule: an open lead (NEW or CONTACTED) with the same email + type is
    // updated in place with the new values — createdAt and status are kept and
    // attribution is merged (new keys win) — and its id is returned. Otherwise, including
    // when the earlier lead is REJECTED or CONVERTED, a new lead is created.
    // The check and write run under one advisory lock so two identical submissions
    // cannot both create a row.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead_submit:${input.email}:${input.type}`}))`;

      const existing = await tx.lead.findFirst({
        where: { email: input.email, type: input.type, status: { in: ['NEW', 'CONTACTED'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, attribution: true },
      });

      if (existing) {
        const previous = existing.attribution && typeof existing.attribution === 'object' && !Array.isArray(existing.attribution)
          ? (existing.attribution as Record<string, unknown>)
          : {};
        const attribution = input.attribution ? { ...previous, ...input.attribution } : undefined;
        const nextCities = Array.isArray(input.data.cities)
          ? Array.from(new Set([...input.data.cities, 'Limassol']))
          : ['Limassol'];

        await tx.lead.update({
          where: { id: existing.id },
          data: {
            ...input.data,
            cities: nextCities,
            hqCountry: input.data.hqCountry ?? 'Cyprus',
            ...(attribution ? { attribution: attribution as Prisma.InputJsonObject } : {}),
          },
        });
        return { kind: 'updated' as const, id: existing.id };
      }

      const lead = await tx.lead.create({
        data: {
          ...input.data,
          type: input.type,
          email: input.email,
          source: 'PUBLIC_FORM',
          status: 'NEW',
          cities: ['Limassol'],
          hqCountry: 'Cyprus',
          consentAt: input.data.consentAt ?? new Date(),
          ...(input.attribution ? { attribution: input.attribution } : {}),
        },
        select: { id: true },
      });
      return { kind: 'created' as const, id: lead.id };
    });

    if (outcome.kind === 'created') {
      // Notifications are best-effort: a failure must not lose the lead.
      try {
        await publishBusinessToAdmins({
          type: 'SYSTEM',
          title: `New ${LEAD_LABEL[input.type]} lead: ${input.data.companyName}`,
          message: `${input.data.firstName} ${input.data.lastName} (${input.email}) submitted a ${LEAD_LABEL[input.type]} enquiry.`,
          priority: 'NORMAL',
          channels: channels('IN_APP'),
          referenceType: 'lead',
          referenceId: outcome.id,
          metadata: { leadId: outcome.id, type: input.type },
        });
      } catch (error) {
        console.error('Lead admin notification failed:', error);
      }
    }

    return json(origin, {
      success: true,
      id: outcome.id,
      data: { id: outcome.id, deduplicated: outcome.kind === 'updated' },
      message: 'Thank you — we will be in touch.',
    }, 201);
  } catch (error) {
    console.error('Lead submission error:', error);
    return json(origin, { success: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again later.' } }, 500);
  }
}
