// Option lists shared with the website forms. Values are stored exactly as written here.

export const COMPANY_SIZES = ['1-9', '10-49', '50-99', '100-249', '250+'] as const;

export const MERCHANT_CATEGORIES = [
  'Online Shopping & E-commerce',
  'Food & Drinks',
  'Fashion & Shopping',
  'Beauty & Wellness',
  'Health & Fitness',
  'Entertainment & Experiences',
  'Travel & Leisure',
  'Other',
] as const;

export const REDEMPTION_OPTIONS = ['Online', 'In-store', 'Both'] as const;

/** "How did you hear about us?" — optional on every form. Stored in `referralSource`. */
export const REFERRAL_SOURCES = [
  'Existing Perks & More Customer',
  'Existing Perks & More Merchant',
  'Friend Referral',
  'Google Search',
  'Social Media',
  'Event or Expo',
  'Other',
] as const;

/** The four public website forms. Anything else is rejected with a `form_key` error. */
export const FORM_KEY_TO_TYPE = {
  employer_enquiry: 'EMPLOYER',
  merchant_application: 'MERCHANT',
  individual_waitlist: 'INDIVIDUAL_WAITLIST',
  contact_message: 'CONTACT_MESSAGE',
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
