import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function adminOrSkip() {
  const a = getUser('SUPER_ADMIN')
  test.skip(!a, 'E2E_SUPER_ADMIN_* credentials not configured')
  return a!
}

test.describe('super admin', () => {
  test('overview dashboard renders', async ({ browser }) => {
    const admin = adminOrSkip()
    const s = await authed(browser, admin)
    try {
      await s.page.goto('/admin')
      await expect(s.page).toHaveURL(/.*\/admin(\/|$)/, { timeout: 20_000 })

      const overview = await s.api.get('/api/admin/overview')
      expect(overview.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })

  test('companies list responds', async ({ browser }) => {
    const admin = adminOrSkip()
    const s = await authed(browser, admin)
    try {
      const res = await s.api.get('/api/admin/companies')
      expect(res.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })

  test('merchants list responds', async ({ browser }) => {
    const admin = adminOrSkip()
    const s = await authed(browser, admin)
    try {
      const res = await s.api.get('/api/admin/merchants')
      expect(res.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })

  test('action queue stats respond', async ({ browser }) => {
    const admin = adminOrSkip()
    const s = await authed(browser, admin)
    try {
      const res = await s.api.get('/api/admin/action-queue/stats')
      expect(res.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })
})
