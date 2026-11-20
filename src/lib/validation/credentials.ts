// Shared, client-safe validation for email and password fields.
// Password rules mirror `passwordSchema` in src/schemas/index.ts.

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Returns an error message, or null when the email is valid. */
export function getEmailError(email: string): string | null {
  if (!email) return 'Email is required';
  if (/\s/.test(email)) return 'Email must not contain spaces';
  if (!EMAIL_FORMAT.test(email)) return 'Enter a valid email address (e.g. name@example.com)';
  return null;
}

export const PASSWORD_RULES = [
  { id: 'length', label: '8–128 characters', test: (p: string) => p.length >= 8 && p.length <= 128 },
  { id: 'upper', label: 'One uppercase letter (A–Z)', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter (a–z)', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number (0–9)', test: (p: string) => /[0-9]/.test(p) },
  { id: 'special', label: 'One special character (!@#$…)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

/** Returns the first failing rule's message, or null when the password is valid. */
export function getPasswordError(password: string): string | null {
  const failed = PASSWORD_RULES.find((r) => !r.test(password));
  return failed ? `Password needs: ${failed.label.toLowerCase()}` : null;
}
