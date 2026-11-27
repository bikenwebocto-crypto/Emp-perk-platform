// Shared, client-safe validation for email and password fields.
// Password rules mirror `passwordSchema` in src/schemas/index.ts.

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns an error message, or null when the email is valid. */
export function getEmailError(email: string): string | null {
  if (!email) return 'Email is required';
  if (/\s/.test(email)) return 'Email must not contain spaces';
  if (!EMAIL_FORMAT.test(email)) return 'Enter a valid email address (e.g. name@yourcompany.com)';
  return null;
}

export const PASSWORD_RULES = [
  { id: 'length', label: '8–128 characters', test: (p: string) => p.length >= 8 && p.length <= 128 },
  { id: 'letter', label: 'At least one letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { id: 'numberOrSymbol', label: 'At least one number or symbol', test: (p: string) => /[^A-Za-z]/.test(p) },
] as const;

/** Returns the first failing rule's message, or null when the password is valid. */
export function getPasswordError(password: string): string | null {
  const failed = PASSWORD_RULES.find((r) => !r.test(password));
  return failed ? `Password needs: ${failed.label.toLowerCase()}` : null;
}
