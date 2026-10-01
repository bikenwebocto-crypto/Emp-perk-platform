import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function merchantOrSkip() {
  const m = getUser('MERCHANT')
  test.skip(!m, 'E2E_MERCHANT_* credentials not configured')
  return m!
}

test.describe('merchant banners', () => {
  test('available banner slots list responds', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      const res = await s.api.get('/api/merchant/banners/slots')
      expect(res.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })

  test('booking a slot with an invalid date range is rejected', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      const res = await s.api.post('/api/merchant/banners/book', {
        data: { bannerId: '00000000-0000-0000-0000-000000000000', startDate: '2026-01-10', endDate: '2026-01-01' },
      })
      expect(res.status()).toBeGreaterThanOrEqual(400)
      expect(res.status()).toBeLessThan(500)
    } finally {
      await s.page.context().close()
    }
  })
})
