// UI authentication helper for Supabase Auth UI (ThemeSupa) rendered on /login.
// The auth widget renders inputs with name=email / name=password and a submit button.
// After SIGNED_IN, login-client.tsx calls POST /api/auth/sync-admin then pushes to redirectTo.

import { expect, type Page } from '@playwright/test'
import type { TestUser } from './creds'
import { BASE_URL } from './creds'

const DASHBOARD_BY_ROLE: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  MERCHANT: '/merchant',
  COMPANY_ADMIN: '/company',
  EMPLOYEE: '/employee',
}

export async function loginViaUi(page: Page, user: TestUser, expectedRole?: string): Promise<string> {
  await page.goto('/login')
  await page.getByRole('heading').first().waitFor({ state: 'visible' }).catch(() => {})

  const emailInput = page.locator('#login-email, input[name="email"]').first()
  await emailInput.waitFor({ state: 'attached', timeout: 15_000 })
  await emailInput.fill(user.email)

  const passwordInput = page.locator('#login-password, input[name="password"]').first()
  await passwordInput.fill(user.password)

  const submit = page.locator('button[type="submit"]').first()
  await submit.click()

  const dashboard = DASHBOARD_BY_ROLE[user.role] ?? DASHBOARD_BY_ROLE[expectedRole ?? ''] ?? '/employee'
  const escaped = dashboard.replace(/\//g, '\\/').replace(/-/g, '\\-')
  await page.waitForURL(new RegExp(`${escaped}($|\\/)`), { timeout: 30_000 })
  return page.url()
}

export async function loginViaUiAndCapture(page: Page, user: TestUser): Promise<{ url: string; cookies: Awaited<ReturnType<Page['context']['cookies']>> }> {
  await loginViaUi(page, user)
  const cookies = await page.context().cookies()
  return { url: page.url(), cookies }
}

export async function expectLoginErrorForUnmapped(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login')
  await page.locator('#login-email, input[name="email"]').first().waitFor({ state: 'attached', timeout: 15_000 })
  await page.locator('#login-email, input[name="email"]').first().fill(user.email)
  await page.locator('#login-password, input[name="password"]').first().fill(user.password)
  await page.locator('button[type="submit"]').first().click()
  // Not mapped -> error box, stays on /login for up to 30s.
  await expect(page).toHaveURL(new RegExp(`${BASE_URL}/login`), { timeout: 30_000 })
  await expect(page.getByText(/not mapped|contact your administrator/i).first()).toBeVisible({ timeout: 20_000 })
}