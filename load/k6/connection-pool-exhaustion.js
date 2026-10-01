// k6 load test: database connection-pool exhaustion probe.
// Hammers several DB-backed read endpoints concurrently to find the point
// where the Prisma/pg connection pool saturates and request latency or
// error rate spikes — useful for sizing PgBouncer/pool settings.
//
// Usage:
//   BASE_URL=https://staging.perksandmore.com \
//   SUPABASE_URL=https://<project-ref>.supabase.co \
//   SUPABASE_ANON_KEY=<publishable/anon key> \
//   TEST_EMAIL=staging@admin.com TEST_PASSWORD=*** \
//   k6 run load/k6/connection-pool-exhaustion.js
//
// Authenticates once in setup() using a seeded test employee account, then
// reuses that session across all VUs — this exercises real authenticated
// DB-backed routes instead of hitting the auth-rejection path.
//
// This app authenticates via Supabase directly (supabase.auth.signInWithPassword
// in src/actions/auth.actions.ts) rather than a custom /api/auth/login route, so
// setup() logs in against Supabase's own auth REST API and reconstructs the
// @supabase/ssr session cookie our route handlers expect.
//
// Before running: note current staging ECS task count here, since pool
// capacity ≈ task_count × per-task pool size. Compare against the VU count
// where errors/latency inflect below.
// ECS task count at time of this run: ____

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'
import { b64encode } from 'k6/encoding'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const TEST_EMAIL = __ENV.TEST_EMAIL || 'superadmin@test.perks'
const TEST_PASSWORD = 'admin@123'

// This app has no /api/auth/login route — login is done client-side via
// supabase.auth.signInWithPassword() (see src/actions/auth.actions.ts), which
// talks directly to Supabase's GoTrue auth server, not our Next.js backend.
// So for load testing we authenticate the same way: call Supabase's own
// password-grant endpoint directly, then reconstruct the cookie that
// @supabase/ssr writes on login (name: sb-<project-ref>-auth-token, value:
// "base64-" + base64(JSON.stringify(session))) so our route handlers'
// createServerClient(...).auth.getUser() can read it from cookies.
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || ''
const SUPABASE_PROJECT_REF = __ENV.SUPABASE_PROJECT_REF || SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0]

const errorRate = new Rate('errors')
const dbLatency = new Trend('db_backed_request_duration')
const poolErrors = new Counter('pool_exhaustion_errors')
const otherServerErrors = new Counter('other_5xx_errors')
const authFailures = new Counter('auth_failures')

export const options = {
  stages: [
    // Baseline
    { duration: '30s', target: 1 },
    { duration: '1m', target: 1 },

    // Light
    { duration: '30s', target: 5 },
    { duration: '2m', target: 5 },

    // Normal
    { duration: '30s', target: 10 },
    { duration: '2m', target: 10 },

    // Stress
    { duration: '30s', target: 25 },
    { duration: '3m', target: 25 },

    // Heavy
    { duration: '30s', target: 50 },
    { duration: '3m', target: 50 },

    // Very heavy
    { duration: '30s', target: 100 },
    { duration: '5m', target: 100 },

    // Extreme / pool exhaustion probe
    { duration: '30s', target: 150 },
    { duration: '5m', target: 150 },

    // Ramp down
    { duration: '1m', target: 0 },
  ],
}

export function setup() {
  if (!SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY env var is required (Supabase publishable/anon key)')
  }

  const loginRes = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
    }
  )
  // console.log(`Login response:  ${loginRes.status} ${loginRes.body}`)
  if (loginRes.status !== 200) {
    authFailures.add(1)
    throw new Error(`Login failed in setup(): ${loginRes.status} ${loginRes.body}`)
  }

  const body = loginRes.json()
  const nowSeconds = Math.floor(Date.now() / 1000)
  const session = {
    access_token: body.access_token,
    token_type: body.token_type || 'bearer',
    expires_in: body.expires_in,
    expires_at: body.expires_at || nowSeconds + body.expires_in,
    refresh_token: body.refresh_token,
    user: body.user,
  }
  const cookieValue = `base64-${b64encode(JSON.stringify(session))}`
  const cookieName = `sb-${SUPABASE_PROJECT_REF}-auth-token`

  return { sessionCookie: `${cookieName}=${cookieValue}` }
}

// Existing route handlers as of this test's writing:
//   src/app/api/categories/route.ts          — GET /api/categories        (public)
//   src/app/api/banners/route.ts              — GET /api/banners          (public; "active banners" list, no /active suffix)
//   src/app/api/banners/positions/route.ts    — GET /api/banners/positions (requires auth via getCurrentUser())
const ROUTES = ['/api/admin/overview','/api/admin/analytics','/api/categories', '/api/banners', '/api/banners/positions']
// const ROUTES = ['/api/banners/positions']

export default function (data) {
  const route = ROUTES[Math.floor(Math.random() * ROUTES.length)]
  const res = http.get(`${BASE_URL}${route}`, {
    headers: { Cookie: data.sessionCookie },
  })
    console.log(`${route} -> ${res.status}`)   // ADD THIS LINE

  dbLatency.add(res.timings.duration)

  if (res.status >= 500) {
    errorRate.add(1)
    const body = res.body || ''
    if (/too many connections|remaining connection slots|too many clients/i.test(body)) {
      poolErrors.add(1)
    } else {
      otherServerErrors.add(1)
    }
  } else {
    errorRate.add(0)
  }

  check(res, { 'not a connection-pool timeout (503/500)': (r) => r.status < 500 })
  check(res, { 'still authenticated (not 401)': (r) => r.status !== 401 })

  sleep(0.05)
}