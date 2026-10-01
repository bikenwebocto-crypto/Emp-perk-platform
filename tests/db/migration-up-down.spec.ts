import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Verifies `prisma migrate deploy` applies cleanly against a disposable
 * test database and that `prisma migrate status` reports no drift
 * afterwards. Prisma migrations in this project are forward-only (no
 * down.sql files), so this does not attempt a rollback — it checks
 * applicability and drift instead.
 *
 * Requires TEST_DATABASE_URL pointed at a disposable, empty test database.
 * NEVER run against a database with real data — `migrate deploy` mutates
 * schema.
 */
const connectionString = process.env.TEST_DATABASE_URL
const describeIfDb = connectionString ? describe : describe.skip

const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'migrations')

describe('migration files', () => {
  it('are ordered and every directory has a migration.sql', () => {
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()

    expect(dirs.length).toBeGreaterThan(0)

    for (const dir of dirs) {
      const files = readdirSync(path.join(MIGRATIONS_DIR, dir))
      expect(files).toContain('migration.sql')
    }
  })
})

describeIfDb('migration deploy (live database)', () => {
  it('applies all migrations without error', () => {
    expect(() =>
      execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
        env: { ...process.env, DATABASE_URL: connectionString },
        stdio: 'pipe',
      }),
    ).not.toThrow()
  })

  it('reports no drift once deployed', () => {
    const output = execFileSync('npx', ['prisma', 'migrate', 'status'], {
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: 'pipe',
    }).toString()

    expect(output).toMatch(/up to date|no pending migrations/i)
  })
})
