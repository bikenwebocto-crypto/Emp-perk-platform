import { describe, it, expect } from 'vitest'

/**
 * Replaces the old ad-hoc tests/test-latency.js script. Measures response
 * time for a handful of read-heavy API routes against a running app
 * instance (E2E_BASE_URL), rather than Prisma connection latency directly
 * (see tests/db/db-latency.spec.ts for that).
 *
 * Requires the app to be running at E2E_BASE_URL. Skips entirely when
 * that server is unreachable, so this suite is safe to leave in CI.
 */
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

async function serverIsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/categories`, { signal: AbortSignal.timeout(3000) })
    return res.status < 500
  } catch {
    return false
  }
}

async function timeRequest(path: string): Promise<number> {
  const start = performance.now()
  await fetch(`${BASE_URL}${path}`)
  return performance.now() - start
}

describe('API response-time budget', () => {
  it('public endpoints respond within budget', async (ctx) => {
    if (!(await serverIsUp())) {
      ctx.skip()
      return
    }

    const routes = ['/api/categories', '/api/banners/active', '/api/banners/positions']

    for (const route of routes) {
      const samples: number[] = []
      for (let i = 0; i < 5; i++) {
        samples.push(await timeRequest(route))
      }
      samples.sort((a, b) => a - b)
      const p95 = samples[Math.floor(samples.length * 0.95)]

      expect(p95, `${route} p95`).toBeLessThan(2000)
    }
  })
})
