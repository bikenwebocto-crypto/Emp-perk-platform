import { describe, it, expect } from 'vitest'
import {
  AuthError,
  ForbiddenError,
  requireRole,
  requireProfileType,
  requireActive,
  requireCompany,
  requireAdmin,
  requireMerchant,
  requireEmployee,
  requireCompanyAdmin,
} from '@/lib/auth/guards'
import type { AuthContext } from '@/lib/auth/types'

function ctx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    role: 'EMPLOYEE',
    profileType: 'EMPLOYEE',
    isActive: true,
    profileStatus: 'ACTIVE',
    companyId: 'company-1',
    ...overrides,
  } as AuthContext
}

describe('auth guards', () => {
  describe('requireRole', () => {
    it('passes when the role is in the allowed list', () => {
      expect(() => requireRole(ctx({ role: 'MERCHANT' }), ['MERCHANT', 'SUPER_ADMIN'])).not.toThrow()
    })

    it('throws ForbiddenError when the role is not allowed', () => {
      expect(() => requireRole(ctx({ role: 'EMPLOYEE' }), ['SUPER_ADMIN'])).toThrow(ForbiddenError)
    })
  })

  describe('requireProfileType', () => {
    it('passes when the profile type matches', () => {
      expect(() => requireProfileType(ctx({ profileType: 'MERCHANT' }), ['MERCHANT'])).not.toThrow()
    })

    it('throws ForbiddenError on mismatch', () => {
      expect(() => requireProfileType(ctx({ profileType: 'EMPLOYEE' }), ['MERCHANT'])).toThrow(ForbiddenError)
    })
  })

  describe('requireActive', () => {
    it('passes for an active account with an active profile', () => {
      expect(() => requireActive(ctx())).not.toThrow()
    })

    it('throws AuthError when the account itself is inactive', () => {
      expect(() => requireActive(ctx({ isActive: false }))).toThrow(AuthError)
    })

    it('throws ForbiddenError when the profile status is not ACTIVE', () => {
      expect(() => requireActive(ctx({ profileStatus: 'SUSPENDED' }))).toThrow(ForbiddenError)
    })

    it('allows a missing profileStatus (e.g. admin accounts with no profile)', () => {
      expect(() => requireActive(ctx({ profileStatus: undefined }))).not.toThrow()
    })
  })

  describe('requireCompany', () => {
    it('passes when the companyId matches', () => {
      expect(() => requireCompany(ctx({ companyId: 'company-1' }), 'company-1')).not.toThrow()
    })

    it('throws ForbiddenError on a different company id (tenant isolation)', () => {
      expect(() => requireCompany(ctx({ companyId: 'company-1' }), 'company-2')).toThrow(ForbiddenError)
    })
  })

  describe('role shortcuts', () => {
    it('requireAdmin only allows SUPER_ADMIN', () => {
      expect(() => requireAdmin(ctx({ role: 'SUPER_ADMIN' }))).not.toThrow()
      expect(() => requireAdmin(ctx({ role: 'COMPANY_ADMIN' }))).toThrow(ForbiddenError)
    })

    it('requireMerchant only allows MERCHANT', () => {
      expect(() => requireMerchant(ctx({ role: 'MERCHANT' }))).not.toThrow()
      expect(() => requireMerchant(ctx({ role: 'EMPLOYEE' }))).toThrow(ForbiddenError)
    })

    it('requireEmployee only allows EMPLOYEE', () => {
      expect(() => requireEmployee(ctx({ role: 'EMPLOYEE' }))).not.toThrow()
      expect(() => requireEmployee(ctx({ role: 'MERCHANT' }))).toThrow(ForbiddenError)
    })

    it('requireCompanyAdmin only allows COMPANY_ADMIN', () => {
      expect(() => requireCompanyAdmin(ctx({ role: 'COMPANY_ADMIN' }))).not.toThrow()
      expect(() => requireCompanyAdmin(ctx({ role: 'EMPLOYEE' }))).toThrow(ForbiddenError)
    })
  })
})
