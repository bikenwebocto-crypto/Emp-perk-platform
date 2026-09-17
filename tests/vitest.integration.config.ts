import { defineConfig } from 'vitest/config'
import path from 'path'

// Integration-test config: exercises Next.js route handlers and business
// seams directly (node environment) with a mocked DB/session layer. No live
// Postgres required — the optional latency probes in tests/db and
// tests/performance skip themselves when TEST_DATABASE_URL is not set.
// Run separately from the unit suite via `npm run test:integration`.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/integration/**/*.spec.ts',
      'tests/security/**/*.spec.ts',
      'tests/state-machine/**/*.spec.ts',
      'tests/db/**/*.spec.ts',
      'tests/performance/**/*.spec.ts',
      'tests/uploads/**/*.spec.ts',
      'tests/i18n-currency/**/*.spec.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Route-handler tests share mocked module state; run sequentially
    // per-file to keep session/prisma mocks deterministic.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
  },
})