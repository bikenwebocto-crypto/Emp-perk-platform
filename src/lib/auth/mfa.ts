export const PRIVILEGED_MFA_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'COMPANY_ADMIN',
  'MERCHANT',
  'SUPPORT_ADMIN',
  'FINANCE_ADMIN',
]);

export function requiresMfaForRole(role?: string | null): boolean {
  return !!role && PRIVILEGED_MFA_ROLES.has(role);
}

type MfaFactorsLike =
  | Array<{ factor_type?: string; status?: string }>
  | { all?: Array<{ factor_type?: string; status?: string }> }
  | null
  | undefined;

export function hasVerifiedTotpFactor(factors: MfaFactorsLike): boolean {
  const factorList = Array.isArray(factors) ? factors : factors?.all ?? [];
  return factorList.some(
    (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
  );
}

export function isAal2(level?: string | null): boolean {
  return level === 'aal2';
}
