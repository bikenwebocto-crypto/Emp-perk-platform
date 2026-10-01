import { test, expect } from '@playwright/test'

// Runs under Playwright's "mobile" project (iPhone 13 viewport), see
// tests/playwright.config.ts. Unauthenticated pages only — authenticated
// dashboards are covered per-role under tests/e2e/**.
test.describe('mobile viewport', () => {
  test('login page has no horizontal overflow', async ({ page }) => {
    await page.goto('/login')
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow).toBe(false)
  })

  test('login form fields remain usable at mobile width', async ({ page }) => {
    await page.goto('/login')
    const email = page.locator('input[name="email"]').first()
    await email.waitFor({ state: 'attached', timeout: 15_000 })
    const box = await email.boundingBox()
    expect(box?.width).toBeGreaterThan(0)
  })
})
