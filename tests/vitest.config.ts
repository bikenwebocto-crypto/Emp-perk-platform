import { defineConfig } from 'vitest/config'
import path from 'path'

// Unit-test config: fast, isolated, no network/db access.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.spec.ts', 'src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'tests/e2e', 'tests/integration'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'tests', '**/*.d.ts', '**/*.config.*'],
    },
    mockReset: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
  },
})