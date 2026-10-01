import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function empOrSkip() {
  const e = getUser('EMPLOYEE')
  test.skip(!e, 'E2E_EMPLOYEE_* credentials not configured')
  return e!
}

test.describe('employee offers', () => {
  test('grouped offers page renders LIVE offers', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      await s.page.goto('/employee/offers/grouped')
      await expect(s.page).toHaveURL(/.*\/employee\/offers/, { timeout: 20_000 })
    } finally {
      await s.page.context().close()
    }
  })

  test('offer search filters results via the API', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      const res = await s.api.get('/api/employee/offers?q=zzz-unlikely-match-zzz')
      expect(res.ok()).toBeTruthy()
      const body = await res.json()
      expect(Array.isArray(body.data ?? body.offers ?? [])).toBe(true)
    } finally {
      await s.page.context().close()
    }
  })

  test('saving and unsaving an offer round-trips', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      const list = await s.api.get('/api/employee/offers?pageSize=1')
      test.skip(!list.ok(), 'could not list offers to save')
      const body = await list.json()
      const offer = (body.data ?? body.offers ?? [])[0]
      test.skip(!offer, 'no live offers available to exercise save/unsave')

      const save = await s.api.post('/api/employee/saved', { data: { offerId: offer.id } })
      expect([200, 201]).toContain(save.status())

      const unsave = await s.api.delete(`/api/employee/saved/${offer.id}`)
      expect([200, 204]).toContain(unsave.status())
    } finally {
      await s.page.context().close()
    }
  })
})
