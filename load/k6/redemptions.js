// k6 load test: redemption capacity contention.
// Simulates many employees racing to redeem the SAME capacity-limited
// offer concurrently, to exercise the conditional-UPDATE guard in
// src/lib/redemption-tracking.ts (reserveCapacity) under real concurrency
// rather than the unit-level mock in tests/unit/redemptions.
//
// Usage:
//   BASE_URL=http://localhost:3000 \
//   EMPLOYEE_COOKIE="sb-access-token=..." \
//   OFFER_ID=<a LIVE offer id with a small maxRedemptions> \
//   k6 run load/k6/redemptions.js

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const COOKIE = __ENV.EMPLOYEE_COOKIE || ''
const OFFER_ID = __ENV.OFFER_ID || ''

const successfulRedemptions = new Counter('successful_redemptions')
const limitReached = new Counter('limit_reached_responses')

export const options = {
  // Deliberately spiky: many virtual users hit /redeem in the same short
  // window to try to force a capacity over-redemption if the guard is broken.
  scenarios: {
    burst: {
      executor: 'per-vu-iterations',
      vus: 30,
      iterations: 1,
      maxDuration: '30s',
    },
  },
  thresholds: {
    // The real assertion for this script is manual: after the run, query
    // OfferRedemptionCapacity.redeemedCount for OFFER_ID and confirm it
    // never exceeded maxRedemptions. k6 thresholds only catch gross failure.
    http_req_failed: ['rate<0.5'],
  },
}

export default function () {
  if (!OFFER_ID) {
    console.error('OFFER_ID is required — point it at a LIVE offer with a small maxRedemptions.')
    return
  }

  const res = http.post(
    `${BASE_URL}/api/employee/redeem`,
    JSON.stringify({ offerId: OFFER_ID }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...(COOKIE ? { Cookie: COOKIE } : {}),
      },
    },
  )

  if (res.status === 200 || res.status === 201) successfulRedemptions.add(1)
  if (res.status === 409 || res.status === 400) limitReached.add(1)

  check(res, {
    'redeem: not a server error': (r) => r.status < 500,
  })

  sleep(0.1)
}
