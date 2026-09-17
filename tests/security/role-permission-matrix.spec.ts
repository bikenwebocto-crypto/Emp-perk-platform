import { describe, it, expect } from 'vitest'
import {
  ForbiddenError,
  requireAdmin,
  requireMerchant,
  requireEmployee,
  requireCompanyAdmin,
} from '@/lib/auth/guards'
import type { AuthContext } from '@/lib/auth/types'

type Role = 'SUPER_ADMIN' | 'MERCHANT' | 'COMPANY_ADMIN' | 'EMPLOYEE'

const ROLES: Role[] = ['SUPER_ADMIN', 'MERCHANT', 'COMPANY_ADMIN', 'EMPLOYEE']

function ctxWithRole(role: Role): AuthContext {
  return { role, profileType: role, isActive: true, profileStatus: 'ACTIVE' } as AuthContext
}

// One row per (guard, role): true = the guard must ALLOW that role.
const MATRIX: Record<string, (ctx: AuthContext) => void> = {
  requireAdmin,
  requireMerchant,
  requireEmployee,
  requireCompanyAdmin,
}

const EXPECTED_ALLOWED: Record<keyof typeof MATRIX, Role> = {
  requireAdmin: 'SUPER_ADMIN',
  requireMerchant: 'MERCHANT',
  requireEmployee: 'EMPLOYEE',
  requireCompanyAdmin: 'COMPANY_ADMIN',
}

describe('role/permission matrix', () => {
  for (const [guardName, guard] of Object.entries(MATRIX)) {
    const allowedRole = EXPECTED_ALLOWED[guardName as keyof typeof MATRIX]

    describe(guardName, () => {
      for (const role of ROLES) {
        const shouldAllow = role === allowedRole

        it(`${shouldAllow ? 'allows' : 'denies'} role=${role}`, () => {
          if (shouldAllow) {
            expect(() => guard(ctxWithRole(role))).not.toThrow()
          } else {
            expect(() => guard(ctxWithRole(role))).toThrow(ForbiddenError)
          }
        })
      }
    })
  }

  it('every role has exactly one guard that allows it (no privilege overlap)', () => {
    for (const role of ROLES) {
      const allowingGuards = Object.entries(MATRIX).filter(([, guard]) => {
        try {
          guard(ctxWithRole(role))
          return true
        } catch {
          return false
        }
      })
      expect(allowingGuards).toHaveLength(1)
    }
  })
})
