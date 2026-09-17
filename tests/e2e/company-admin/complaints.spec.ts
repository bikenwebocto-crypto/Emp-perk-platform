import { test, expect, type Browser } from '@playwright/test'
import { getUser } from '../../../e2e/support/creds'
import { authed } from '../../../e2e/support/session'

function companyAdminOrSkip() {
  const c = getUser('COMPANY_ADMIN')
  test.skip(!c, 'E2E_COMPANY_ADMIN_* credentials not configured')
  return c!
}

test.describe('company admin complaints', () => {
  test('escalated complaints list responds', async ({ browser }) => {
    const admin = companyAdminOrSkip()
    const s = await authed(browser, admin)
    try {
      const res = await s.api.get('/api/complaints/escalated')
      expect(res.ok()).toBeTruthy()
    } finally {
      await s.page.context().close()
    }
  })

  test('escalating a complaint requires a reason', async ({ browser }) => {
    const admin = companyAdminOrSkip()
    const s = await authed(browser, admin)
    try {
      const res = await s.api.post('/api/complaints/00000000-0000-0000-0000-000000000000/escalate', {
        data: {},
      })
      expect(res.status()).toBe(400)
    } finally {
      await s.page.context().close()
    }
  })

  test('cannot escalate a complaint that does not belong to this company', async ({ browser }) => {
    const admin = companyAdminOrSkip()
    const s = await authed(browser, admin)
    try {
      const res = await s.api.post('/api/complaints/00000000-0000-0000-0000-000000000000/escalate', {
        data: { reason: 'needs attention' },
      })
      expect(res.status()).toBe(404)
    } finally {
      await s.page.context().close()
    }
  })
})
