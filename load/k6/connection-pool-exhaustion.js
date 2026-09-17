// k6 load test: database connection-pool exhaustion probe.
// Hammers several DB-backed read endpoints concurrently to find the point
// where the Prisma/pg connection pool saturates and request latency or
// error rate spikes — useful for sizing PgBouncer/pool settings.
//
// Usage: BASE_URL=http://localhost:3000 k6 run load/k6/connection-pool-exhaustion.js
//
// Uses only public, unauthenticated endpoints so it can run without
// captured session cookies.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'

const errorRate = new Rate('errors')
const dbLatency = new Trend('db_backed_request_duration')

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '30s', target: 60 },
    { duration: '30s', target: 150 }, // intentionally aggressive to find the breaking point
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // No hard pass/fail here by design — this test is exploratory. Read the
    // db_backed_request_duration trend and error rate manually per run to
    // find the pool-exhaustion inflection point.
  },
}

const ROUTES = ['/api/categories', '/api/banners/active', '/api/banners/positions']

export default function () {
  const route = ROUTES[Math.floor(Math.random() * ROUTES.length)]
  const res = http.get(`${BASE_URL}${route}`)

  dbLatency.add(res.timings.duration)
  errorRate.add(res.status >= 500)
  check(res, { 'not a connection-pool timeout (503/500)': (r) => r.status < 500 })

  sleep(0.05)
}
