import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  getCurrentUser: vi.fn(),
}))

import { getCurrentUser } from '@/lib/supabase/server'
import { getEmployeeFromSession } from '@/lib/employee-session'

const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>

describe('employee company access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows employee access only while the company is ACTIVE', () => {
    const employee = {
      id: 'employee-auth-id',
      email: 'employee@example.com',
      userType: 'employee',
      profileId: 'employee-profile-id',
      profile: { firstName: 'Ada', lastName: 'Lovelace', status: 'ACTIVE' },
      companyId: 'company-id',
      companyStatus: 'ACTIVE',
    }
    currentUser.mockResolvedValue(employee)

    return expect(getEmployeeFromSession()).resolves.toMatchObject({
      id: 'employee-profile-id',
      companyId: 'company-id',
      companyStatus: 'ACTIVE',
    })
  })

  it.each(['PENDING', 'APPROVED_PENDING_PAYMENT', 'PAUSED', 'SUSPENDED', 'CANCELLED'])(
    'returns an inactive sentinel for %s companies',
    async (companyStatus) => {
      currentUser.mockResolvedValue({
        id: 'employee-auth-id',
        email: 'employee@example.com',
        userType: 'employee',
        profileId: 'employee-profile-id',
        profile: { firstName: 'Ada', lastName: 'Lovelace', status: 'ACTIVE' },
        companyId: 'company-id',
        companyStatus,
      })

      await expect(getEmployeeFromSession()).resolves.toEqual({
        inactive: true,
        companyStatus,
        message: "Your company's access is currently inactive.",
      })
    },
  )
})
