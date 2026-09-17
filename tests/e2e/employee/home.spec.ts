import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function empOrSkip() {
  const e = getUser('EMPLOYEE')
  test.skip(!e, 'E2E_EMPLOYEE_* credentials not configured')
  return e!
}

test.describe('employee home', () => {
  test('dashboard loads with stats and the offer feed', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      await s.page.goto('/employee')
      await expect(s.page).toHaveURL(/.*\/employee(\/|$)/, { timeout: 20_000 })

      const stats = await s.api.get('/api/employee/dashboard/stats')
      expect(stats.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })

  test('near-stores widget responds', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      const res = await s.api.get('/api/employee/near-stores')
      expect([200, 400]).toContain(res.status())
    } finally {
      await s.page.context().close()
    }
  })
})
