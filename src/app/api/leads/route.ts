import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateUserEmail } from '@/services/user-validation.service';
import { clientIpFromRequest, getRateLimiter } from '@/lib/rate-limit';
import { corsHeaders, isOriginAllowed } from '@/lib/leads/cors';
import { parseLeadSubmission, readLeadBody, type LeadInput } from '@/lib/leads/parse';
import { channels, publishBusinessToAdmins } from '@/services/business-notification.service';

const RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 } as const;

const LEAD_LABEL = {
  MERCHANT: 'merchant',
  EMPLOYER: 'employer',
  INDIVIDUAL_WAITLIST: 'waitlist',
  CONTACT_MESSAGE: 'contact',
  EMPLOYEE_ACCESS: 'employee access',
} as const;

/** Employers and merchants have a company, so they get the default cities and country. */
function isCompanyLead(type: LeadInput['type']) {
  return type === 'EMPLOYER' || type === 'MERCHANT';
}

function json(origin: string | null, body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(origin), ...headers } });
}

function userAlreadyExists(origin: string | null) {
  return json(origin, {
    success: false,
    error: {
      code: 'USER_ALREADY_EXISTS',
      message: 'An account with this email already exists. Please log in instead.',
    },
  }, 409);
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
// individual_waitlist, contact_message)
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

    // A contact message is never deduplicated: every message is kept as its own lead,
    // even from someone who already has an account.
    if (input.type !== 'CONTACT_MESSAGE') {
      const account = await validateUserEmail(input.email);
      if (account.exists) return userAlreadyExists(origin);
    }

    // Duplicate rule: an open lead (NEW, CONTACTED or CONVERTED) with the same email + type
    // is not saved again — the visitor is told they are already registered. A REJECTED
    // lead does not block a new submission. The check and write run under one advisory
    // lock so two identical submissions cannot both create a row.
    const companyLead = isCompanyLead(input.type);
    const outcome = await prisma.$transaction(async (tx) => {
      if (input.type !== 'CONTACT_MESSAGE') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead_submit:${input.email}:${input.type}`}))`;

        const existing = await tx.lead.findFirst({
          where: { email: input.email, type: input.type, status: { in: ['NEW', 'CONTACTED', 'CONVERTED'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });

        if (existing) return { kind: 'duplicate' as const, id: existing.id };
      }

      const lead = await tx.lead.create({
        data: {
          ...input.data,
          type: input.type,
          email: input.email,
          source: 'PUBLIC_FORM',
          status: 'NEW',
          ...(companyLead ? { cities: ['Limassol'], hqCountry: 'Cyprus' } : {}),
          consentAt: input.data.consentAt ?? new Date(),
          ...(input.attribution ? { attribution: input.attribution } : {}),
        },
        select: { id: true },
      });
      return { kind: 'created' as const, id: lead.id };
    });

    if (outcome.kind === 'duplicate') {
      return json(origin, {
        success: false,
        error: {
          code: 'LEAD_ALREADY_EXISTS',
          message: 'You have already submitted this request with this email. Our team will be in touch soon.',
        },
      }, 409);
    }

    {
      // New lead created. Notifications are best-effort: a failure must not lose the lead.
      try {
        const leadName = input.data.companyName ?? `${input.data.firstName} ${input.data.lastName}`.trim();
        await publishBusinessToAdmins({
          type: 'SYSTEM',
          title: `New ${LEAD_LABEL[input.type]} lead: ${leadName}`,
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
      data: { id: outcome.id },
      message: 'Thank you — we will be in touch.',
    }, 201);
  } catch (error) {
    console.error('Lead submission error:', error);
    return json(origin, { success: false, error: { code: 'INTERNAL', message: 'Something went wrong. Please try again later.' } }, 500);
  }
}
