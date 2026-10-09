import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const run = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/lib/queue/offer-expiry-scheduler', () => ({
  OfferExpiryScheduler: class {
    run = run
  },
}))

import { GET, POST } from '@/app/api/cron/expire-offers/route'

function req(auth?: string) {
  return new Request('http://localhost/api/cron/expire-offers', {
    headers: auth ? { authorization: auth } : {},
  }) as any
}

describe('/api/cron/expire-offers', () => {
  const original = process.env.CRON_SECRET
  beforeEach(() => {
    run.mockClear()
    process.env.CRON_SECRET = 'test-secret'
  })
  afterEach(() => {
    process.env.CRON_SECRET = original
  })

  it('rejects requests without the secret', async () => {
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer wrong'))).status).toBe(401)
    expect(run).not.toHaveBeenCalled()
  })

  it('refuses to run when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(req('Bearer '))).status).toBe(500)
    expect(run).not.toHaveBeenCalled()
  })

  it('runs the expiry job with the correct secret (GET and POST)', async () => {
    expect((await GET(req('Bearer test-secret'))).status).toBe(200)
    expect((await POST(req('Bearer test-secret'))).status).toBe(200)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
