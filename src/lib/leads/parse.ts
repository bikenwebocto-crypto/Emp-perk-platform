import type { LeadType, Prisma } from '@prisma/client';
import { cleanText } from './normalise';
import { ATTRIBUTION_FIELDS, FORM_KEY_TO_TYPE, type SupportedFormKey } from './options';
import {
  contactMessageSchema,
  employerEnquirySchema,
  fieldErrors,
  individualWaitlistSchema,
  merchantApplicationSchema,
} from './schemas';

export const MAX_BODY_BYTES = 20 * 1024;

/** Columns written on create and on a duplicate update (status/source/createdAt are not here). */
export type LeadData = Omit<
  Prisma.LeadUncheckedCreateInput,
  'id' | 'type' | 'email' | 'source' | 'status' | 'attribution' | 'merchantId' | 'companyId' | 'createdAt' | 'updatedAt'
>;

export interface LeadInput {
  type: LeadType;
  email: string;
  data: LeadData;
  /** Kept apart from data so a duplicate submission can merge it with the stored value. */
  attribution: Record<string, string> | null;
}

export type ReadBodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: 400 | 413 | 415; message: string };

/** Reads a JSON or application/x-www-form-urlencoded body, capped at MAX_BODY_BYTES. */
export async function readLeadBody(request: Request): Promise<ReadBodyResult> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, status: 413, message: 'Request body too large' };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, message: 'Request body too large' };
  }

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.startsWith('application/x-www-form-urlencoded')) {
    return { ok: true, body: Object.fromEntries(new URLSearchParams(text)) };
  }

  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return { ok: true, body: body as Record<string, unknown> };
    }
  } catch {
    // fall through
  }
  return { ok: false, status: 400, message: 'Request body must be JSON or form-encoded' };
}

function pickAttribution(body: Record<string, unknown>): Record<string, string> | null {
  const attribution: Record<string, string> = {};
  for (const field of ATTRIBUTION_FIELDS) {
    const value = cleanText(body[field]);
    if (value) attribution[field] = value.slice(0, 2000);
  }
  return Object.keys(attribution).length ? attribution : null;
}

function buildConsents(consent1: string | null, consent2: string | null, version: string | null, acceptedAt: Date) {
  return { 'consent-1': consent1, 'consent-2': consent2, version, acceptedAt: acceptedAt.toISOString() };
}

export type ParseLeadResult = { ok: true; input: LeadInput } | { ok: false; errors: Record<string, string> };

/** employer_enquiry → EMPLOYER. */
function parseEmployerEnquiry(
  body: Record<string, unknown>,
  attribution: Record<string, string> | null,
  now: Date,
): ParseLeadResult {
  const parsed = employerEnquirySchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const f = parsed.data;
  return {
    ok: true,
    input: {
      type: 'EMPLOYER',
      email: f.email,
      attribution,
      data: {
        formKey: 'employer_enquiry',
        firstName: f.first_name,
        lastName: f.last_name,
        phone: f.phone,
        companyName: f.company,
        role: f.role,
        websiteUrl: f.website,
        linkedin: f.linkedin,
        companySize: f.company_size,
        referralSource: f.source,
        consents: buildConsents(f['consent-1'], null, f.consent_version, now),
        consentAt: now,
        consentVersion: f.consent_version,
      },
    },
  };
}

/** merchant_application → MERCHANT. */
function parseMerchantApplication(
  body: Record<string, unknown>,
  attribution: Record<string, string> | null,
  now: Date,
): ParseLeadResult {
  const parsed = merchantApplicationSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const f = parsed.data;
  return {
    ok: true,
    input: {
      type: 'MERCHANT',
      email: f.email,
      attribution,
      data: {
        formKey: 'merchant_application',
        firstName: f.first_name,
        lastName: f.last_name,
        phone: f.phone,
        companyName: f.company,
        role: f.role,
        websiteUrl: f.website,
        socialUrl: f.instagram,
        industry: f.category,
        redemption: f.redemption,
        referralSource: f.source,
        consents: buildConsents(f['consent-1'], f['consent-2'], f.consent_version, now),
        consentAt: now,
        consentVersion: f.consent_version,
      },
    },
  };
}

/** individual_waitlist → INDIVIDUAL_WAITLIST (no company). */
function parseIndividualWaitlist(
  body: Record<string, unknown>,
  attribution: Record<string, string> | null,
  now: Date,
): ParseLeadResult {
  const parsed = individualWaitlistSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const f = parsed.data;
  return {
    ok: true,
    input: {
      type: 'INDIVIDUAL_WAITLIST',
      email: f.email,
      attribution,
      data: {
        formKey: 'individual_waitlist',
        firstName: f.first_name,
        lastName: f.last_name,
        referralSource: f.source,
        consents: buildConsents(f['consent-1'], null, f.consent_version, now),
        consentAt: now,
        consentVersion: f.consent_version,
      },
    },
  };
}

/** contact_message → CONTACT_MESSAGE (a free-text message, never deduplicated). */
function parseContactMessage(
  body: Record<string, unknown>,
  attribution: Record<string, string> | null,
  now: Date,
): ParseLeadResult {
  const parsed = contactMessageSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const f = parsed.data;
  return {
    ok: true,
    input: {
      type: 'CONTACT_MESSAGE',
      email: f.email,
      attribution,
      data: {
        formKey: 'contact_message',
        firstName: f.first_name,
        lastName: f.last_name,
        phone: f.phone,
        message: f.message,
        referralSource: f.source,
        consents: buildConsents(f['consent-1'], null, f.consent_version, now),
        consentAt: now,
        consentVersion: f.consent_version,
      },
    },
  };
}

/**
 * Maps a website submission (snake_case + form_key) onto LeadInput.
 * Only the four website forms are accepted; anything else is a `form_key` error.
 */
export function parseLeadSubmission(body: Record<string, unknown>, now = new Date()): ParseLeadResult {
  const formKey = cleanText(body.form_key);
  if (!formKey || !Object.hasOwn(FORM_KEY_TO_TYPE, formKey)) {
    return { ok: false, errors: { form_key: 'Unsupported form' } };
  }
  const key = formKey as SupportedFormKey;
  const attribution = pickAttribution(body);

  switch (key) {
    case 'employer_enquiry':
      return parseEmployerEnquiry(body, attribution, now);
    case 'merchant_application':
      return parseMerchantApplication(body, attribution, now);
    case 'individual_waitlist':
      return parseIndividualWaitlist(body, attribution, now);
    case 'contact_message':
      return parseContactMessage(body, attribution, now);
  }
}
