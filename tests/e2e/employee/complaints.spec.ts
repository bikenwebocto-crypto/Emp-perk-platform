import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function empOrSkip() {
  const e = getUser('EMPLOYEE')
  test.skip(!e, 'E2E_EMPLOYEE_* credentials not configured')
  return e!
}

test.describe('employee complaints', () => {
  test('submitting a complaint without required fields is rejected', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      const res = await s.api.post('/api/complaints', { data: {} })
      expect(res.status()).toBe(400)
    } finally {
      await s.page.context().close()
    }
  })

  test('lists the employee’s own complaints', async ({ browser }) => {
    const emp = empOrSkip()
    const s = await authed(browser, emp)
    try {
      const res = await s.api.get('/api/complaints')
      expect(res.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })
})
