import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function merchantOrSkip() {
  const m = getUser('MERCHANT')
  test.skip(!m, 'E2E_MERCHANT_* credentials not configured')
  return m!
}

test.describe('merchant dashboard', () => {
  test('landing page renders and analytics summary responds', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      await s.page.goto('/merchant')
      await expect(s.page).toHaveURL(/.*\/merchant(\/|$)/, { timeout: 20_000 })

      const summary = await s.api.get('/api/merchant/analytics/summary')
      expect(summary.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })
})
