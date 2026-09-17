import { describe, it, expect } from 'vitest'

/**
 * Measures time-to-first-byte for a handful of public, unauthenticated
 * pages against a running app instance. Authenticated dashboards are
 * intentionally excluded — TTFB there is dominated by auth/session
 * round trips already covered by tests/e2e specs.
 *
 * Requires the app to be running at E2E_BASE_URL; skips when unreachable.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

async function serverIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/login`, { signal: AbortSignal.timeout(3000) })
    return res.status < 500
  } catch {
    return false
  }
}

async function timePage(path: string): Promise<number> {
  const start = performance.now()
  const res = await fetch(`${BASE_URL}${path}`)
  await res.text()
  return performance.now() - start
}

describe('page load-time budget', () => {
  it('public pages render within budget', async (ctx) => {
    if (!(await serverIsUp())) {
      ctx.skip()
      return
    }

    const pages = ['/login', '/']

    for (const page of pages) {
      const samples: number[] = []
      for (let i = 0; i < 3; i++) {
        samples.push(await timePage(page))
      }
      const max = Math.max(...samples)

      expect(max, `${page} max load time`).toBeLessThan(5000)
    }
  })
})
