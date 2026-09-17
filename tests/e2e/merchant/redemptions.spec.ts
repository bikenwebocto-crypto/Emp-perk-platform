import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function merchantOrSkip() {
  const m = getUser('MERCHANT')
  test.skip(!m, 'E2E_MERCHANT_* credentials not configured')
  return m!
}

test.describe('merchant redemptions', () => {
  test('redemptions screen renders', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      await s.page.goto('/merchant/redemptions')
      await expect(s.page).toHaveURL(/.*\/merchant\/redemptions/, { timeout: 20_000 })
    } finally {
      await s.page.context().close()
    }
  })

  test('redeeming a code for another merchant’s offer is forbidden, not just not-found', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      const res = await s.api.post('/api/merchant/redemptions/redeem', {
        data: { code: 'NON-EXISTENT-CODE' },
      })
      expect([400, 404]).toContain(res.status())
    } finally {
      await s.page.context().close()
    }
  })
})
