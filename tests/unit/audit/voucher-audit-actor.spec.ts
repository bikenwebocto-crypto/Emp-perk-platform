import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { redemption: { findFirst: vi.fn() } } }))
vi.mock('@/lib/supabase/server', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@/lib/voucher-validation', () => ({ validateVoucher: vi.fn() }))
vi.mock('@/lib/rate-limiter', () => ({ checkVoucherRateLimits: vi.fn() }))
vi.mock('@/lib/fraud-detection', () => ({
  detectFraud: vi.fn(),
  trackVerificationAttempt: vi.fn(),
  logFraudDetection: vi.fn(),
}))
vi.mock('@/services/audit-log.service', () => ({ createAuditLog: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import { checkVoucherRateLimits } from '@/lib/rate-limiter'
import { createAuditLog } from '@/services/audit-log.service'
import { POST } from '@/app/api/vouchers/verify/route'

const db = prisma as any
const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>
const audit = createAuditLog as unknown as ReturnType<typeof vi.fn>

function verify(code = 'ABCD-EFGH-1234') {
  return POST(
    new NextRequest('http://localhost/api/vouchers/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
      headers: { 'x-forwarded-for': '6.6.6.6, 198.51.100.4', 'user-agent': 'Scanner/1' },
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  db.redemption.findFirst.mockResolvedValue({ employeeId: 'emp-profile', merchantId: 'm-1', companyId: 'co-1' })
  ;(checkVoucherRateLimits as any).mockReturnValue({ limited: true, resetMs: 1000 })
})

describe('voucher verification audit attribution', () => {
  it('records the authenticated caller (internal profile id) as actor, not the redemption employee', async () => {
    currentUser.mockResolvedValue({ id: 'supabase-auth-uuid', profileId: 'merchant-profile', userType: 'merchant' })
    const res = await verify()
    expect(res.status).toBe(429)

    const input = audit.mock.calls[0][0]
    expect(input.actorType).toBe('merchant')
    expect(input.actorId).toBe('merchant-profile')
    expect(input.actorId).not.toBe('supabase-auth-uuid')
    expect(input.companyId).toBe('co-1')
    expect(input.metadata.subjectEmployeeId).toBe('emp-profile')
    expect(input.request).toEqual({ ipAddress: '198.51.100.4', userAgent: 'Scanner/1' })
    // ip/UA live in columns, not duplicated into metadata
    expect(input.metadata).not.toHaveProperty('ipAddress')
    expect(input.metadata).not.toHaveProperty('userAgent')
  })

  it('rejects a caller without a profile id instead of writing an anonymous actor', async () => {
    currentUser.mockResolvedValue({ id: 'supabase-auth-uuid', profileId: null, userType: 'merchant' })
    const res = await verify()
    expect(res.status).toBe(403)
    expect(audit).not.toHaveBeenCalled()
  })
})
