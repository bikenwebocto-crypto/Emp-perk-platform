import { test, expect } from '@playwright/test'

// Runs under Playwright's "tablet" project (iPad Mini viewport), see
// tests/playwright.config.ts.
test.describe('tablet viewport', () => {
  test('login page has no horizontal overflow', async ({ page }) => {
    await page.goto('/login')
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow).toBe(false)
  })
})
