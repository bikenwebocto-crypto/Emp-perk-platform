import { z } from 'zod';
import {
  cleanText,
  consentLabel,
  isTruthyConsent,
  normalizeCyprusPhone,
  normalizeEmail,
  normalizeInstagram,
  normalizeLinkedIn,
  normalizeWebsite,
} from './normalise';
import { COMPANY_SIZES, MERCHANT_CATEGORIES, REDEMPTION_OPTIONS, REFERRAL_SOURCES } from './options';

// Field names match the website forms (snake_case), so zod error paths can be returned as-is.

const REQUIRED = 'This field is required';
const requiredString = () => z.string({ required_error: REQUIRED, invalid_type_error: REQUIRED });

const requiredText = (max: number) =>
  z.preprocess(cleanText, requiredString().max(max, `Must be ${max} characters or fewer`));

const optionalText = (max: number) =>
  z.preprocess(cleanText, z.string().max(max, `Must be ${max} characters or fewer`).nullable());

const requiredOption = (options: readonly string[]) =>
  z.preprocess(cleanText, requiredString().refine((v) => options.includes(v), 'Choose a valid option'));

const optionalOption = (options: readonly string[]) =>
  z.preprocess(
    cleanText,
    z.string().refine((v) => options.includes(v), 'Choose a valid option').nullable(),
  );

const email = z.preprocess(normalizeEmail, requiredString().max(255).email('Enter a valid email address'));

const CYPRUS_PHONE_RE = /^\+357\d{8}$/;
/** Keeps the raw text when the number cannot be normalised, so a format error is reported. */
const cyprusPhone = (value: unknown) => {
  const text = cleanText(value);
  if (!text) return null;
  return normalizeCyprusPhone(text) ?? text;
};
const requiredCyprusPhone = z.preprocess(
  cyprusPhone,
  requiredString().regex(CYPRUS_PHONE_RE, 'Enter a valid Cyprus phone number'),
);
const optionalCyprusPhone = z.preprocess(
  cyprusPhone,
  z.string().regex(CYPRUS_PHONE_RE, 'Enter a valid Cyprus phone number').nullable(),
);

const websiteString = z
  .string()
  .max(500)
  .refine((v) => {
    try {
      return new URL(v).hostname.includes('.');
    } catch {
      return false;
    }
  }, 'Enter a valid website');
const requiredWebsite = z.preprocess(normalizeWebsite, requiredString().pipe(websiteString));
const optionalWebsite = z.preprocess(normalizeWebsite, websiteString.nullable());

const LINKEDIN_RE = /^https:\/\/www\.linkedin\.com\/[A-Za-z0-9][^\s]*$/;
/** Keeps the raw text when the host is not LinkedIn, so the format error is reported. */
const linkedInValue = (value: unknown) => {
  const text = cleanText(value);
  if (!text) return null;
  return normalizeLinkedIn(text) ?? text;
};
const optionalLinkedIn = z.preprocess(
  linkedInValue,
  z.string().regex(LINKEDIN_RE, 'Enter a valid LinkedIn URL').nullable(),
);

const optionalInstagram = z.preprocess(
  normalizeInstagram,
  z.string().regex(/^@[A-Za-z0-9._]{1,30}$/, 'Enter a valid Instagram handle').nullable(),
);

/** A ticked checkbox: the website may send the consent text or a boolean-ish token. */
const CONSENT_REQUIRED = 'Please tick this box';
const requiredConsent = z.preprocess(
  (value) => (isTruthyConsent(value) ? consentLabel(value) : null),
  z.string({ required_error: CONSENT_REQUIRED, invalid_type_error: CONSENT_REQUIRED }).max(2000),
);

const person = {
  first_name: requiredText(100),
  last_name: requiredText(100),
  email,
  consent_version: optionalText(50),
};

export const employerEnquirySchema = z.object({
  ...person,
  phone: requiredCyprusPhone,
  company: requiredText(255),
  role: requiredText(100),
  website: requiredWebsite,
  linkedin: optionalLinkedIn,
  company_size: requiredOption(COMPANY_SIZES),
  source: optionalOption(REFERRAL_SOURCES),
  'consent-1': requiredConsent,
});

export const merchantApplicationSchema = z
  .object({
    ...person,
    phone: requiredCyprusPhone,
    company: requiredText(255),
    role: optionalText(100),
    website: optionalWebsite,
    instagram: optionalInstagram,
    category: requiredOption(MERCHANT_CATEGORIES),
    redemption: requiredOption(REDEMPTION_OPTIONS),
    source: optionalOption(REFERRAL_SOURCES),
    'consent-1': requiredConsent,
    'consent-2': requiredConsent,
  })
  .superRefine((value, ctx) => {
    if (!value.website && !value.instagram) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['website'], message: 'Add your website or Instagram (at least one)' });
    }
  });

export const individualWaitlistSchema = z.object({
  ...person,
  source: optionalOption(REFERRAL_SOURCES),
  'consent-1': requiredConsent,
});

export const contactMessageSchema = z.object({
  ...person,
  phone: optionalCyprusPhone,
  message: requiredText(5000),
  source: optionalOption(REFERRAL_SOURCES),
  'consent-1': requiredConsent,
});

export type EmployerEnquiry = z.infer<typeof employerEnquirySchema>;
export type MerchantApplication = z.infer<typeof merchantApplicationSchema>;
export type IndividualWaitlist = z.infer<typeof individualWaitlistSchema>;
export type ContactMessage = z.infer<typeof contactMessageSchema>;

/** First message per top-level field, keyed by the field name the client sent. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}
