import { z } from 'zod';
import {
  cleanText,
  normaliseEmail,
  normaliseInstagram,
  normalisePhone,
  normaliseWebsite,
} from './normalise';
import { COMPANY_SIZES, INTENT_OPTIONS, MERCHANT_CATEGORIES, REDEMPTION_OPTIONS } from './options';

// Field names match the website forms (snake_case), so zod error paths can be returned as-is.

const REQUIRED = 'This field is required';
const requiredString = () => z.string({ required_error: REQUIRED, invalid_type_error: REQUIRED });

const requiredText = (max: number) =>
  z.preprocess(cleanText, requiredString().max(max, `Must be ${max} characters or fewer`));

const optionalText = (max: number) =>
  z.preprocess(cleanText, z.string().max(max, `Must be ${max} characters or fewer`).nullable());

const requiredOption = (options: readonly string[]) =>
  z.preprocess(cleanText, requiredString().refine((v) => options.includes(v), 'Choose a valid option'));

const email = z.preprocess(normaliseEmail, requiredString().max(255).email('Enter a valid email address'));

const PHONE_RE = /^\+\d{7,15}$/;
const requiredPhone = z.preprocess(normalisePhone, requiredString().regex(PHONE_RE, 'Enter a valid phone number'));
const optionalPhone = z.preprocess(normalisePhone, z.string().regex(PHONE_RE, 'Enter a valid phone number').nullable());

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
const requiredWebsite = z.preprocess(normaliseWebsite, requiredString().pipe(websiteString));
const optionalWebsite = z.preprocess(normaliseWebsite, websiteString.nullable());

const optionalInstagram = z.preprocess(
  normaliseInstagram,
  z.string().regex(/^@[A-Za-z0-9._]{1,30}$/, 'Enter a valid Instagram handle').nullable(),
);

/** A ticked checkbox: the consent text the website sent, which must be non-empty. */
const requiredConsent = z.preprocess(cleanText, z.string({ required_error: 'Please tick this box', invalid_type_error: 'Please tick this box' }).max(2000));
const optionalConsent = z.preprocess(cleanText, z.string().max(2000).nullable());

const person = {
  first_name: requiredText(100),
  last_name: requiredText(100),
  email,
  company: requiredText(255),
  consent_version: optionalText(50),
};

export const employerEnquirySchema = z.object({
  ...person,
  phone: requiredPhone,
  role: requiredText(50),
  website: requiredWebsite,
  company_size: requiredOption(COMPANY_SIZES),
  instagram: optionalInstagram,
  'consent-1': requiredConsent,
});

export const merchantApplicationSchema = z
  .object({
    ...person,
    phone: requiredPhone,
    category: requiredOption(MERCHANT_CATEGORIES),
    redemption: requiredOption(REDEMPTION_OPTIONS),
    role: optionalText(50),
    website: optionalWebsite,
    instagram: optionalInstagram,
    'consent-1': requiredConsent,
    'consent-2': requiredConsent,
  })
  .superRefine((value, ctx) => {
    if (!value.website && !value.instagram) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['website'], message: 'Add your website or Instagram (at least one)' });
    }
  });

export const employeeAccessSchema = z.object({
  ...person,
  intent: requiredOption(INTENT_OPTIONS),
  phone: optionalPhone,
  role: optionalText(50),
  'consent-1': requiredConsent,
  'consent-2': optionalConsent,
});

export type EmployerEnquiry = z.infer<typeof employerEnquirySchema>;
export type MerchantApplication = z.infer<typeof merchantApplicationSchema>;
export type EmployeeAccess = z.infer<typeof employeeAccessSchema>;

/** First message per top-level field, keyed by the field name the client sent. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return errors;
}
