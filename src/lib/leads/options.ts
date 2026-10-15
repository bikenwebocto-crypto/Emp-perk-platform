// Option lists shared with the website forms. Values are stored exactly as written here.

export const COMPANY_SIZES = ['1-9', '10-49', '50-99', '100-249', '250+'] as const;

export const MERCHANT_CATEGORIES = [
  'Online Shop',
  'Food & Drink',
  'Coffee & Cafés',
  'Wellness & Fitness',
  'Travel & Leisure',
  'Shopping & Retail',
  'Beauty',
  'Family',
  'Entertainment',
  'Home & Living',
  'Technology',
  'Pet Care',
  'Flowers & Gifts',
  'Sports',
  'Services',
  'Other',
] as const;

export const REDEMPTION_OPTIONS = ['Online', 'In-store', 'Both'] as const;

export const INTENT_OPTIONS = ['Get access', 'Join waitlist', 'Just curious'] as const;

export const FORM_KEY_TO_TYPE = {
  employer_enquiry: 'EMPLOYER',
  merchant_application: 'MERCHANT',
  employee_access: 'EMPLOYEE_ACCESS',
} as const;

export type SupportedFormKey = keyof typeof FORM_KEY_TO_TYPE;

export const ATTRIBUTION_FIELDS = [
  'page_url',
  'landing_page',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;
