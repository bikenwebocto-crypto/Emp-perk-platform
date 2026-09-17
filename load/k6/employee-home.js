// k6 load test: employee home/dashboard read path.
// Usage: BASE_URL=http://localhost:3000 EMPLOYEE_COOKIE="sb-access-token=..." k6 run load/k6/employee-home.js
//
// The app authenticates via a Supabase session cookie, not a bearer token
// obtainable in a single request, so this script expects a pre-captured
// cookie string (grab it from a logged-in browser's dev tools) rather than
// performing login itself.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const COOKIE = __ENV.EMPLOYEE_COOKIE || ''

const errorRate = new Rate('errors')
const dashboardDuration = new Trend('dashboard_stats_duration')

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    errors: ['rate<0.01'],
  },
}

function authedGet(path) {
  return http.get(`${BASE_URL}${path}`, {
    headers: COOKIE ? { Cookie: COOKIE } : {},
  })
}

export default function () {
  if (!COOKIE) {
    console.warn('EMPLOYEE_COOKIE not set — requests will be unauthenticated (expect 401s).')
  }

  const stats = authedGet('/api/employee/dashboard/stats')
  dashboardDuration.add(stats.timings.duration)
  errorRate.add(stats.status >= 400)
  check(stats, { 'dashboard stats: status is 200 or 401': (r) => r.status === 200 || r.status === 401 })

  sleep(0.5)

  const offers = authedGet('/api/employee/offers?pageSize=20')
  errorRate.add(offers.status >= 400)
  check(offers, { 'offers list: status is 200 or 401': (r) => r.status === 200 || r.status === 401 })

  sleep(1)
}
