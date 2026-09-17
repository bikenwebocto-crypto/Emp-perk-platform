import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function empOrSkip() {
  const e = getUser('EMPLOYEE')
  test.skip(!e, 'E2E_EMPLOYEE_* credentials not configured')
  return e!
}

test.describe('employee redemption', () => {
  test('redemption history page renders', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      await s.page.goto('/employee/redeem')
      await expect(s.page).toHaveURL(/.*\/employee\/redeem/, { timeout: 20_000 })
    } finally {
      await s.page.context().close()
    }
  })

  test('redeeming a non-existent offer returns 404, not a 500', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      const res = await s.api.post('/api/employee/redeem', {
        data: { offerId: '00000000-0000-0000-0000-000000000000' },
      })
      expect(res.status()).toBe(404)
    } finally {
      await s.page.context().close()
    }
  })

  test('redeeming without an offerId is rejected with 400', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      const res = await s.api.post('/api/employee/redeem', { data: {} })
      expect(res.status()).toBe(400)
    } finally {
      await s.page.context().close()
    }
  })
})
