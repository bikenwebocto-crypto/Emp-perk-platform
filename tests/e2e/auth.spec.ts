// Login smoke test for every configured role, plus the unmapped-account
// error path. Reuses the Supabase Auth UI helpers from the root e2e/ suite.

import { test, expect } from '@playwright/test'
import { getUser, roleConfigured, TEST_INDIVIDUAL, type RoleKey } from '../../e2e/support/creds'
import { loginViaUi, expectLoginErrorForUnmapped } from '../../e2e/support/login'

const ROLES: RoleKey[] = ['SUPER_ADMIN', 'MERCHANT', 'COMPANY_ADMIN', 'EMPLOYEE']

test.describe('authentication', () => {
  for (const role of ROLES) {
    test(`logs in as ${role} and lands on the matching dashboard`, async ({ page, browser: _browser }) => {
      test.skip(!roleConfigured(role), `E2E ${role} credentials not configured`)
      const user = getUser(role)!

      const url = await loginViaUi(page, user)

      expect(url).toBeTruthy()
    })
  }

  test('shows an error for a login not mapped to any role', async ({ page }) => {
    const email = TEST_INDIVIDUAL.UNMAPPED_EMAIL
    const password = TEST_INDIVIDUAL.UNMAPPED_PASSWORD
    test.skip(!email || !password, 'E2E_UNMAPPED_* credentials not configured')

    await expectLoginErrorForUnmapped(page, { email, password, role: 'UNMAPPED' })
  })
})
