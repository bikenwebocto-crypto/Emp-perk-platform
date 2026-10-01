import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

/**
 * Replaces the old ad-hoc tests/test-latency-pg.js script. Connects with
 * the `pg` driver directly (no Prisma layer) to isolate network/connection
 * latency from query-planning overhead.
 *
 * Requires TEST_DATABASE_URL pointed at a disposable test database — never
 * hard-code a connection string here (the old script did, with live
 * credentials committed to the repo; that credential should be rotated).
 */
const connectionString = process.env.TEST_DATABASE_URL
const describeIfDb = connectionString ? describe : describe.skip

describeIfDb('database connection latency', () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString })
  })

  afterAll(async () => {
    await client?.end()
  })

  it('establishes a connection within a reasonable budget', async () => {
    const start = Date.now()
    await client.connect()
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(5000)
  })

  it('runs 10 sequential SELECT 1 round trips with acceptable p95 latency', async () => {
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      const start = Date.now()
      await client.query('SELECT 1')
      samples.push(Date.now() - start)
    }

    samples.sort((a, b) => a - b)
    const p95 = samples[Math.floor(samples.length * 0.95)]

    expect(p95).toBeLessThan(1000)
  })
})
