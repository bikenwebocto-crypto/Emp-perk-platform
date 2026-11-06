import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseAuth = vi.hoisted(() => ({
  getUser: vi.fn(),
  mfa: { getAuthenticatorAssuranceLevel: vi.fn() },
}))

vi.mock('@/lib/supabase/server', () => ({
  getCurrentUser: vi.fn(),
  createClient: vi.fn(async () => ({ auth: supabaseAuth })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { account: { findUnique: vi.fn() }, adminUser: { findFirst: vi.fn() } },
}))
vi.mock('@/services/mfa-recovery.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/mfa-recovery.service')>()
  return {
    MfaRecoveryError: actual.MfaRecoveryError,
    toUserView: (r: unknown) => r,
    createRecoveryRequest: vi.fn(),
    verifyRecoveryOtp: vi.fn(),
    getMyRecoveryRequest: vi.fn(),
    listStandardRequests: vi.fn(),
    approveRecovery: vi.fn(),
    rejectRecovery: vi.fn(),
    setRecoveryApprover: vi.fn(),
    getApproverConfig: vi.fn(),
  }
})

import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/supabase/server'
import * as service from '@/services/mfa-recovery.service'
import { POST as postRequest } from '@/app/api/mfa/recovery/request/route'
import { POST as postVerify } from '@/app/api/mfa/recovery/verify-otp/route'
import { GET as listAdmin } from '@/app/api/admin/mfa-recovery/route'
import { POST as postApprove } from '@/app/api/admin/mfa-recovery/[id]/approve/route'
import { POST as postEmergencyApprove } from '@/app/api/admin/mfa-recovery/[id]/emergency-approve/route'
import { PUT as putApprover } from '@/app/api/admin/security/recovery-approver/route'
import { generateOtp, hashOtp, otpMatches } from '@/lib/mfa-recovery/otp'
import { canTransition, recoveryTypeForRole } from '@/lib/mfa-recovery/constants'
import { canAdminAccessPath, canAdminCallApi } from '@/lib/access/account-access'

const db = prisma as any
const currentUser = getCurrentUser as unknown as ReturnType<typeof vi.fn>
const ctx = { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }

function req(url: string, body?: unknown) {
  return new Request(`http://localhost${url}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.MFA_RECOVERY_OTP_SECRET = 'test-secret-test-secret-test-secret-123'
})

describe('user recovery routes: identity', () => {
  it('returns 401 when signed out', async () => {
    supabaseAuth.getUser.mockResolvedValue({ data: { user: null } })
    const res = await postRequest(req('/api/mfa/recovery/request', { reason: 'x'.repeat(20) }))
    expect(res.status).toBe(401)
    expect(service.createRecoveryRequest).not.toHaveBeenCalled()
  })

  it('returns 409 when the Supabase user id does not match the account', async () => {
    supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: 'auth-A', email: 'm@example.com' } } })
    db.account.findUnique.mockResolvedValue({ authUserId: 'auth-B', email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' })
    const res = await postVerify(req('/api/mfa/recovery/verify-otp', { code: '123456' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('IDENTITY_MISMATCH')
    expect(service.verifyRecoveryOtp).not.toHaveBeenCalled()
  })

  it('builds the actor from the session and ignores ids/roles in the body', async () => {
    supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: 'auth-M', email: 'm@example.com' } } })
    db.account.findUnique.mockResolvedValue({ authUserId: 'auth-M', email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' })
    vi.mocked(service.createRecoveryRequest).mockResolvedValue({ id: 'r1' } as any)
    const res = await postRequest(req('/api/mfa/recovery/request', {
      reason: 'Lost my phone entirely', accountId: 'victim', role: 'SUPER_ADMIN',
    }))
    expect(res.status).toBe(201)
    const [actor, reason] = vi.mocked(service.createRecoveryRequest).mock.calls[0]
    expect(actor).toMatchObject({ accountId: 'auth-M', accountRole: 'MERCHANT', adminRole: null })
    expect(reason).toBe('Lost my phone entirely')
  })

  it('maps service errors to their HTTP status', async () => {
    supabaseAuth.getUser.mockResolvedValue({ data: { user: { id: 'auth-E', email: 'e@example.com' } } })
    db.account.findUnique.mockResolvedValue({ authUserId: 'auth-E', email: 'e@example.com', role: 'EMPLOYEE', status: 'ACTIVE' })
    vi.mocked(service.createRecoveryRequest).mockRejectedValue(new service.MfaRecoveryError(403, 'NOT_ELIGIBLE', 'nope'))
    const res = await postRequest(req('/api/mfa/recovery/request', { reason: 'x'.repeat(20) }))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('NOT_ELIGIBLE')
  })
})

describe('admin recovery routes: authorization', () => {
  const adminCalls = [
    ['GET /api/admin/mfa-recovery', () => listAdmin(req('/api/admin/mfa-recovery'))],
    ['POST approve', () => postApprove(req('/x', { confirm: true }), ctx)],
    ['POST emergency-approve', () => postEmergencyApprove(req('/x', { confirm: true }), ctx)],
    ['PUT recovery-approver', () => putApprover(new Request('http://localhost/x', { method: 'PUT', body: '{}' }))],
  ] as const

  it.each(adminCalls)('%s returns 401 when signed out', async (_n, call) => {
    currentUser.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })

  it.each(adminCalls)('%s returns 403 for merchants and company admins', async (_n, call) => {
    for (const userType of ['merchant', 'company_admin', 'employee']) {
      currentUser.mockResolvedValue({ id: 'u', email: 'u@example.com', role: 'MERCHANT', userType, profile: null })
      expect((await call()).status).toBe(403)
    }
    expect(service.approveRecovery).not.toHaveBeenCalled()
    expect(service.setRecoveryApprover).not.toHaveBeenCalled()
  })

  it('passes the workflow type from the route, not the body', async () => {
    currentUser.mockResolvedValue({ id: 'admin-1', email: 'a@example.com', role: 'SUPER_ADMIN', userType: 'admin', adminRole: 'SUPER_ADMIN', profile: { isActive: true } })
    vi.mocked(service.approveRecovery).mockResolvedValue({} as any)
    await postApprove(req('/x', { confirm: true, recoveryType: 'SUPER_ADMIN_EMERGENCY' }), ctx)
    expect(vi.mocked(service.approveRecovery).mock.calls[0][2]).toBe('STANDARD')
    await postEmergencyApprove(req('/x', { confirm: true }), ctx)
    expect(vi.mocked(service.approveRecovery).mock.calls[1][2]).toBe('SUPER_ADMIN_EMERGENCY')
  })

  it('reads fresh-MFA time from the session AMR, not the request', async () => {
    currentUser.mockResolvedValue({ id: 'admin-1', email: 'a@example.com', role: 'SUPER_ADMIN', userType: 'admin', adminRole: 'SUPER_ADMIN', profile: { isActive: true } })
    supabaseAuth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', currentAuthenticationMethods: [{ method: 'password', timestamp: 1 }, { method: 'totp', timestamp: 1_800_000_000 }] },
    })
    vi.mocked(service.setRecoveryApprover).mockResolvedValue({ changed: true })
    await putApprover(new Request('http://localhost/x', { method: 'PUT', body: JSON.stringify({ approverAccountId: 'p', freshMfaAt: Date.now() }) }))
    const [, approverId, freshAt] = vi.mocked(service.setRecoveryApprover).mock.calls[0]
    expect(approverId).toBe('p')
    expect((freshAt as Date).getTime()).toBe(1_800_000_000 * 1000)
  })
})

describe('OTP primitives', () => {
  it('generates 6-digit codes and matches only the right code for the right request', () => {
    const code = generateOtp()
    expect(code).toMatch(/^\d{6}$/)
    const hash = hashOtp('req-1', code)
    expect(otpMatches('req-1', code, hash)).toBe(true)
    expect(otpMatches('req-2', code, hash)).toBe(false)
    expect(otpMatches('req-1', '12345', hash)).toBe(false)
    expect(otpMatches('req-1', `${code} `, hash)).toBe(false)
  })

  it('refuses to run without a strong secret', () => {
    process.env.MFA_RECOVERY_OTP_SECRET = 'short'
    expect(() => hashOtp('r', '123456')).toThrow(/MFA_RECOVERY_OTP_SECRET/)
  })
})

describe('state machine and access', () => {
  it('never allows approval without OTP verification, in either workflow', () => {
    for (const type of ['STANDARD', 'SUPER_ADMIN_EMERGENCY'] as const) {
      for (const from of ['PENDING', 'UNDER_REVIEW', 'OTP_SENT'] as const) {
        expect(canTransition(type, from, 'APPROVED')).toBe(false)
      }
      expect(canTransition(type, 'OTP_VERIFIED', 'APPROVED')).toBe(true)
      expect(canTransition(type, 'AWAITING_NEW_MFA', 'COMPLETED')).toBe(true)
      expect(canTransition(type, 'APPROVED', 'COMPLETED')).toBe(false)
    }
    expect(canTransition('SUPER_ADMIN_EMERGENCY', 'PENDING', 'UNDER_REVIEW')).toBe(false)
  })

  it('maps roles to workflows and excludes employees', () => {
    expect(recoveryTypeForRole('MERCHANT')).toBe('STANDARD')
    expect(recoveryTypeForRole('COMPANY_ADMIN')).toBe('STANDARD')
    expect(recoveryTypeForRole('SUPER_ADMIN')).toBe('SUPER_ADMIN_EMERGENCY')
    expect(recoveryTypeForRole('EMPLOYEE')).toBeNull()
  })

  it('support admins may configure their own approver but not review requests', () => {
    expect(canAdminCallApi('SUPPORT_ADMIN', '/api/admin/security/recovery-approver')).toBe(true)
    expect(canAdminCallApi('SUPPORT_ADMIN', '/api/admin/security/recovery-approver/history')).toBe(true)
    expect(canAdminCallApi('SUPPORT_ADMIN', '/api/admin/mfa-recovery')).toBe(false)
  })

  it('only SUPER_ADMIN opens the MFA recovery page', () => {
    expect(canAdminAccessPath('SUPER_ADMIN', '/admin/mfa-recovery')).toBe(true)
    for (const role of ['ADMIN', 'SUPPORT_ADMIN', 'FINANCE_ADMIN', 'CONTENT_ADMIN']) {
      expect(canAdminAccessPath(role, '/admin/mfa-recovery')).toBe(false)
    }
  })
})
