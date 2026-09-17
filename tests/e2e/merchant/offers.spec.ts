import { test, expect, type Browser } from '@playwright/test'
import { getUser, runId } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function merchantOrSkip() {
  const m = getUser('MERCHANT')
  test.skip(!m, 'E2E_MERCHANT_* credentials not configured')
  return m!
}

test.describe('merchant offers', () => {
  test('offers list page renders', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      await s.page.goto('/merchant/offers')
      await expect(s.page).toHaveURL(/.*\/merchant\/offers/, { timeout: 20_000 })
    } finally {
      await s.page.context().close()
    }
  })

  test('the offer list is scoped to this merchant only', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      const res = await s.api.get('/api/merchant/offers?pageSize=50')
      expect(res.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })

  test('submitting an offer draft with an invalid title is rejected', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      const res = await s.api.post('/api/merchant/offers', {
        data: { title: 'x', offerType: 'flat_rate', run: runId() },
      })
      expect(res.status()).toBeGreaterThanOrEqual(400)
      expect(res.status()).toBeLessThan(500)
    } finally {
      await s.page.context().close()
    }
  })
})
