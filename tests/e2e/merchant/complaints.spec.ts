import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function merchantOrSkip() {
  const m = getUser('MERCHANT')
  test.skip(!m, 'E2E_MERCHANT_* credentials not configured')
  return m!
}

test.describe('merchant issue reports', () => {
  test('issues screen renders', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      await s.page.goto('/merchant/issues')
      await expect(s.page).toHaveURL(/.*\/merchant\/issues/, { timeout: 20_000 })
    } finally {
      await s.page.context().close()
    }
  })

  test('merchants cannot read the employee complaints endpoint', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      const res = await s.api.get('/api/complaints')
      expect([401, 403, 404]).toContain(res.status())
    } finally {
      await s.page.context().close()
    }
  })
})
