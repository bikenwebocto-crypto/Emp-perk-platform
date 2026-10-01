import { test, expect } from '@playwright/test'

// Runs under Playwright's default browser project (see
// tests/playwright.config.ts) at its standard desktop viewport.
test.describe('desktop viewport', () => {
  test('login page has no horizontal overflow', async ({ page }) => {
    await page.goto('/login')
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(hasOverflow).toBe(false)
  })
})
