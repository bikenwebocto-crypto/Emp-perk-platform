import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { cleanText, normaliseEmail, normalisePhone } from '@/lib/leads/normalise';
import { fieldErrors } from '@/lib/leads/schemas';

// Request contract for the public "Book a Demo" form (camelCase, like the
// legacy leads payload). `type` says whether the visitor is an employer or a merchant.
//
// Availability policy (working hours, notice, collisions, allowed durations) is
// NOT validated here — the scheduling service validates it so there is one
// source of truth and every path (create and reschedule) re-checks it.

const REQUIRED = 'This field is required';
const PHONE_RE = /^\+\d{7,15}$/;
/** ISO-8601 with an explicit zone: "…Z" or "…+03:00". Naive local times are rejected. */
const STARTS_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

const requiredString = () => z.string({ required_error: REQUIRED, invalid_type_error: REQUIRED });

const requiredText = (max: number) =>
  z.preprocess(cleanText, requiredString().max(max, `Must be ${max} characters or fewer`));

const optionalText = (max: number) =>
  z.preprocess(cleanText, z.string().max(max, `Must be ${max} characters or fewer`).nullable());

const email = z.preprocess(normaliseEmail, requiredString().max(255).email('Enter a valid email address'));

const optionalPhone = z.preprocess(
  normalisePhone,
  z.string().regex(PHONE_RE, 'Enter a valid phone number').nullable(),
);

const startsAt = z.preprocess(
  cleanText,
  requiredString()
    .regex(STARTS_AT_RE, 'Enter a valid date and time')
    .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date and time')
    .transform((v) => new Date(v)),
);

const durationMinutes = z.preprocess(
  (v) => (cleanText(v) === null ? undefined : Number(cleanText(v))),
  z.number({ invalid_type_error: 'Enter a valid duration' }).int().optional(),
);

const timezone = z.preprocess(cleanText, requiredString().max(64));

const privacyAccepted = z.preprocess(
  (v) => v === true || v === 'true' || v === 'on' || v === 1 || v === '1',
  z.boolean().refine((v) => v, 'Please accept the privacy policy'),
);

export const DEMO_LEAD_TYPES = ['EMPLOYER', 'MERCHANT'] as const;
export type DemoLeadType = (typeof DEMO_LEAD_TYPES)[number];

export const demoBookingSchema = z.object({
  // Required: the form must say whether the visitor is an employer or a merchant.
  type: z.preprocess(
    (v) => cleanText(v)?.toUpperCase() ?? undefined,
    z.enum(DEMO_LEAD_TYPES, {
      errorMap: (issue) =>
        issue.code === 'invalid_type' ? { message: REQUIRED } : { message: 'Choose employer or merchant' },
    }),
  ),
  firstName: requiredText(100),
  lastName: requiredText(100),
  email,
  phone: optionalPhone,
  companyName: requiredText(255),
  startsAt,
  timezone,
  durationMinutes,
  notes: optionalText(2000),
  referralSource: optionalText(255),
  privacyAccepted,
});

export interface ParsedDemoBooking {
  type: DemoLeadType;
  email: string;
  /** Contact + company details, mapped onto the existing Lead model. */
  lead: {
    firstName: string;
    lastName: string;
    phone: string | null;
    companyName: string;
    hearAbout: string | null;
    consents: Prisma.InputJsonObject;
    consentAt: Date;
    consentVersion: string | null;
  };
  /** The scheduling request, validated by the scheduling service. */
  booking: {
    startsAt: Date;
    timezone: string;
    durationMinutes: number | undefined;
    notes: string | null;
  };
}

export type ParseDemoBookingResult =
  | { ok: true; input: ParsedDemoBooking }
  | { ok: false; errors: Record<string, string> };

// Admin reschedule: only the meeting time changes. `startsAt` is required;
// `timezone` and `durationMinutes` are optional and, when omitted, keep the
// booking's current values. Policy (hours, notice, collisions) is enforced by
// the scheduling service, so it is deliberately not duplicated here.
const optionalTimeZone = z.preprocess(cleanText, z.string().max(64).nullable());

const optionalDuration = z.preprocess(
  (v) => {
    const text = cleanText(v);
    return text === null ? null : Number(text);
  },
  z.number({ invalid_type_error: 'Enter a valid duration' }).int().nullable(),
);

export const demoRescheduleSchema = z.object({
  startsAt,
  timezone: optionalTimeZone.optional(),
  durationMinutes: optionalDuration.optional(),
});

export interface ParsedDemoReschedule {
  startsAt: Date;
  /** null/undefined keeps the booking's current display zone. */
  timezone: string | null | undefined;
  /** null/undefined keeps the booking's current duration. */
  durationMinutes: number | null | undefined;
}

export type ParseDemoRescheduleResult =
  | { ok: true; input: ParsedDemoReschedule }
  | { ok: false; errors: Record<string, string> };

export function parseDemoReschedule(body: Record<string, unknown>): ParseDemoRescheduleResult {
  const parsed = demoRescheduleSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  return {
    ok: true,
    input: {
      startsAt: parsed.data.startsAt,
      timezone: parsed.data.timezone,
      durationMinutes: parsed.data.durationMinutes,
    },
  };
}

export function parseDemoBooking(
  body: Record<string, unknown>,
  now = new Date(),
): ParseDemoBookingResult {
  const parsed = demoBookingSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const f = parsed.data;

  return {
    ok: true,
    input: {
      type: f.type,
      email: f.email,
      lead: {
        firstName: f.firstName,
        lastName: f.lastName,
        phone: f.phone,
        companyName: f.companyName,
        hearAbout: f.referralSource,
        consents: { privacyAccepted: true, acceptedAt: now.toISOString(), version: null },
        consentAt: now,
        consentVersion: null,
      },
      booking: {
        startsAt: f.startsAt,
        timezone: f.timezone,
        durationMinutes: f.durationMinutes,
        notes: f.notes,
      },
    },
  };
}
