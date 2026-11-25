import { test, expect } from '@playwright/test'
import { getUser, runId } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

// Merchant workflow for the new offer fields: channel (In-store / Online / Both),
// branch selection and frequency. Saves a draft through the real form, checks what
// the API stored, then reopens the edit page to confirm the values load back.
// The admin approval step needs E2E_SUPER_ADMIN_* and is skipped without it.

function merchantOrSkip() {
  const m = getUser('MERCHANT')
  test.skip(!m, 'E2E_MERCHANT_* credentials not configured')
  return m!
}

test.describe('merchant offer channel + frequency', () => {
  test('draft keeps channel, branches and frequency', async ({ browser }) => {
    test.setTimeout(120_000)
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    const title = `E2E channel ${runId()}`.slice(0, 40)
    let offerId: string | undefined
    try {
      const { page, api } = s
      await page.goto('/merchant/offers/create')
      await page.locator('#title').fill(title)

      // Channel: Both → branch picker appears.
      const channel = page.getByRole('radiogroup', { name: 'Channel' })
      await channel.getByRole('radio', { name: 'Both' }).click()
      await expect(channel.getByRole('radio', { name: 'Both' })).toHaveAttribute('aria-checked', 'true')

      // Branches: pick the first in-store branch; with none, fall back to "All branches"
      // (allowed for a draft).
      const branchGroup = page.getByRole('radiogroup', { name: 'Branches' })
      await branchGroup.getByRole('radio', { name: 'Choose branches' }).click()
      const firstBranch = page.locator('label:has(input[type="checkbox"])').first()
      const noBranches = page.getByText('You have no in-store branches yet')
      await expect(firstBranch.or(noBranches)).toBeVisible({ timeout: 15_000 })
      const hasBranch = await firstBranch.isVisible()
      if (hasBranch) await firstBranch.locator('input[type="checkbox"]').check()
      else await branchGroup.getByRole('radio', { name: 'All branches' }).click()
      const pickMode = hasBranch ? 'Choose branches' : 'All branches'

      // Frequency: once a day.
      await page.locator('#frequency').selectOption('DAY')

      const saved = page.waitForResponse(
        (r) => r.url().endsWith('/api/merchant/offers') && r.request().method() === 'POST',
        { timeout: 30_000 },
      )
      await page.getByRole('button', { name: 'Save as draft' }).click()
      const saveRes = await saved
      expect(saveRes.status(), await saveRes.text()).toBe(201)

      // What the API stored.
      const list = await api.get(`/api/merchant/offers?search=${encodeURIComponent(title)}&pageSize=10`)
      expect(list.ok()).toBeTruthy()
      const listJson = JSON.stringify(await list.json())
      offerId = listJson.match(new RegExp(`"id":"([0-9a-f-]{36})"[^{}]*"title":"${title}"`))?.[1]
        ?? listJson.match(new RegExp(`"title":"${title}"[^{}]*"id":"([0-9a-f-]{36})"`))?.[1]
      expect(offerId, 'saved draft found in offer list').toBeTruthy()

      const detail = await api.get(`/api/merchant/offers/${offerId}`)
      expect(detail.ok()).toBeTruthy()
      const data = (await detail.json()).data
      expect(data.channel).toBe('BOTH')
      expect(data.allBranches).toBe(!hasBranch)
      expect(data.branchIds).toHaveLength(hasBranch ? 1 : 0)
      expect(data.repeatAfterHours).toBe(24)

      // Edit page loads the same values back.
      await page.goto(`/merchant/offers/${offerId}/edit`)
      await expect(
        page.getByRole('radiogroup', { name: 'Channel' }).getByRole('radio', { name: 'Both' }),
      ).toHaveAttribute('aria-checked', 'true', { timeout: 20_000 })
      await expect(
        page.getByRole('radiogroup', { name: 'Branches' }).getByRole('radio', { name: pickMode }),
      ).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator('#frequency')).toHaveValue('DAY')
    } finally {
      if (offerId) await s.api.delete(`/api/merchant/offers/${offerId}`).catch(() => {})
      await s.page.context().close()
    }
  })

  test('online-only offer hides the branch picker', async ({ browser }) => {
    const merchant = merchantOrSkip()
    const s = await authed(browser, merchant)
    try {
      await s.page.goto('/merchant/offers/create')
      await s.page.getByRole('radiogroup', { name: 'Channel' }).getByRole('radio', { name: 'Online' }).click()
      await expect(s.page.getByRole('radiogroup', { name: 'Branches' })).toHaveCount(0)
      await s.page.getByRole('radiogroup', { name: 'Channel' }).getByRole('radio', { name: 'In-store' }).click()
      await expect(s.page.getByRole('radiogroup', { name: 'Branches' })).toBeVisible()
    } finally {
      await s.page.context().close()
    }
  })

  test('admin approval (needs super-admin login)', async () => {
    test.skip(!getUser('SUPER_ADMIN'), 'E2E_SUPER_ADMIN_* credentials not configured')
    test.fixme(true, 'Approval flow to be added once a super-admin test account is available')
  })
})
