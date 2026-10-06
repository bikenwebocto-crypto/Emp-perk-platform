import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

/**
 * Exercises the Postgres-backed RateLimiter against a real database, including
 * the fixed-window reset.
 *
 * Guard: the limiter under test uses the shared `@/lib/prisma` client, which
 * reads DATABASE_URL. This spec only runs when DATABASE_URL is explicitly set to
 * the same disposable database as TEST_DATABASE_URL, so it can never write
 * counters to the `.env` database.
 */
const testUrl = process.env.TEST_DATABASE_URL
const sameDisposableDb = !!testUrl && process.env.DATABASE_URL === testUrl
const describeIfDb = sameDisposableDb ? describe : describe.skip

let db: PrismaClient

beforeAll(async () => {
  db = new PrismaClient({ datasources: { db: { url: testUrl as string } } })
})

afterAll(async () => {
  await db.$disconnect()
})

describeIfDb('postgres rate limiter', () => {
  it('is exported through the swappable interface with a declared backend', async () => {
    const { getRateLimiter, setRateLimiter } = await import('@/lib/rate-limit')

    expect(getRateLimiter().backend).toBe('postgres')

    const stub = { backend: 'stub', consume: vi.fn(), reset: vi.fn() } as never
    setRateLimiter(stub)
    expect(getRateLimiter()).toBe(stub)
    setRateLimiter(null)
  })

  it('allows requests up to the limit, denies the next one, and resets on demand', async () => {
    const { getRateLimiter } = await import('@/lib/rate-limit')
    const limiter = getRateLimiter()
    const key = `test:rate-limit:${Date.now()}`
    const options = { limit: 2, windowMs: 60_000 }

    const first = await limiter.consume(key, options)
    expect(first).toMatchObject({ allowed: true, remaining: 1 })

    const second = await limiter.consume(key, options)
    expect(second).toMatchObject({ allowed: true, remaining: 0 })

    const third = await limiter.consume(key, options)
    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
    expect(third.retryAfterSeconds).toBeGreaterThan(0)

    // The counter survives a fresh read, i.e. it is not process-local memory.
    const stored = await db.rateLimitCounter.findUnique({ where: { key } })
    expect(stored?.count).toBe(2)

    await limiter.reset(key)
    expect(await db.rateLimitCounter.findUnique({ where: { key } })).toBeNull()

    const afterReset = await limiter.consume(key, options)
    expect(afterReset.allowed).toBe(true)

    await limiter.reset(key)
  })

  it('keeps counters for different keys independent', async () => {
    const { getRateLimiter } = await import('@/lib/rate-limit')
    const limiter = getRateLimiter()
    const suffix = Date.now()
    const options = { limit: 1, windowMs: 60_000 }

    expect((await limiter.consume(`test:rl-a:${suffix}`, options)).allowed).toBe(true)
    expect((await limiter.consume(`test:rl-a:${suffix}`, options)).allowed).toBe(false)
    expect((await limiter.consume(`test:rl-b:${suffix}`, options)).allowed).toBe(true)

    await limiter.reset(`test:rl-a:${suffix}`)
    await limiter.reset(`test:rl-b:${suffix}`)
  })
})