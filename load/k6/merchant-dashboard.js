// k6 load test: merchant dashboard/analytics read path.
// Usage: BASE_URL=http://localhost:3000 MERCHANT_COOKIE="sb-access-token=..." k6 run load/k6/merchant-dashboard.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const COOKIE = __ENV.MERCHANT_COOKIE || ''

const errorRate = new Rate('errors')

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 15 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    errors: ['rate<0.01'],
  },
}

function authedGet(path) {
  return http.get(`${BASE_URL}${path}`, {
    headers: COOKIE ? { Cookie: COOKIE } : {},
  })
}

export default function () {
  const summary = authedGet('/api/merchant/analytics/summary')
  errorRate.add(summary.status >= 400)
  check(summary, { 'analytics summary: not a server error': (r) => r.status < 500 })

  sleep(0.5)

  const trends = authedGet('/api/merchant/analytics/trends')
  errorRate.add(trends.status >= 400)
  check(trends, { 'analytics trends: not a server error': (r) => r.status < 500 })

  sleep(0.5)

  const offers = authedGet('/api/merchant/offers?pageSize=20')
  errorRate.add(offers.status >= 400)
  check(offers, { 'offers list: not a server error': (r) => r.status < 500 })

  sleep(1)
}
