import { defineConfig, devices } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'

// Minimal .env loader (no external dep): root .env.test for credentials
// and base URLs used by this suite.
function loadEnv(file: string) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, raw] = m
    let value = raw.trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}
loadEnv(path.resolve(__dirname, '..', '.env'))
loadEnv(path.resolve(__dirname, '..', '.env.test'))
loadEnv(path.resolve(__dirname, '.env.test'))

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const browser = (process.env.E2E_BROWSER || 'chromium') as 'chromium' | 'firefox' | 'webkit'

const deviceMap: Record<string, typeof devices['Desktop Chrome']> = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
}

// External base URL only: the app is expected to be running already.
// Set E2E_BASE_URL (and unset E2E_WEB_SERVER_START) to point at a deployed
// or pre-started instance; there is intentionally no webServer block.
const startWebServer = process.env.E2E_WEB_SERVER_START === 'true'

export default defineConfig({
  testDir: '.',
  testMatch: [
    'e2e/**/*.spec.ts',
    'responsive/**/*.spec.ts',
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 15_000 },

  globalSetup: path.resolve(__dirname, 'e2e', 'global-setup.ts'),
  outputDir: path.resolve(__dirname, '..', 'test-results'),

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.resolve(__dirname, '..', 'playwright-report') }],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: browser, use: { ...deviceMap[browser] } },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: ['responsive/mobile.spec.ts'],
    },
    {
      name: 'tablet',
      use: { ...devices['iPad Mini'] },
      testMatch: ['responsive/tablet.spec.ts'],
    },
  ],

  ...(startWebServer
    ? {
        webServer: {
          command: process.env.E2E_WEB_SERVER_COMMAND || 'npm run dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
})