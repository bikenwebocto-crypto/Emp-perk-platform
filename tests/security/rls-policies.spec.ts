import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from 'pg'

/**
 * This app enforces tenant/role isolation at the application layer (see
 * tests/security/tenant-isolation.spec.ts and role-permission-matrix.spec.ts)
 * rather than with Postgres Row Level Security — no `supabase/**` policy
 * files exist in this repo. This suite only verifies that assumption holds
 * and, opportunistically, that RLS hasn't been silently enabled on
 * sensitive tables without app code being updated to expect it.
 *
 * Requires TEST_DATABASE_URL (a disposable test database). Skips entirely
 * when it is not set, matching tests/db and tests/performance.
 */

const connectionString = process.env.TEST_DATABASE_URL
const describeIfDb = connectionString ? describe : describe.skip

describeIfDb('database RLS policy inventory', () => {
  let client: Client

  beforeAll(async () => {
    client = new Client({ connectionString })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  it('reports no row-level-security policies on the core multi-tenant tables', async () => {
    const tables = ['Company', 'Employee', 'Merchant', 'MerchantOffer', 'Redemption']
    const { rows } = await client.query(
      `select tablename, policyname from pg_policies where tablename = ANY($1)`,
      [tables],
    )

    // If this starts failing, RLS was turned on for one of these tables —
    // update the application guards (src/lib/auth/guards.ts) and this
    // suite together rather than silently relying on the new policies.
    expect(rows).toEqual([])
  })

  it('confirms RLS is not force-enabled on the core tables', async () => {
    const { rows } = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity
         from pg_class
        where relname = ANY($1)`,
      [['Company', 'Employee', 'Merchant', 'MerchantOffer', 'Redemption']],
    )

    for (const row of rows) {
      expect(row.relrowsecurity).toBe(false)
    }
  })
})
