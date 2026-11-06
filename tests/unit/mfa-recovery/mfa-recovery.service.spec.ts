import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sharedFake } from './fake-db'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('./fake-db')).sharedFake.db }))
vi.mock('@/lib/mfa-recovery/factors', () => ({
  listVerifiedTotpFactors: vi.fn(),
  listTotpFactors: vi.fn(),
  deleteTotpFactor: vi.fn(),
}))
vi.mock('@/lib/mfa-recovery/accounts', () => ({
  loadRecoveryAccount: vi.fn(),
  listStandardReviewerEmails: vi.fn(),
  listApproverCandidates: vi.fn(),
}))
vi.mock('@/lib/mfa-recovery/emails', () => ({
  sendRequestReceived: vi.fn(),
  sendRecoveryOtp: vi.fn(),
  sendStandardRequestToReviewers: vi.fn(),
  sendApproverNotified: vi.fn(),
  sendRequestDecision: vi.fn(),
  sendRecoveryCompleted: vi.fn(),
  sendApproverAssignmentNotice: vi.fn(),
}))

import * as factors from '@/lib/mfa-recovery/factors'
import * as accounts from '@/lib/mfa-recovery/accounts'
import * as emails from '@/lib/mfa-recovery/emails'
import { setRateLimiter, type RateLimiter } from '@/lib/rate-limit'
import { OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, REQUEST_TTL_MS } from '@/lib/mfa-recovery/constants'
import {
  MfaRecoveryError,
  adminSendOtp,
  approveRecovery,
  completeRecoveryEnrollment,
  createRecoveryRequest,
  getApproverHistory,
  getMyRecoveryRequest,
  getRequestForAdmin,
  getRequestHistory,
  listMyApprovals,
  listStandardRequests,
  logContactAttempt,
  markUnderReview,
  rejectRecovery,
  resendOtpForUser,
  setRecoveryApprover,
  verifyRecoveryOtp,
  type RecoveryActor,
} from '@/services/mfa-recovery.service'
import type { RecoveryAccount } from '@/lib/mfa-recovery/accounts'

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const db = sharedFake.tables
const REASON = 'Lost my phone with the authenticator app'

function acct(id: string, role: RecoveryAccount['role'], extra: Partial<RecoveryAccount> = {}): RecoveryAccount {
  return {
    accountId: id, email: `${id}@example.com`, role, status: 'ACTIVE', displayName: id, phone: '+35700000000',
    adminRole: null, adminActive: null, ...extra,
  }
}

const ACCOUNTS: Record<string, RecoveryAccount> = {
  merchant: acct('merchant', 'MERCHANT'),
  companyAdmin: acct('companyAdmin', 'COMPANY_ADMIN'),
  employee: acct('employee', 'EMPLOYEE'),
  reviewer: acct('reviewer', 'SUPER_ADMIN', { adminRole: 'SUPER_ADMIN', adminActive: true, phone: null }),
  plainAdmin: acct('plainAdmin', 'SUPER_ADMIN', { adminRole: 'ADMIN', adminActive: true, phone: null }),
  superAdmin: acct('superAdmin', 'SUPER_ADMIN', { adminRole: 'SUPER_ADMIN', adminActive: true, phone: null }),
  approver: acct('approver', 'SUPER_ADMIN', { adminRole: 'ADMIN', adminActive: true, phone: null }),
  approver2: acct('approver2', 'SUPER_ADMIN', { adminRole: 'SUPER_ADMIN', adminActive: true, phone: null }),
  inactiveAdmin: acct('inactiveAdmin', 'SUPER_ADMIN', { adminRole: 'ADMIN', adminActive: false, phone: null }),
  supportAdmin: acct('supportAdmin', 'SUPER_ADMIN', { adminRole: 'SUPPORT_ADMIN', adminActive: true, phone: null }),
  noMfaAdmin: acct('noMfaAdmin', 'SUPER_ADMIN', { adminRole: 'ADMIN', adminActive: true, phone: null }),
}

let accountsById: Record<string, RecoveryAccount>
let factorsById: Record<string, { id: string; status: string; createdAt: string }[]>
let failDelete: boolean

function actor(id: string): RecoveryActor {
  const a = accountsById[id]
  return { accountId: a.accountId, email: a.email, accountRole: a.role, adminRole: a.adminRole, adminActive: a.adminActive, ip: '127.0.0.1' }
}

function lastOtpSent(): string {
  const calls = vi.mocked(emails.sendRecoveryOtp).mock.calls
  return calls[calls.length - 1][1]
}

async function expectError(promise: Promise<unknown>, code: string, status?: number) {
  const error = await promise.then(() => null, (e) => e)
  expect(error).toBeInstanceOf(MfaRecoveryError)
  expect((error as MfaRecoveryError).code).toBe(code)
  if (status) expect((error as MfaRecoveryError).status).toBe(status)
  return error as MfaRecoveryError
}

function audits(requestId?: string) {
  return db.mfaRecoveryAuditLog.filter((l) => !requestId || l.recoveryRequestId === requestId).map((l) => l.action)
}

async function assignApprover(owner: string, approverId: string) {
  return setRecoveryApprover(actor(owner), approverId, new Date())
}

/** Creates a STANDARD request and drives it to OTP_VERIFIED. */
async function standardVerified(owner = 'merchant') {
  const r = await createRecoveryRequest(actor(owner), REASON)
  await adminSendOtp(actor('reviewer'), r.id)
  await verifyRecoveryOtp(actor(owner), lastOtpSent())
  return r.id
}

/** Creates an EMERGENCY request (OTP sent on creation) and verifies it. */
async function emergencyVerified() {
  await assignApprover('superAdmin', 'approver')
  const r = await createRecoveryRequest(actor('superAdmin'), REASON)
  await verifyRecoveryOtp(actor('superAdmin'), lastOtpSent())
  return r.id
}

beforeEach(() => {
  process.env.MFA_RECOVERY_OTP_SECRET = 'test-secret-test-secret-test-secret-123'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T10:00:00Z'))
  sharedFake.reset()
  failDelete = false
  accountsById = structuredClone(ACCOUNTS)
  factorsById = Object.fromEntries(
    Object.keys(ACCOUNTS)
      .filter((id) => id !== 'employee' && id !== 'noMfaAdmin')
      .map((id) => [id, [{ id: `${id}-totp-1`, status: 'verified', createdAt: '2026-01-01T00:00:00Z' }]]),
  )

  vi.mocked(accounts.loadRecoveryAccount).mockImplementation(async (id) => accountsById[id] ? { ...accountsById[id] } : null)
  vi.mocked(accounts.listStandardReviewerEmails).mockResolvedValue(['reviewer@example.com'])
  vi.mocked(accounts.listApproverCandidates).mockResolvedValue([])
  vi.mocked(factors.listVerifiedTotpFactors).mockImplementation(async (id) => (factorsById[id] ?? []).filter((f) => f.status === 'verified'))
  vi.mocked(factors.deleteTotpFactor).mockImplementation(async (userId, factorId) => {
    if (failDelete) throw new Error('deleteFactor failed: upstream 500')
    factorsById[userId] = (factorsById[userId] ?? []).filter((f) => f.id !== factorId)
  })
  for (const fn of Object.values(emails)) vi.mocked(fn as any).mockResolvedValue(true)

  // In-memory rate limiter (the real one needs Postgres advisory locks).
  const counters = new Map<string, number>()
  const limiter: RateLimiter = {
    backend: 'memory',
    consume: async (key, { limit }) => {
      const used = (counters.get(key) ?? 0) + 1
      counters.set(key, used)
      return { allowed: used <= limit, limit, remaining: Math.max(0, limit - used), retryAfterSeconds: used <= limit ? 0 : 60 }
    },
    reset: async (key) => { counters.delete(key) },
  }
  setRateLimiter(limiter)
})

afterEach(() => {
  vi.useRealTimers()
  setRateLimiter(null)
})

// ─────────────────────────────────────────────────────────────
// Standard recovery
// ─────────────────────────────────────────────────────────────

describe('standard recovery: request', () => {
  it.each(['merchant', 'companyAdmin'])('%s can submit a request with registered contact details', async (id) => {
    const r = await createRecoveryRequest(actor(id), REASON)
    expect(r.recoveryType).toBe('STANDARD')
    expect(r.status).toBe('PENDING')
    const row = db.mfaRecoveryRequest[0]
    expect(row.registeredEmail).toBe(`${id}@example.com`)
    expect(row.registeredPhone).toBe('+35700000000')
    expect(row.accountRole).toBe(accountsById[id].role)
    expect(row.activeKey).toBe(id)
    expect(emails.sendRequestReceived).toHaveBeenCalledWith(`${id}@example.com`, false)
    expect(emails.sendStandardRequestToReviewers).toHaveBeenCalled()
    expect(emails.sendRecoveryOtp).not.toHaveBeenCalled()
    expect(audits(r.id)).toEqual(['REQUEST_CREATED'])
  })

  it('rejects EMPLOYEE accounts', async () => {
    await expectError(createRecoveryRequest(actor('employee'), REASON), 'NOT_ELIGIBLE', 403)
    expect(db.mfaRecoveryRequest).toHaveLength(0)
  })

  it('requires a reason', async () => {
    await expectError(createRecoveryRequest(actor('merchant'), 'short'), 'INVALID_REASON', 400)
    await expectError(createRecoveryRequest(actor('merchant'), undefined), 'INVALID_REASON', 400)
  })

  it('rejects inactive accounts', async () => {
    accountsById.merchant.status = 'SUSPENDED'
    await expectError(createRecoveryRequest(actor('merchant'), REASON), 'ACCOUNT_INACTIVE', 403)
  })

  it('requires an enrolled authenticator', async () => {
    factorsById.merchant = []
    await expectError(createRecoveryRequest(actor('merchant'), REASON), 'NO_MFA_ENROLLED', 409)
  })

  it('prevents duplicate open requests', async () => {
    await createRecoveryRequest(actor('merchant'), REASON)
    await expectError(createRecoveryRequest(actor('merchant'), REASON), 'DUPLICATE_REQUEST', 409)
    expect(db.mfaRecoveryRequest).toHaveLength(1)
  })

  it('prevents duplicates under concurrent submission (unique activeKey)', async () => {
    const results = await Promise.allSettled([
      createRecoveryRequest(actor('merchant'), REASON),
      createRecoveryRequest(actor('merchant'), REASON),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(db.mfaRecoveryRequest).toHaveLength(1)
  })

  it('allows a new request once the previous one is closed', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await rejectRecovery(actor('reviewer'), r.id, 'STANDARD', 'Could not verify identity')
    const second = await createRecoveryRequest(actor('merchant'), REASON)
    expect(second.id).not.toBe(r.id)
  })

  it('expires stale requests and frees the account for a new one', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    vi.setSystemTime(new Date(Date.now() + REQUEST_TTL_MS + 1000))
    expect((await getMyRecoveryRequest(actor('merchant')))!.status).toBe('EXPIRED')
    expect(audits(r.id)).toContain('REQUEST_EXPIRED')
    await createRecoveryRequest(actor('merchant'), REASON)
  })
})

describe('standard recovery: admin review and OTP', () => {
  it('only active SUPER_ADMIN reviewers can list, review and send codes', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    for (const id of ['plainAdmin', 'supportAdmin', 'merchant', 'companyAdmin']) {
      await expectError(listStandardRequests(actor(id), {}), 'FORBIDDEN', 403)
      await expectError(adminSendOtp(actor(id), r.id), id === 'merchant' ? 'SELF_APPROVAL_FORBIDDEN' : 'FORBIDDEN', 403)
    }
    const inactive = { ...actor('reviewer'), adminActive: false }
    await expectError(markUnderReview(inactive, r.id), 'FORBIDDEN', 403)
  })

  it('lists with filtering, search and pagination', async () => {
    await createRecoveryRequest(actor('merchant'), REASON)
    await createRecoveryRequest(actor('companyAdmin'), REASON)
    const all = await listStandardRequests(actor('reviewer'), { pageSize: 1, page: 2, sort: 'requestedAt', order: 'asc' })
    expect(all.pagination).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 })
    const searched = await listStandardRequests(actor('reviewer'), { q: 'COMPANYADMIN@' })
    expect(searched.items.map((i) => i.accountId)).toEqual(['companyAdmin'])
    const byStatus = await listStandardRequests(actor('reviewer'), { status: 'otp_sent' })
    expect(byStatus.items).toHaveLength(0)
  })

  it('moves PENDING → UNDER_REVIEW → OTP_SENT and records the reviewer', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    expect((await markUnderReview(actor('reviewer'), r.id)).status).toBe('UNDER_REVIEW')
    const sent = await adminSendOtp(actor('reviewer'), r.id)
    expect(sent.status).toBe('OTP_SENT')
    expect(sent.reviewedByAccountId).toBe('reviewer')
    expect(audits(r.id)).toEqual(['REQUEST_CREATED', 'REVIEW_STARTED', 'OTP_SENT'])
  })

  it('emails the code only to the registered email and never returns it', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    const res = await adminSendOtp(actor('reviewer'), r.id)
    expect(emails.sendRecoveryOtp).toHaveBeenCalledTimes(1)
    const [to, code] = vi.mocked(emails.sendRecoveryOtp).mock.calls[0]
    expect(to).toBe('merchant@example.com')
    expect(code).toMatch(/^\d{6}$/)
    expect(JSON.stringify(res)).not.toContain(code)
    expect(JSON.stringify(db.mfaRecoveryAuditLog)).not.toContain(code)
    expect(emails.sendApproverNotified).not.toHaveBeenCalled()
  })

  it('stores only a hash of the code, linked to the request, expiring in 10 minutes', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    const code = lastOtpSent()
    const otp = db.mfaRecoveryOtp[0]
    expect(otp.recoveryRequestId).toBe(r.id)
    expect(otp.otpHash).toMatch(/^[0-9a-f]{64}$/)
    expect(otp.otpHash).not.toContain(code)
    expect(otp.expiresAt.getTime() - Date.now()).toBe(OTP_TTL_MS)
  })

  it('refuses to send a code if the account email changed since the request', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    accountsById.merchant.email = 'attacker@example.com'
    await expectError(adminSendOtp(actor('reviewer'), r.id), 'EMAIL_CHANGED', 409)
    expect(emails.sendRecoveryOtp).not.toHaveBeenCalled()
  })

  it('enforces resend cooldown and max sends, invalidating older codes', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    const first = lastOtpSent()
    await expectError(adminSendOtp(actor('reviewer'), r.id), 'OTP_RESEND_COOLDOWN', 429)

    vi.setSystemTime(new Date(Date.now() + OTP_RESEND_COOLDOWN_MS))
    await resendOtpForUser(actor('merchant'))
    expect(audits(r.id)).toContain('OTP_RESENT')
    await expectError(verifyRecoveryOtp(actor('merchant'), first), 'OTP_INVALID', 400)

    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(Date.now() + OTP_RESEND_COOLDOWN_MS))
      await resendOtpForUser(actor('merchant'))
    }
    vi.setSystemTime(new Date(Date.now() + OTP_RESEND_COOLDOWN_MS))
    await expectError(resendOtpForUser(actor('merchant')), 'OTP_SEND_LIMIT', 429)
    expect(db.mfaRecoveryOtp.filter((o) => o.consumedAt === null)).toHaveLength(1)
  })
})

describe('admin page data', () => {
  it('returns summary buckets, user names and role / date filters', async () => {
    const m = await createRecoveryRequest(actor('merchant'), REASON)
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
    const c = await createRecoveryRequest(actor('companyAdmin'), REASON)
    await adminSendOtp(actor('reviewer'), c.id)
    await rejectRecovery(actor('reviewer'), m.id, 'STANDARD', 'Could not verify')

    const all = await listStandardRequests(actor('reviewer'), {})
    expect(all.summary).toEqual({ total: 2, pending: 0, underReview: 1, completed: 0, rejected: 1 })
    expect(all.items.map((i) => i.displayName).sort()).toEqual(['companyAdmin', 'merchant'])

    const merchants = await listStandardRequests(actor('reviewer'), { role: 'merchant' })
    expect(merchants.items.map((i) => i.accountId)).toEqual(['merchant'])
    expect((await listStandardRequests(actor('reviewer'), { role: 'EMPLOYEE' })).items).toHaveLength(2)

    const byDate = await listStandardRequests(actor('reviewer'), { from: '2026-11-07', to: '2026-11-07' })
    expect(byDate.items.map((i) => i.accountId)).toEqual(['companyAdmin'])
    expect((await listStandardRequests(actor('reviewer'), { to: '2026-11-05' })).items.map((i) => i.accountId)).toEqual(['merchant'])

    // Status filter narrows rows but cards still show every bucket.
    const rejected = await listStandardRequests(actor('reviewer'), { status: 'REJECTED' })
    expect(rejected.items).toHaveLength(1)
    expect(rejected.summary.total).toBe(2)

    expect((await listStandardRequests(actor('reviewer'), { q: c.id })).items.map((i) => i.id)).toEqual([c.id])
    expect((await listStandardRequests(actor('reviewer'), { q: '+3570' })).items).toHaveLength(2)
  })

  it('shows OTP delivery status without the hash', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    expect((await getRequestForAdmin(actor('reviewer'), r.id)).otp).toBeNull()
    await adminSendOtp(actor('reviewer'), r.id)
    const sent = await getRequestForAdmin(actor('reviewer'), r.id)
    expect(sent.otp).toMatchObject({ state: 'AWAITING_USER', attempts: 0, maxAttempts: OTP_MAX_ATTEMPTS })
    expect(JSON.stringify(sent)).not.toContain(db.mfaRecoveryOtp[0].otpHash)
    await verifyRecoveryOtp(actor('merchant'), lastOtpSent())
    expect((await getRequestForAdmin(actor('reviewer'), r.id)).otp?.state).toBe('VERIFIED')
  })

  it('logs phone contact in the history, reviewers only', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await logContactAttempt(actor('reviewer'), r.id, 'Identity confirmed')
    await expectError(logContactAttempt(actor('plainAdmin'), r.id, 'x'), 'FORBIDDEN', 403)
    const contact = db.mfaRecoveryAuditLog.find((l) => l.action === 'CONTACT_ATTEMPTED')!
    expect(contact.metadata).toEqual({ channel: 'PHONE', note: 'Identity confirmed' })
    expect(contact.actorAccountId).toBe('reviewer')
  })
})

describe('standard recovery: OTP verification', () => {
  it('verifies the code and moves to OTP_VERIFIED', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    const res = await verifyRecoveryOtp(actor('merchant'), lastOtpSent())
    expect(res.status).toBe('OTP_VERIFIED')
    expect(db.mfaRecoveryOtp[0].verifiedAt).toBeInstanceOf(Date)
    expect(db.mfaRecoveryOtp[0].consumedAt).toBeInstanceOf(Date)
  })

  it('rejects an expired code', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    vi.setSystemTime(new Date(Date.now() + OTP_TTL_MS + 1))
    await expectError(verifyRecoveryOtp(actor('merchant'), lastOtpSent()), 'OTP_EXPIRED', 410)
  })

  it('locks the code after the maximum wrong attempts (brute force)', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    const code = lastOtpSent()
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 1; i < OTP_MAX_ATTEMPTS; i++) {
      const e = await expectError(verifyRecoveryOtp(actor('merchant'), wrong), 'OTP_INVALID', 400)
      expect(e.details?.remainingAttempts).toBe(OTP_MAX_ATTEMPTS - i)
    }
    await expectError(verifyRecoveryOtp(actor('merchant'), wrong), 'OTP_LOCKED', 429)
    // Even the right code no longer works once locked.
    await expectError(verifyRecoveryOtp(actor('merchant'), code), 'OTP_EXPIRED', 410)
    expect(audits(r.id)).toContain('OTP_LOCKED')
  })

  it('caps parallel guesses at the attempt limit', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    const wrong = lastOtpSent() === '000000' ? '111111' : '000000'
    await Promise.allSettled(Array.from({ length: 8 }, () => verifyRecoveryOtp(actor('merchant'), wrong)))
    expect(db.mfaRecoveryOtp[0].attempts).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS)
  })

  it('rate limits verify calls per account', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    for (let i = 0; i < 10; i++) await verifyRecoveryOtp(actor('merchant'), 'abc').catch(() => undefined)
    await expectError(verifyRecoveryOtp(actor('merchant'), lastOtpSent()), 'RATE_LIMITED', 429)
  })

  it('cannot replay a used code', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    const code = lastOtpSent()
    await verifyRecoveryOtp(actor('merchant'), code)
    await expectError(verifyRecoveryOtp(actor('merchant'), code), 'INVALID_STATE', 409)
  })

  it('only verifies the caller’s own request (no IDOR): another user’s code does nothing', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    await createRecoveryRequest(actor('companyAdmin'), REASON)
    await expectError(verifyRecoveryOtp(actor('companyAdmin'), lastOtpSent()), 'INVALID_STATE', 409)
    expect(db.mfaRecoveryRequest.find((x) => x.id === r.id)!.status).toBe('OTP_SENT')
  })

  it('a code issued for one request does not verify another (hash bound to request id)', async () => {
    const a = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), a.id)
    const codeA = lastOtpSent()
    const b = await createRecoveryRequest(actor('companyAdmin'), REASON)
    await adminSendOtp(actor('reviewer'), b.id)
    // Force the same digits into B's OTP row comparison by copying A's hash.
    db.mfaRecoveryOtp.find((o) => o.recoveryRequestId === b.id)!.otpHash =
      db.mfaRecoveryOtp.find((o) => o.recoveryRequestId === a.id)!.otpHash
    await expectError(verifyRecoveryOtp(actor('companyAdmin'), codeA), 'OTP_INVALID', 400)
  })
})

describe('standard recovery: approval, rejection and factor removal', () => {
  it('cannot approve before the email code is verified', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    await expectError(approveRecovery(actor('reviewer'), r.id, 'STANDARD', true), 'OTP_NOT_VERIFIED', 409)
    expect(factors.deleteTotpFactor).not.toHaveBeenCalled()
  })

  it('requires explicit confirmation', async () => {
    const id = await standardVerified()
    await expectError(approveRecovery(actor('reviewer'), id, 'STANDARD', 'yes'), 'CONFIRMATION_REQUIRED', 400)
  })

  it('approves, removes the verified TOTP factor and awaits a new authenticator', async () => {
    const id = await standardVerified()
    const res = await approveRecovery(actor('reviewer'), id, 'STANDARD', true)
    expect(res.status).toBe('AWAITING_NEW_MFA')
    expect(res.approvedByAccountId).toBe('reviewer')
    expect(res.approvedAt).toBeInstanceOf(Date)
    expect(res.resetFactorIds).toEqual(['merchant-totp-1'])
    expect(factors.deleteTotpFactor).toHaveBeenCalledWith('merchant', 'merchant-totp-1')
    expect(factorsById.merchant).toHaveLength(0)
    expect(emails.sendRequestDecision).toHaveBeenCalledWith('merchant@example.com', true)
    expect(audits(id)).toEqual([
      'REQUEST_CREATED', 'OTP_SENT', 'OTP_VERIFIED', 'APPROVED', 'MFA_RESET', 'AWAITING_NEW_MFA',
    ])
  })

  it('removes every verified TOTP factor when several exist', async () => {
    factorsById.merchant.push({ id: 'merchant-totp-2', status: 'verified', createdAt: '2026-02-01T00:00:00Z' })
    const id = await standardVerified()
    const res = await approveRecovery(actor('reviewer'), id, 'STANDARD', true)
    expect(res.resetFactorIds).toEqual(['merchant-totp-1', 'merchant-totp-2'])
  })

  it('treats an already-missing factor as removed', async () => {
    const id = await standardVerified()
    factorsById.merchant = []
    const res = await approveRecovery(actor('reviewer'), id, 'STANDARD', true)
    expect(res.status).toBe('AWAITING_NEW_MFA')
    expect(factors.deleteTotpFactor).not.toHaveBeenCalled()
  })

  it('does not report success when removal fails, and the approval can be retried', async () => {
    const id = await standardVerified()
    failDelete = true
    await expectError(approveRecovery(actor('reviewer'), id, 'STANDARD', true), 'RESET_FAILED', 502)
    const row = db.mfaRecoveryRequest.find((r) => r.id === id)!
    expect(row.status).toBe('APPROVED')
    expect(row.resetAt).toBeNull()
    expect(row.resetError).toContain('upstream 500')
    expect(audits(id)).toContain('FACTOR_REMOVAL_FAILED')
    expect(emails.sendRequestDecision).not.toHaveBeenCalled()

    failDelete = false
    const retried = await approveRecovery(actor('reviewer'), id, 'STANDARD', true)
    expect(retried.status).toBe('AWAITING_NEW_MFA')
    expect(retried.resetError).toBeNull()
  })

  it('is idempotent: approving again after reset does not remove anything new', async () => {
    const id = await standardVerified()
    await approveRecovery(actor('reviewer'), id, 'STANDARD', true)
    vi.mocked(factors.deleteTotpFactor).mockClear()
    const again = await approveRecovery(actor('reviewer'), id, 'STANDARD', true)
    expect(again.status).toBe('AWAITING_NEW_MFA')
    expect(factors.deleteTotpFactor).not.toHaveBeenCalled()
  })

  it('lets only one of two concurrent approvals win', async () => {
    const id = await standardVerified()
    const results = await Promise.allSettled([
      approveRecovery(actor('reviewer'), id, 'STANDARD', true),
      approveRecovery(actor('reviewer'), id, 'STANDARD', true),
    ])
    expect(audits(id).filter((a) => a === 'APPROVED')).toHaveLength(1)
    expect(audits(id).filter((a) => a === 'MFA_RESET')).toHaveLength(1)
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true)
  })

  it('rejects with a mandatory reason, closes the request and invalidates codes', async () => {
    const r = await createRecoveryRequest(actor('merchant'), REASON)
    await adminSendOtp(actor('reviewer'), r.id)
    await expectError(rejectRecovery(actor('reviewer'), r.id, 'STANDARD', ''), 'INVALID_REASON', 400)
    const res = await rejectRecovery(actor('reviewer'), r.id, 'STANDARD', 'Caller could not confirm details')
    expect(res.status).toBe('REJECTED')
    expect(res.rejectionReason).toBe('Caller could not confirm details')
    expect(db.mfaRecoveryRequest[0].activeKey).toBeNull()
    expect(db.mfaRecoveryOtp.every((o) => o.consumedAt)).toBe(true)
    expect(emails.sendRequestDecision).toHaveBeenCalledWith('merchant@example.com', false, 'Caller could not confirm details')
    expect(factors.deleteTotpFactor).not.toHaveBeenCalled()
  })

  it('cannot reject after MFA was already removed', async () => {
    const id = await standardVerified()
    await approveRecovery(actor('reviewer'), id, 'STANDARD', true)
    await expectError(rejectRecovery(actor('reviewer'), id, 'STANDARD', 'Changed my mind'), 'INVALID_STATE', 409)
  })

  it('the standard approve route cannot be used on an emergency request', async () => {
    const id = await emergencyVerified()
    await expectError(approveRecovery(actor('reviewer'), id, 'STANDARD', true), 'NOT_FOUND', 404)
  })
})

describe('standard recovery: new authenticator enrollment', () => {
  it('completes only after a new verified factor exists', async () => {
    const id = await standardVerified()
    await approveRecovery(actor('reviewer'), id, 'STANDARD', true)
    await expectError(completeRecoveryEnrollment(actor('merchant')), 'NEW_MFA_NOT_FOUND', 409)

    vi.setSystemTime(new Date(Date.now() + 60_000))
    factorsById.merchant = [{ id: 'merchant-totp-new', status: 'verified', createdAt: new Date().toISOString() }]
    const res = await completeRecoveryEnrollment(actor('merchant'))
    expect(res).toEqual({ completed: true, status: 'COMPLETED' })
    const row = db.mfaRecoveryRequest.find((r) => r.id === id)!
    expect(row.status).toBe('COMPLETED')
    expect(row.newFactorId).toBe('merchant-totp-new')
    expect(row.activeKey).toBeNull()
    expect(emails.sendRecoveryCompleted).toHaveBeenCalledWith('merchant@example.com')
  })

  it('is a no-op for users without a request awaiting enrollment', async () => {
    expect(await completeRecoveryEnrollment(actor('companyAdmin'))).toEqual({ completed: false, status: null })
  })
})

// ─────────────────────────────────────────────────────────────
// Super admin emergency recovery
// ─────────────────────────────────────────────────────────────

describe('recovery approver configuration', () => {
  it('assigns an eligible approver and audits it', async () => {
    expect(await assignApprover('superAdmin', 'approver')).toEqual({ changed: true })
    expect(db.mfaRecoveryApprover).toHaveLength(1)
    expect(db.mfaRecoveryApprover[0]).toMatchObject({ superAdminAccountId: 'superAdmin', approverAccountId: 'approver', isActive: true, assignedByAccountId: 'superAdmin' })
    expect(audits()).toEqual(['APPROVER_ASSIGNED'])
    expect(emails.sendApproverAssignmentNotice).toHaveBeenCalledWith(expect.objectContaining({ newApproverEmail: 'approver@example.com', previousApproverEmail: null }))
  })

  it('rejects self-assignment', async () => {
    await expectError(assignApprover('superAdmin', 'superAdmin'), 'SELF_ASSIGNMENT', 400)
  })

  it.each([
    ['nobody', 'APPROVER_NOT_FOUND'],
    ['merchant', 'APPROVER_NOT_AUTHORIZED'],
    ['supportAdmin', 'APPROVER_NOT_AUTHORIZED'],
    ['inactiveAdmin', 'APPROVER_INACTIVE'],
    ['noMfaAdmin', 'APPROVER_MFA_MISSING'],
  ])('rejects invalid approver %s (%s)', async (id, code) => {
    await expectError(assignApprover('superAdmin', id), code, 400)
    expect(db.mfaRecoveryApprover).toHaveLength(0)
  })

  it('requires a fresh TOTP verification', async () => {
    await expectError(setRecoveryApprover(actor('superAdmin'), 'approver', null), 'REAUTH_REQUIRED', 401)
    const stale = new Date(Date.now() - 10 * 60 * 1000)
    await expectError(setRecoveryApprover(actor('superAdmin'), 'approver', stale), 'REAUTH_REQUIRED', 401)
  })

  it('only admin accounts can configure an approver', async () => {
    await expectError(assignApprover('merchant', 'approver'), 'FORBIDDEN', 403)
  })

  it('keeps assignment history on reassignment and notifies the old approver', async () => {
    await assignApprover('superAdmin', 'approver')
    vi.setSystemTime(new Date(Date.now() + 1000))
    await assignApprover('superAdmin', 'approver2')
    const history = await getApproverHistory(actor('superAdmin'))
    expect(history.map((h) => [h.approverAccountId, h.isActive])).toEqual([['approver2', true], ['approver', false]])
    expect(history[1].revokedByAccountId).toBe('superAdmin')
    expect(audits()).toEqual(['APPROVER_ASSIGNED', 'APPROVER_CHANGED'])
    expect(emails.sendApproverAssignmentNotice).toHaveBeenLastCalledWith(expect.objectContaining({ previousApproverEmail: 'approver@example.com' }))
  })

  it('reassigning the same approver is a no-op', async () => {
    await assignApprover('superAdmin', 'approver')
    expect(await assignApprover('superAdmin', 'approver')).toEqual({ changed: false })
    expect(db.mfaRecoveryApprover).toHaveLength(1)
  })
})

describe('emergency recovery: request and verification', () => {
  it('requires a configured approver', async () => {
    await expectError(createRecoveryRequest(actor('superAdmin'), REASON), 'NO_RECOVERY_APPROVER', 409)
  })

  it('sends the code to the super admin on creation, then notifies only the assigned approver after verification', async () => {
    await assignApprover('superAdmin', 'approver')
    const r = await createRecoveryRequest(actor('superAdmin'), REASON)
    expect(r.recoveryType).toBe('SUPER_ADMIN_EMERGENCY')
    expect(r.status).toBe('OTP_SENT')
    expect(r.assignedApproverAccountId).toBe('approver')
    expect(vi.mocked(emails.sendRecoveryOtp).mock.calls[0][0]).toBe('superAdmin@example.com')
    expect(emails.sendStandardRequestToReviewers).not.toHaveBeenCalled()
    expect(emails.sendApproverNotified).not.toHaveBeenCalled()

    await verifyRecoveryOtp(actor('superAdmin'), lastOtpSent())
    expect(emails.sendApproverNotified).toHaveBeenCalledTimes(1)
    expect(vi.mocked(emails.sendApproverNotified).mock.calls[0][0]).toBe('approver@example.com')
    expect(audits(r.id)).toContain('APPROVER_NOTIFIED')
  })

  it('email OTP alone never resets a super admin', async () => {
    const id = await emergencyVerified()
    expect(db.mfaRecoveryRequest.find((r) => r.id === id)!.status).toBe('OTP_VERIFIED')
    expect(factors.deleteTotpFactor).not.toHaveBeenCalled()
  })

  it.each([
    ['approver deactivated', () => { accountsById.approver.adminActive = false }],
    ['approver lost MFA', () => { factorsById.approver = [] }],
  ])('blocks new requests when the %s (no bypass)', async (_label, breakApprover) => {
    await assignApprover('superAdmin', 'approver')
    breakApprover()
    const e = await expectError(createRecoveryRequest(actor('superAdmin'), REASON), 'APPROVER_UNAVAILABLE', 409)
    expect(e.message).toMatch(/emergency recovery procedure/)
  })
})

describe('emergency recovery: approval', () => {
  it('the assigned approver can see and approve; factor removed only after both conditions', async () => {
    const id = await emergencyVerified()
    const mine = await listMyApprovals(actor('approver'), {})
    expect(mine.items.map((i) => i.id)).toEqual([id])
    const detail = await getRequestForAdmin(actor('approver'), id)
    expect(detail.otpVerifiedAt).toBeInstanceOf(Date)
    expect(JSON.stringify(detail)).not.toMatch(/otpHash/)

    const res = await approveRecovery(actor('approver'), id, 'SUPER_ADMIN_EMERGENCY', true)
    expect(res.status).toBe('AWAITING_NEW_MFA')
    expect(res.approvedByAccountId).toBe('approver')
    expect(factors.deleteTotpFactor).toHaveBeenCalledWith('superAdmin', 'superAdmin-totp-1')
    expect(audits(id)).toContain('EMERGENCY_APPROVED')
  })

  it('cannot approve before email verification', async () => {
    await assignApprover('superAdmin', 'approver')
    const r = await createRecoveryRequest(actor('superAdmin'), REASON)
    await expectError(approveRecovery(actor('approver'), r.id, 'SUPER_ADMIN_EMERGENCY', true), 'OTP_NOT_VERIFIED', 409)
  })

  it.each(['reviewer', 'plainAdmin', 'approver2'])('unassigned admin %s cannot view, approve or reject', async (id) => {
    const reqId = await emergencyVerified()
    await expectError(getRequestForAdmin(actor(id), reqId), 'NOT_FOUND', 404)
    await expectError(approveRecovery(actor(id), reqId, 'SUPER_ADMIN_EMERGENCY', true), 'NOT_FOUND', 404)
    await expectError(rejectRecovery(actor(id), reqId, 'SUPER_ADMIN_EMERGENCY', 'Not me'), 'NOT_FOUND', 404)
    expect((await listMyApprovals(actor(id), {})).items).toHaveLength(0)
    expect(factors.deleteTotpFactor).not.toHaveBeenCalled()
  })

  it('the requesting super admin cannot approve their own request', async () => {
    const id = await emergencyVerified()
    await expectError(approveRecovery(actor('superAdmin'), id, 'SUPER_ADMIN_EMERGENCY', true), 'SELF_APPROVAL_FORBIDDEN', 403)
    await expectError(approveRecovery(actor('superAdmin'), id, 'STANDARD', true), 'NOT_FOUND', 404)
  })

  it('a deactivated approver can no longer approve', async () => {
    const id = await emergencyVerified()
    const deactivated = { ...actor('approver'), adminActive: false }
    await expectError(approveRecovery(deactivated, id, 'SUPER_ADMIN_EMERGENCY', true), 'APPROVER_NOT_AUTHORIZED', 403)
  })

  it('reassigning the approver does not move an open request to the new approver', async () => {
    const id = await emergencyVerified()
    await assignApprover('superAdmin', 'approver2')
    await expectError(approveRecovery(actor('approver2'), id, 'SUPER_ADMIN_EMERGENCY', true), 'NOT_FOUND', 404)
    expect((await approveRecovery(actor('approver'), id, 'SUPER_ADMIN_EMERGENCY', true)).status).toBe('AWAITING_NEW_MFA')
  })

  it('the approver can reject with a mandatory reason', async () => {
    const id = await emergencyVerified()
    await expectError(rejectRecovery(actor('approver'), id, 'SUPER_ADMIN_EMERGENCY', ' '), 'INVALID_REASON', 400)
    const res = await rejectRecovery(actor('approver'), id, 'SUPER_ADMIN_EMERGENCY', 'Could not confirm by phone')
    expect(res.status).toBe('REJECTED')
    expect(audits(id)).toContain('EMERGENCY_REJECTED')
    expect(factors.deleteTotpFactor).not.toHaveBeenCalled()
  })

  it('completes after the super admin registers a new authenticator', async () => {
    const id = await emergencyVerified()
    await approveRecovery(actor('approver'), id, 'SUPER_ADMIN_EMERGENCY', true)
    vi.setSystemTime(new Date(Date.now() + 60_000))
    factorsById.superAdmin = [{ id: 'sa-new', status: 'verified', createdAt: new Date().toISOString() }]
    expect((await completeRecoveryEnrollment(actor('superAdmin'))).completed).toBe(true)
  })
})

describe('audit log completeness', () => {
  it('records every step of an emergency recovery with actors and no secrets', async () => {
    const id = await emergencyVerified()
    await approveRecovery(actor('approver'), id, 'SUPER_ADMIN_EMERGENCY', true)
    vi.setSystemTime(new Date(Date.now() + 60_000))
    factorsById.superAdmin = [{ id: 'sa-new', status: 'verified', createdAt: new Date().toISOString() }]
    await completeRecoveryEnrollment(actor('superAdmin'))

    const history = await getRequestHistory(actor('approver'), id)
    expect(history.map((h) => h.action)).toEqual([
      'REQUEST_CREATED', 'OTP_SENT', 'OTP_VERIFIED', 'APPROVER_NOTIFIED',
      'EMERGENCY_APPROVED', 'MFA_RESET', 'AWAITING_NEW_MFA', 'COMPLETED',
    ])
    const byAction = Object.fromEntries(history.map((h) => [h.action, h]))
    expect(byAction.REQUEST_CREATED.actorAccountId).toBe('superAdmin')
    expect(byAction.EMERGENCY_APPROVED.actorAccountId).toBe('approver')
    expect(byAction.EMERGENCY_APPROVED.actorRole).toBe('SUPER_ADMIN:ADMIN')
    expect(byAction.APPROVER_NOTIFIED.actorRole).toBe('SYSTEM')

    const serialized = JSON.stringify(db.mfaRecoveryAuditLog)
    const codes = vi.mocked(emails.sendRecoveryOtp).mock.calls.map((c) => c[1])
    for (const code of codes) expect(serialized).not.toContain(code)
    expect(serialized).not.toMatch(/otpHash|password|secret/i)
  })
})
