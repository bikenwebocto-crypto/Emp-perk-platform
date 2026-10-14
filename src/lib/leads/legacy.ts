import { z } from 'zod';
import { fieldErrors } from './schemas';
import type { LeadInput } from './parse';

// The original camelCase payload ({ type, firstName, companyName, ... }) used before the
// website forms existed. Kept so existing callers keep working; mapped onto LeadInput.

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

const legacyLeadSchema = z.discriminatedUnion('type', [merchantLeadSchema, employerLeadSchema]);

export function parseLegacyLead(
  body: Record<string, unknown>,
): { ok: true; input: LeadInput } | { ok: false; errors: Record<string, string> } {
  const parsed = legacyLeadSchema.safeParse(body);
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const input = parsed.data;

  return {
    ok: true,
    input: {
      type: input.type,
      email: input.email,
      attribution: null,
      data: {
        formKey: null,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        companyName: input.companyName,
        hearAbout: input.hearAbout ?? null,
        message: input.message ?? null,
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
    },
  };
}
