import { describe, expect, it } from 'vitest'
import { canActivatePendingCompany, isCompanyAccessPending } from '@/lib/access/company-access'

describe('isCompanyAccessPending', () => {
  it.each(['PENDING', 'APPROVED_PENDING_PAYMENT'])('treats %s as access-pending', (status) => {
    expect(isCompanyAccessPending(status)).toBe(true)
  })

  describe('canActivatePendingCompany', () => {
    it('requires payment-stage approval and Super Admin activation while preserving reactivation', () => {
      expect(canActivatePendingCompany('PENDING', 'ADMIN')).toBe(false)
      expect(canActivatePendingCompany('PENDING', 'SUPER_ADMIN')).toBe(false)
      expect(canActivatePendingCompany('APPROVED_PENDING_PAYMENT', 'ADMIN')).toBe(false)
      expect(canActivatePendingCompany('APPROVED_PENDING_PAYMENT', 'SUPER_ADMIN')).toBe(true)
      expect(canActivatePendingCompany('PAUSED', 'ADMIN')).toBe(true)
    })
  })

  it.each(['ACTIVE', 'PAUSED', 'SUSPENDED', 'CANCELLED', null, undefined])(
    'does not treat %s as access-pending',
    (status) => {
      expect(isCompanyAccessPending(status)).toBe(false)
    },
  )
})
