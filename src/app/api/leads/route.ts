import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { clientIpFromRequest, getRateLimiter } from '@/lib/rate-limit';
import { channels, publishBusinessToAdmins } from '@/services/business-notification.service';

const RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 } as const;

const REQUIRED_TEXT = (max: number) => z.string().trim().min(1).max(max);

/** Trims, treats "" as absent, and caps the length. */
const OPTIONAL_TEXT = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value ?? undefined),
    z.string().max(max).optional(),
  );

const OPTIONAL_URL = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || undefined : value ?? undefined),
    z.string().url().max(max).optional(),
  );

const EMAIL = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z.string().email().max(255),
);

const sharedFields = {
  firstName: REQUIRED_TEXT(100),
  lastName: REQUIRED_TEXT(100),
  email: EMAIL,
  phone: OPTIONAL_TEXT(50),
  companyName: REQUIRED_TEXT(255),
  hearAbout: OPTIONAL_TEXT(255),
  message: OPTIONAL_TEXT(2000),
  consentVersion: REQUIRED_TEXT(50),
};

const merchantLeadSchema = z.object({
  ...sharedFields,
  type: z.literal('MERCHANT'),
  industry: OPTIONAL_TEXT(100),
  cities: z.preprocess(
    (value) => (value == null ? [] : value),
    z.array(z.string().trim().min(1).max(100)).max(50),
  ),
  websiteUrl: OPTIONAL_URL(500),
  socialUrl: OPTIONAL_URL(500),
}).strict();

const employerLeadSchema = z.object({
  ...sharedFields,
  type: z.literal('EMPLOYER'),
  companySize: OPTIONAL_TEXT(50),
  hqCountry: OPTIONAL_TEXT(100),
  role: OPTIONAL_TEXT(50),
}).strict();

const leadSubmissionSchema = z.discriminatedUnion('type', [merchantLeadSchema, employerLeadSchema]);

function validationError(details: unknown) {
  return NextResponse.json(
    { success: false, error: { code: 'VALIDATION', message: 'Validation failed', details } },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const ip = clientIpFromRequest(request);
    const rateLimit = await getRateLimiter().consume(`leads:${ip}`, RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many submissions. Please try again later.',
          },
          meta: { retryAfterSeconds: rateLimit.retryAfterSeconds },
        },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } },
      );
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') return validationError('Request body must be JSON');

    const parsed = leadSubmissionSchema.safeParse(rawBody);
    if (!parsed.success) return validationError(parsed.error.flatten().fieldErrors);

    const input = parsed.data;

    // Dedupe and insert run under one advisory lock so two identical
    // submissions cannot both pass the check.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lead_submit:${input.email}:${input.type}`}))`;

      const existing = await tx.lead.findFirst({
        where: { email: input.email, type: input.type, status: 'NEW' },
        select: { id: true, createdAt: true },
      });
      if (existing) return { kind: 'duplicate' as const, id: existing.id, createdAt: existing.createdAt };

      const lead = await tx.lead.create({
        data: {
          type: input.type,
          source: 'PUBLIC_FORM',
          status: 'NEW',
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone ?? null,
          companyName: input.companyName,
          hearAbout: input.hearAbout ?? null,
          message: input.message ?? null,
          consentAt: new Date(),
          consentVersion: input.consentVersion,
          ...(input.type === 'MERCHANT'
            ? {
                industry: input.industry ?? null,
                cities: input.cities,
                websiteUrl: input.websiteUrl ?? null,
                socialUrl: input.socialUrl ?? null,
              }
            : {
                companySize: input.companySize ?? null,
                hqCountry: input.hqCountry ?? null,
                role: input.role ?? null,
              }),
        },
        select: { id: true, createdAt: true },
      });
      return { kind: 'created' as const, id: lead.id, createdAt: lead.createdAt };
    });

    if (outcome.kind === 'duplicate') {
      return NextResponse.json(
        {
          success: true,
          data: { id: outcome.id, deduplicated: true },
          message: 'We already have this enquiry on file.',
        },
        { status: 200 },
      );
    }

    // Notifications are best-effort: a failure must not lose the lead.
    try {
      await publishBusinessToAdmins({
        type: 'SYSTEM',
        title: `New ${input.type === 'MERCHANT' ? 'merchant' : 'employer'} lead: ${input.companyName}`,
        message: `${input.firstName} ${input.lastName} (${input.email}) submitted a ${input.type.toLowerCase()} enquiry.`,
        priority: 'NORMAL',
        channels: channels('IN_APP'),
        referenceType: 'lead',
        referenceId: outcome.id,
        metadata: { leadId: outcome.id, type: input.type },
      });
    } catch (error) {
      console.error('Lead admin notification failed:', error);
    }

    return NextResponse.json(
      { success: true, data: { id: outcome.id, deduplicated: false }, message: 'Thank you — we will be in touch.' },
      { status: 201 },
    );
  } catch (error) {
    console.error('Lead submission error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}