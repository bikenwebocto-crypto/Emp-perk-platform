import type { MfaRecoveryRequest, MfaRecoveryStatus, MfaRecoveryType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getRateLimiter } from '@/lib/rate-limit'
import {
  APPROVER_ADMIN_ROLES,
  EXPIRABLE_STATUSES,
  FRESH_MFA_WINDOW_MS,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  MIN_REJECTION_REASON_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_SENDS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  OTP_VERIFY_RATE_LIMIT,
  REJECTABLE_STATUSES,
  REQUEST_RATE_LIMIT,
  REQUEST_TTL_MS,
  canTransition,
  isOpenStatus,
  isStandardReviewer,
  recoveryTypeForRole,
} from '@/lib/mfa-recovery/constants'
import { generateOtp, hashOtp, otpMatches } from '@/lib/mfa-recovery/otp'
import { deleteTotpFactor, listVerifiedTotpFactors } from '@/lib/mfa-recovery/factors'
import {
  listApproverCandidates,
  listStandardReviewerEmails,
  loadRecoveryAccount,
  type RecoveryAccount,
} from '@/lib/mfa-recovery/accounts'
import * as emails from '@/lib/mfa-recovery/emails'

// Admin-managed MFA recovery. Every state change is a compare-and-set
// (updateMany guarded by the expected current status), so concurrent calls
// cannot both win, and every change writes an mfa_recovery_audit_logs row.
// Supabase factor removal happens outside DB transactions, only from APPROVED,
// and is idempotent so a failed attempt can be retried.

export class MfaRecoveryError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'MfaRecoveryError'
  }
}

/** Who is calling. Always built server-side from the session, never from the body. */
export interface RecoveryActor {
  accountId: string
  email: string
  accountRole: string
  adminRole: string | null
  adminActive: boolean | null
  ip?: string | null
}

type Db = Prisma.TransactionClient | typeof prisma

const SYSTEM = 'SYSTEM'

function actorRoleLabel(actor: RecoveryActor | null): string {
  if (!actor) return SYSTEM
  return actor.accountRole === 'SUPER_ADMIN' ? `SUPER_ADMIN:${actor.adminRole ?? 'UNKNOWN'}` : actor.accountRole
}

async function audit(
  db: Db,
  entry: {
    request?: Pick<MfaRecoveryRequest, 'id' | 'accountId'> | null
    subjectAccountId?: string | null
    actor: RecoveryActor | null
    action: string
    previousStatus?: MfaRecoveryStatus | null
    newStatus?: MfaRecoveryStatus | null
    metadata?: Record<string, unknown>
  },
) {
  // Metadata must never carry OTPs, factor secrets or passwords.
  await db.mfaRecoveryAuditLog.create({
    data: {
      recoveryRequestId: entry.request?.id ?? null,
      subjectAccountId: entry.subjectAccountId ?? entry.request?.accountId ?? null,
      actorAccountId: entry.actor?.accountId ?? null,
      actorRole: actorRoleLabel(entry.actor),
      action: entry.action,
      previousStatus: entry.previousStatus ?? null,
      newStatus: entry.newStatus ?? null,
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: entry.actor?.ip?.slice(0, 45) ?? null,
    },
  })
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002'
}

// ─────────────────────────────────────────────────────────────
// Views (what each audience may see)
// ─────────────────────────────────────────────────────────────

export function toUserView(r: MfaRecoveryRequest) {
  return {
    id: r.id,
    recoveryType: r.recoveryType,
    status: r.status,
    requestedAt: r.requestedAt,
    expiresAt: r.expiresAt,
    otpSentAt: r.otpSentAt,
    otpVerifiedAt: r.otpVerifiedAt,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
    rejectionReason: r.rejectionReason,
    resetAt: r.resetAt,
    completedAt: r.completedAt,
  }
}

export function toAdminView(r: MfaRecoveryRequest, account?: Pick<RecoveryAccount, 'displayName'> | null) {
  return {
    ...toUserView(r),
    accountId: r.accountId,
    accountRole: r.accountRole,
    displayName: account?.displayName ?? null,
    registeredEmail: r.registeredEmail,
    registeredPhone: r.registeredPhone,
    reason: r.reason,
    otpSendCount: r.otpSendCount,
    assignedApproverAccountId: r.assignedApproverAccountId,
    reviewedByAccountId: r.reviewedByAccountId,
    reviewedAt: r.reviewedAt,
    approvedByAccountId: r.approvedByAccountId,
    rejectedByAccountId: r.rejectedByAccountId,
    resetFactorIds: r.resetFactorIds,
    resetError: r.resetError,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

async function invalidateOtps(db: Db, recoveryRequestId: string, now: Date) {
  await db.mfaRecoveryOtp.updateMany({
    where: { recoveryRequestId, consumedAt: null },
    data: { consumedAt: now },
  })
}

/** Lazily expire an open request that sat too long before approval. */
async function expireIfStale(r: MfaRecoveryRequest, now = new Date()): Promise<MfaRecoveryRequest> {
  if (!EXPIRABLE_STATUSES.includes(r.status) || r.expiresAt > now) return r
  const res = await prisma.mfaRecoveryRequest.updateMany({
    where: { id: r.id, status: r.status },
    data: { status: 'EXPIRED', activeKey: null },
  })
  if (res.count > 0) {
    await invalidateOtps(prisma, r.id, now)
    await audit(prisma, { request: r, actor: null, action: 'REQUEST_EXPIRED', previousStatus: r.status, newStatus: 'EXPIRED' })
  }
  return { ...r, status: 'EXPIRED', activeKey: null }
}

async function findOpenRequest(accountId: string): Promise<MfaRecoveryRequest | null> {
  const r = await prisma.mfaRecoveryRequest.findUnique({ where: { activeKey: accountId } })
  if (!r) return null
  const fresh = await expireIfStale(r)
  return isOpenStatus(fresh.status) ? fresh : null
}

async function consumeRateLimit(key: string, opts: { limit: number; windowMs: number }, message: string) {
  const result = await getRateLimiter().consume(key, opts)
  if (!result.allowed) {
    throw new MfaRecoveryError(429, 'RATE_LIMITED', message, { retryAfterSeconds: result.retryAfterSeconds })
  }
}

/** Why an account cannot be a recovery approver, or null if it can. */
export async function approverIneligibility(candidate: RecoveryAccount | null): Promise<{ code: string; message: string } | null> {
  if (!candidate) return { code: 'APPROVER_NOT_FOUND', message: 'Approver account not found.' }
  if (candidate.role !== 'SUPER_ADMIN' || !(APPROVER_ADMIN_ROLES as readonly string[]).includes(candidate.adminRole ?? '')) {
    return { code: 'APPROVER_NOT_AUTHORIZED', message: 'The approver must be an active Super Admin or Admin.' }
  }
  if (candidate.status !== 'ACTIVE' || candidate.adminActive !== true) {
    return { code: 'APPROVER_INACTIVE', message: 'The approver account is not active.' }
  }
  const factors = await listVerifiedTotpFactors(candidate.accountId)
  if (factors.length === 0) {
    return { code: 'APPROVER_MFA_MISSING', message: 'The approver must have a verified authenticator.' }
  }
  return null
}

function requireStandardReviewer(actor: RecoveryActor) {
  if (actor.accountRole !== 'SUPER_ADMIN' || actor.adminActive === false || !isStandardReviewer(actor.adminRole)) {
    throw new MfaRecoveryError(403, 'FORBIDDEN', 'Only active Super Admins can manage recovery requests.')
  }
}

function requireAdminAccount(actor: RecoveryActor) {
  if (actor.accountRole !== 'SUPER_ADMIN' || actor.adminActive === false) {
    throw new MfaRecoveryError(403, 'FORBIDDEN', 'Only admin accounts can configure a recovery approver.')
  }
}

/**
 * Load a request an admin acts on and check the caller may act on it.
 * Requests the caller may not see are reported as 404 (no existence leak).
 */
async function loadForAdmin(actor: RecoveryActor, id: string, expectedType: MfaRecoveryType): Promise<MfaRecoveryRequest> {
  const notFound = new MfaRecoveryError(404, 'NOT_FOUND', 'Recovery request not found.')
  const r = await prisma.mfaRecoveryRequest.findUnique({ where: { id } })
  if (!r || r.recoveryType !== expectedType) throw notFound

  if (r.accountId === actor.accountId) {
    throw new MfaRecoveryError(403, 'SELF_APPROVAL_FORBIDDEN', 'You cannot act on your own recovery request.')
  }

  if (expectedType === 'STANDARD') {
    requireStandardReviewer(actor)
  } else {
    if (actor.accountRole !== 'SUPER_ADMIN' || r.assignedApproverAccountId !== actor.accountId) throw notFound
    if (actor.adminActive !== true || !(APPROVER_ADMIN_ROLES as readonly string[]).includes(actor.adminRole ?? '')) {
      throw new MfaRecoveryError(403, 'APPROVER_NOT_AUTHORIZED', 'Your account can no longer approve recovery requests.')
    }
  }
  return expireIfStale(r)
}

// ─────────────────────────────────────────────────────────────
// User side (locked-out account, AAL1 session)
// ─────────────────────────────────────────────────────────────

export async function createRecoveryRequest(actor: RecoveryActor, rawReason: unknown) {
  const reason = typeof rawReason === 'string' ? rawReason.trim() : ''
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    throw new MfaRecoveryError(400, 'INVALID_REASON', `Reason must be ${MIN_REASON_LENGTH}-${MAX_REASON_LENGTH} characters.`)
  }

  const account = await loadRecoveryAccount(actor.accountId)
  if (!account || account.status !== 'ACTIVE') {
    throw new MfaRecoveryError(403, 'ACCOUNT_INACTIVE', 'This account is not active.')
  }
  const recoveryType = recoveryTypeForRole(account.role)
  if (!recoveryType) {
    throw new MfaRecoveryError(403, 'NOT_ELIGIBLE', 'MFA recovery is not available for this account type.')
  }

  if (await findOpenRequest(account.accountId)) {
    throw new MfaRecoveryError(409, 'DUPLICATE_REQUEST', 'You already have an open recovery request.')
  }

  await consumeRateLimit(`mfa-recovery-request:${account.accountId}`, REQUEST_RATE_LIMIT, 'Too many recovery requests. Try again later.')

  const factors = await listVerifiedTotpFactors(account.accountId)
  if (factors.length === 0) {
    throw new MfaRecoveryError(409, 'NO_MFA_ENROLLED', 'No authenticator is registered. Sign in to set one up.')
  }

  let approver: RecoveryAccount | null = null
  if (recoveryType === 'SUPER_ADMIN_EMERGENCY') {
    const assignment = await prisma.mfaRecoveryApprover.findFirst({
      where: { superAdminAccountId: account.accountId, isActive: true },
    })
    if (!assignment) {
      throw new MfaRecoveryError(409, 'NO_RECOVERY_APPROVER',
        'No recovery approver is configured for this account. Follow the company emergency recovery procedure.')
    }
    approver = await loadRecoveryAccount(assignment.approverAccountId)
    const problem = await approverIneligibility(approver)
    if (problem) {
      throw new MfaRecoveryError(409, 'APPROVER_UNAVAILABLE',
        'Your recovery approver cannot approve requests right now. Follow the company emergency recovery procedure.',
        { reason: problem.code })
    }
  }

  const now = new Date()
  let request: MfaRecoveryRequest
  try {
    request = await prisma.$transaction(async (tx) => {
      const created = await tx.mfaRecoveryRequest.create({
        data: {
          accountId: account.accountId,
          requestedByAccountId: actor.accountId,
          accountRole: account.role,
          registeredEmail: account.email,
          registeredPhone: account.phone,
          reason,
          recoveryType,
          status: 'PENDING',
          activeKey: account.accountId,
          assignedApproverAccountId: approver?.accountId ?? null,
          requestedAt: now,
          expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
        },
      })
      await audit(tx, {
        request: created,
        actor,
        action: 'REQUEST_CREATED',
        newStatus: 'PENDING',
        metadata: { recoveryType, verifiedFactorCount: factors.length, assignedApproverAccountId: approver?.accountId ?? null },
      })
      return created
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new MfaRecoveryError(409, 'DUPLICATE_REQUEST', 'You already have an open recovery request.')
    }
    throw error
  }

  await emails.sendRequestReceived(account.email, recoveryType === 'SUPER_ADMIN_EMERGENCY')

  if (recoveryType === 'STANDARD') {
    await emails.sendStandardRequestToReviewers(await listStandardReviewerEmails(), account.displayName, account.role)
    return request
  }
  // Emergency: no reviewer step, the email code goes out straight away.
  return issueOtp(request, actor, account)
}

async function issueOtp(r: MfaRecoveryRequest, actor: RecoveryActor, account?: RecoveryAccount | null) {
  if (!canTransition(r.recoveryType, r.status, 'OTP_SENT')) {
    throw new MfaRecoveryError(409, 'INVALID_STATE', `A code cannot be sent while the request is ${r.status}.`)
  }
  const now = new Date()
  if (r.otpSendCount >= OTP_MAX_SENDS) {
    throw new MfaRecoveryError(429, 'OTP_SEND_LIMIT', 'The maximum number of codes for this request has been sent.')
  }
  if (r.otpSentAt && now.getTime() - r.otpSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new MfaRecoveryError(429, 'OTP_RESEND_COOLDOWN', 'Please wait before requesting another code.', {
      retryAfterSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - (now.getTime() - r.otpSentAt.getTime())) / 1000),
    })
  }

  // The code only ever goes to the email registered when the request was made.
  const current = account ?? (await loadRecoveryAccount(r.accountId))
  if (!current || current.email.toLowerCase() !== r.registeredEmail.toLowerCase()) {
    throw new MfaRecoveryError(409, 'EMAIL_CHANGED', 'The account email changed after the request was made. Reject this request.')
  }

  const isResend = r.otpSendCount > 0
  const code = generateOtp()
  const updated = await prisma.$transaction(async (tx) => {
    await invalidateOtps(tx, r.id, now)
    await tx.mfaRecoveryOtp.create({
      data: {
        recoveryRequestId: r.id,
        otpHash: hashOtp(r.id, code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        maxAttempts: OTP_MAX_ATTEMPTS,
      },
    })
    const res = await tx.mfaRecoveryRequest.updateMany({
      where: { id: r.id, status: r.status, otpSendCount: r.otpSendCount },
      data: {
        status: 'OTP_SENT',
        otpSentAt: now,
        otpSendCount: { increment: 1 },
        ...(actor.accountId !== r.accountId && !r.reviewedByAccountId
          ? { reviewedByAccountId: actor.accountId, reviewedAt: now }
          : {}),
      },
    })
    if (res.count === 0) throw new MfaRecoveryError(409, 'CONCURRENT_UPDATE', 'The request changed. Reload and try again.')
    await audit(tx, {
      request: r,
      actor,
      action: isResend ? 'OTP_RESENT' : 'OTP_SENT',
      previousStatus: r.status,
      newStatus: 'OTP_SENT',
      metadata: { sendNumber: r.otpSendCount + 1 },
    })
    return tx.mfaRecoveryRequest.findUnique({ where: { id: r.id } })
  })

  const sent = await emails.sendRecoveryOtp(r.registeredEmail, code, isResend)
  if (!sent) {
    await audit(prisma, { request: r, actor, action: 'OTP_EMAIL_FAILED' })
    throw new MfaRecoveryError(502, 'EMAIL_FAILED', 'The code email could not be sent. Try again shortly.')
  }
  return updated!
}

export async function resendOtpForUser(actor: RecoveryActor) {
  const r = await findOpenRequest(actor.accountId)
  if (!r) throw new MfaRecoveryError(404, 'NO_OPEN_REQUEST', 'You have no open recovery request.')
  if (r.status !== 'OTP_SENT') {
    throw new MfaRecoveryError(409, 'INVALID_STATE', 'A new code can only be requested after the first code was sent.')
  }
  return toUserView(await issueOtp(r, actor))
}

export async function verifyRecoveryOtp(actor: RecoveryActor, rawCode: unknown) {
  const code = typeof rawCode === 'string' ? rawCode.trim() : ''
  await consumeRateLimit(`mfa-recovery-verify:${actor.accountId}`, OTP_VERIFY_RATE_LIMIT, 'Too many attempts. Try again later.')

  // The request is found from the session's account only: no request id from
  // the client, so a user can never verify someone else's request.
  const r = await findOpenRequest(actor.accountId)
  if (!r) throw new MfaRecoveryError(404, 'NO_OPEN_REQUEST', 'You have no open recovery request.')
  if (r.status !== 'OTP_SENT') {
    throw new MfaRecoveryError(409, 'INVALID_STATE', `No code is pending (request is ${r.status}).`)
  }

  const now = new Date()
  const otp = await prisma.mfaRecoveryOtp.findFirst({
    where: { recoveryRequestId: r.id, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  if (!otp || otp.expiresAt <= now) {
    throw new MfaRecoveryError(410, 'OTP_EXPIRED', 'This code has expired. Request a new one.')
  }

  // Count the attempt before comparing so parallel guesses cannot exceed the cap.
  const counted = await prisma.mfaRecoveryOtp.updateMany({
    where: { id: otp.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  })
  if (counted.count === 0) {
    throw new MfaRecoveryError(429, 'OTP_LOCKED', 'Too many wrong codes. Request a new one.')
  }
  const attemptsUsed = otp.attempts + 1

  if (!otpMatches(r.id, code, otp.otpHash)) {
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - attemptsUsed)
    await audit(prisma, { request: r, actor, action: 'OTP_FAILED', metadata: { attemptsUsed } })
    if (remaining === 0) {
      await prisma.mfaRecoveryOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: now } })
      await audit(prisma, { request: r, actor, action: 'OTP_LOCKED' })
      throw new MfaRecoveryError(429, 'OTP_LOCKED', 'Too many wrong codes. Request a new one.')
    }
    throw new MfaRecoveryError(400, 'OTP_INVALID', 'The code is incorrect.', { remainingAttempts: remaining })
  }

  const verified = await prisma.$transaction(async (tx) => {
    // Single use: only the first successful verify can consume the code.
    const consumed = await tx.mfaRecoveryOtp.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { verifiedAt: now, consumedAt: now },
    })
    if (consumed.count === 0) throw new MfaRecoveryError(409, 'OTP_ALREADY_USED', 'This code was already used.')
    const res = await tx.mfaRecoveryRequest.updateMany({
      where: { id: r.id, status: 'OTP_SENT' },
      data: { status: 'OTP_VERIFIED', otpVerifiedAt: now },
    })
    if (res.count === 0) throw new MfaRecoveryError(409, 'CONCURRENT_UPDATE', 'The request changed. Reload and try again.')
    await audit(tx, { request: r, actor, action: 'OTP_VERIFIED', previousStatus: 'OTP_SENT', newStatus: 'OTP_VERIFIED' })
    return tx.mfaRecoveryRequest.findUnique({ where: { id: r.id } })
  })

  if (r.recoveryType === 'SUPER_ADMIN_EMERGENCY' && r.assignedApproverAccountId) {
    const [approver, requester] = await Promise.all([
      loadRecoveryAccount(r.assignedApproverAccountId),
      loadRecoveryAccount(r.accountId),
    ])
    if (approver) {
      await emails.sendApproverNotified(approver.email, requester?.displayName ?? r.registeredEmail)
      await audit(prisma, { request: r, actor: null, action: 'APPROVER_NOTIFIED', metadata: { approverAccountId: approver.accountId } })
    }
  }
  return toUserView(verified!)
}

export async function getMyRecoveryRequest(actor: RecoveryActor) {
  const open = await findOpenRequest(actor.accountId)
  const r = open ?? (await prisma.mfaRecoveryRequest.findFirst({
    where: { accountId: actor.accountId },
    orderBy: { createdAt: 'desc' },
  }))
  return r ? toUserView(r) : null
}

/** Called after the user enrolls a new authenticator (AAL2 session). */
export async function completeRecoveryEnrollment(actor: RecoveryActor) {
  const r = await findOpenRequest(actor.accountId)
  if (!r || r.status !== 'AWAITING_NEW_MFA') return { completed: false, status: r?.status ?? null }

  const factors = await listVerifiedTotpFactors(r.accountId)
  const fresh = factors.find((f) => !r.resetFactorIds.includes(f.id) && (!r.resetAt || new Date(f.createdAt) >= r.resetAt))
  if (!fresh) {
    throw new MfaRecoveryError(409, 'NEW_MFA_NOT_FOUND', 'No newly verified authenticator was found.')
  }

  const now = new Date()
  const res = await prisma.$transaction(async (tx) => {
    const updated = await tx.mfaRecoveryRequest.updateMany({
      where: { id: r.id, status: 'AWAITING_NEW_MFA' },
      data: { status: 'COMPLETED', completedAt: now, newFactorId: fresh.id, activeKey: null },
    })
    if (updated.count > 0) {
      await audit(tx, {
        request: r, actor, action: 'COMPLETED', previousStatus: 'AWAITING_NEW_MFA', newStatus: 'COMPLETED',
        metadata: { newFactorId: fresh.id },
      })
    }
    return updated.count
  })
  if (res > 0) await emails.sendRecoveryCompleted(r.registeredEmail)
  return { completed: true, status: 'COMPLETED' as const }
}

// ─────────────────────────────────────────────────────────────
// Admin side (AAL2 enforced by middleware for /api/admin/*)
// ─────────────────────────────────────────────────────────────

export interface ListParams {
  status?: string | null
  role?: string | null
  /** Submission date range, inclusive, as YYYY-MM-DD (UTC). */
  from?: string | null
  to?: string | null
  q?: string | null
  page?: number
  pageSize?: number
  sort?: string | null
  order?: string | null
}

const SORT_FIELDS = ['requestedAt', 'updatedAt', 'status'] as const
const STANDARD_ROLE_FILTERS = ['MERCHANT', 'COMPANY_ADMIN'] as const
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Summary-card buckets. "Under review" covers every in-progress step. */
export const SUMMARY_BUCKETS = {
  pending: ['PENDING'],
  underReview: ['UNDER_REVIEW', 'OTP_SENT', 'OTP_VERIFIED', 'APPROVED', 'MFA_RESET', 'AWAITING_NEW_MFA'],
  completed: ['COMPLETED'],
  rejected: ['REJECTED'],
} as const satisfies Record<string, readonly MfaRecoveryStatus[]>

async function listRequests(where: Prisma.MfaRecoveryRequestWhereInput, params: ListParams) {
  const page = Math.max(1, Math.floor(params.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 20)))
  const sort = (SORT_FIELDS as readonly string[]).includes(params.sort ?? '') ? params.sort! : 'requestedAt'
  const order = params.order === 'asc' ? 'asc' : 'desc'

  // Expire stale rows first so filters and counts are accurate.
  const stale = await prisma.mfaRecoveryRequest.findMany({
    where: { ...where, status: { in: [...EXPIRABLE_STATUSES] }, expiresAt: { lt: new Date() } },
    take: 100,
  })
  for (const r of stale) await expireIfStale(r)

  const filter: Prisma.MfaRecoveryRequestWhereInput = { ...where }
  if (params.status) {
    const statuses = params.status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    filter.status = { in: statuses as MfaRecoveryStatus[] }
  }
  const role = params.role?.trim().toUpperCase()
  if (role && (STANDARD_ROLE_FILTERS as readonly string[]).includes(role)) {
    filter.accountRole = role as (typeof STANDARD_ROLE_FILTERS)[number]
  }
  const requestedAt: { gte?: Date; lt?: Date } = {}
  if (params.from && DATE_RE.test(params.from)) requestedAt.gte = new Date(`${params.from}T00:00:00.000Z`)
  if (params.to && DATE_RE.test(params.to)) {
    requestedAt.lt = new Date(new Date(`${params.to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
  }
  if (requestedAt.gte || requestedAt.lt) filter.requestedAt = requestedAt
  const q = params.q?.trim()
  if (q) {
    filter.OR = [
      { registeredEmail: { contains: q, mode: 'insensitive' } },
      { registeredPhone: { contains: q } },
      ...(UUID_RE.test(q) ? [{ id: q.toLowerCase() }] : []),
    ]
  }

  // Cards ignore the status filter so every bucket stays visible while filtering.
  const { status: _status, ...cardFilter } = filter
  void _status
  const countIn = (statuses: readonly MfaRecoveryStatus[]) =>
    prisma.mfaRecoveryRequest.count({ where: { ...cardFilter, status: { in: [...statuses] } } })

  const [items, total, all, pending, underReview, completed, rejected] = await Promise.all([
    prisma.mfaRecoveryRequest.findMany({
      where: filter,
      orderBy: { [sort]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mfaRecoveryRequest.count({ where: filter }),
    prisma.mfaRecoveryRequest.count({ where: cardFilter }),
    countIn(SUMMARY_BUCKETS.pending),
    countIn(SUMMARY_BUCKETS.underReview),
    countIn(SUMMARY_BUCKETS.completed),
    countIn(SUMMARY_BUCKETS.rejected),
  ])
  const owners = await Promise.all(items.map((r) => loadRecoveryAccount(r.accountId)))
  return {
    items: items.map((r, i) => toAdminView(r, owners[i])),
    summary: { total: all, pending, underReview, completed, rejected },
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function listStandardRequests(actor: RecoveryActor, params: ListParams) {
  requireStandardReviewer(actor)
  return listRequests({ recoveryType: 'STANDARD' }, params)
}

export async function listMyApprovals(actor: RecoveryActor, params: ListParams) {
  requireAdminAccount(actor)
  return listRequests({ recoveryType: 'SUPER_ADMIN_EMERGENCY', assignedApproverAccountId: actor.accountId }, params)
}

/** Detail for a reviewer (STANDARD) or the assigned approver (EMERGENCY). */
export async function getRequestForAdmin(actor: RecoveryActor, id: string) {
  const r = await prisma.mfaRecoveryRequest.findUnique({ where: { id }, select: { recoveryType: true } })
  if (!r) throw new MfaRecoveryError(404, 'NOT_FOUND', 'Recovery request not found.')
  const request = await loadForAdmin(actor, id, r.recoveryType)
  const [account, latestOtp] = await Promise.all([
    loadRecoveryAccount(request.accountId),
    prisma.mfaRecoveryOtp.findFirst({ where: { recoveryRequestId: id }, orderBy: { createdAt: 'desc' } }),
  ])
  const now = new Date()
  // Delivery/verification state only; the hash never leaves the server.
  const otp = latestOtp
    ? {
        sentAt: latestOtp.createdAt,
        expiresAt: latestOtp.expiresAt,
        attempts: latestOtp.attempts,
        maxAttempts: latestOtp.maxAttempts,
        verifiedAt: latestOtp.verifiedAt,
        state: latestOtp.verifiedAt
          ? 'VERIFIED'
          : latestOtp.consumedAt
            ? (latestOtp.attempts >= latestOtp.maxAttempts ? 'LOCKED' : 'REPLACED')
            : latestOtp.expiresAt <= now
              ? 'EXPIRED'
              : 'AWAITING_USER',
      }
    : null
  return { ...toAdminView(request, account), otp }
}

/** Audit that a reviewer phoned the user (the call itself happens outside the app). */
export async function logContactAttempt(actor: RecoveryActor, id: string, rawNote: unknown) {
  const r = await loadForAdmin(actor, id, 'STANDARD')
  const note = typeof rawNote === 'string' ? rawNote.trim().slice(0, 500) : ''
  await audit(prisma, {
    request: r,
    actor,
    action: 'CONTACT_ATTEMPTED',
    metadata: { channel: 'PHONE', ...(note ? { note } : {}) },
  })
  return { logged: true }
}

export async function getRequestHistory(actor: RecoveryActor, id: string) {
  const r = await prisma.mfaRecoveryRequest.findUnique({ where: { id }, select: { recoveryType: true } })
  if (!r) throw new MfaRecoveryError(404, 'NOT_FOUND', 'Recovery request not found.')
  await loadForAdmin(actor, id, r.recoveryType)
  return prisma.mfaRecoveryAuditLog.findMany({
    where: { recoveryRequestId: id },
    orderBy: { createdAt: 'asc' },
  })
}

export async function markUnderReview(actor: RecoveryActor, id: string) {
  const r = await loadForAdmin(actor, id, 'STANDARD')
  if (r.status === 'UNDER_REVIEW') return toAdminView(r)
  if (!canTransition(r.recoveryType, r.status, 'UNDER_REVIEW')) {
    throw new MfaRecoveryError(409, 'INVALID_STATE', `Cannot start review while the request is ${r.status}.`)
  }
  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.mfaRecoveryRequest.updateMany({
      where: { id, status: r.status },
      data: { status: 'UNDER_REVIEW', reviewedByAccountId: actor.accountId, reviewedAt: now },
    })
    if (res.count === 0) throw new MfaRecoveryError(409, 'CONCURRENT_UPDATE', 'The request changed. Reload and try again.')
    await audit(tx, { request: r, actor, action: 'REVIEW_STARTED', previousStatus: r.status, newStatus: 'UNDER_REVIEW' })
    return tx.mfaRecoveryRequest.findUnique({ where: { id } })
  })
  return toAdminView(updated!)
}

export async function adminSendOtp(actor: RecoveryActor, id: string) {
  const r = await loadForAdmin(actor, id, 'STANDARD')
  return toAdminView(await issueOtp(r, actor))
}

async function performReset(r: MfaRecoveryRequest, actor: RecoveryActor) {
  let removed: string[] = []
  try {
    const factors = await listVerifiedTotpFactors(r.accountId)
    for (const f of factors) {
      await deleteTotpFactor(r.accountId, f.id)
      removed.push(f.id)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // Stay APPROVED so the same approval can retry the removal; never claim success.
    await prisma.mfaRecoveryRequest.updateMany({ where: { id: r.id, status: 'APPROVED' }, data: { resetError: message.slice(0, 500) } })
    await audit(prisma, { request: r, actor, action: 'FACTOR_REMOVAL_FAILED', metadata: { error: message.slice(0, 500), removedFactorIds: removed } })
    throw new MfaRecoveryError(502, 'RESET_FAILED', 'The authenticator could not be removed. Retry the approval.')
  }
  removed = [...new Set([...r.resetFactorIds, ...removed])]

  const now = new Date()
  const changed = await prisma.$transaction(async (tx) => {
    const res = await tx.mfaRecoveryRequest.updateMany({
      where: { id: r.id, status: 'APPROVED' },
      data: { status: 'AWAITING_NEW_MFA', resetAt: now, resetFactorIds: removed, resetError: null },
    })
    if (res.count === 0) return false
    await audit(tx, {
      request: r, actor, action: 'MFA_RESET', previousStatus: 'APPROVED', newStatus: 'MFA_RESET',
      metadata: { removedFactorIds: removed, alreadyRemoved: removed.length === 0 },
    })
    await audit(tx, { request: r, actor: null, action: 'AWAITING_NEW_MFA', previousStatus: 'MFA_RESET', newStatus: 'AWAITING_NEW_MFA' })
    return true
  })
  if (changed) await emails.sendRequestDecision(r.registeredEmail, true)
  return (await prisma.mfaRecoveryRequest.findUnique({ where: { id: r.id } }))!
}

export async function approveRecovery(actor: RecoveryActor, id: string, expectedType: MfaRecoveryType, confirm: unknown) {
  if (confirm !== true) {
    throw new MfaRecoveryError(400, 'CONFIRMATION_REQUIRED', 'Confirm that the existing authenticator should be removed.')
  }
  const r = await loadForAdmin(actor, id, expectedType)

  if (r.status === 'AWAITING_NEW_MFA' || r.status === 'COMPLETED') return toAdminView(r)
  if (r.status === 'APPROVED') return toAdminView(await performReset(r, actor)) // retry after a failed removal

  if (r.status !== 'OTP_VERIFIED' || !r.otpVerifiedAt) {
    throw new MfaRecoveryError(409, 'OTP_NOT_VERIFIED', 'The user must verify the email code before approval.')
  }

  if (expectedType === 'SUPER_ADMIN_EMERGENCY') {
    const self = await loadRecoveryAccount(actor.accountId)
    if (!self || self.status !== 'ACTIVE' || self.adminActive !== true) {
      throw new MfaRecoveryError(403, 'APPROVER_NOT_AUTHORIZED', 'Your account can no longer approve recovery requests.')
    }
  }

  const now = new Date()
  const approved = await prisma.$transaction(async (tx) => {
    const res = await tx.mfaRecoveryRequest.updateMany({
      where: { id, status: 'OTP_VERIFIED', recoveryType: expectedType },
      data: { status: 'APPROVED', approvedByAccountId: actor.accountId, approvedAt: now },
    })
    if (res.count === 0) throw new MfaRecoveryError(409, 'CONCURRENT_UPDATE', 'The request was already handled.')
    await audit(tx, {
      request: r, actor,
      action: expectedType === 'STANDARD' ? 'APPROVED' : 'EMERGENCY_APPROVED',
      previousStatus: 'OTP_VERIFIED', newStatus: 'APPROVED',
    })
    return tx.mfaRecoveryRequest.findUnique({ where: { id } })
  })
  return toAdminView(await performReset(approved!, actor))
}

export async function rejectRecovery(actor: RecoveryActor, id: string, expectedType: MfaRecoveryType, rawReason: unknown) {
  const reason = typeof rawReason === 'string' ? rawReason.trim() : ''
  if (reason.length < MIN_REJECTION_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    throw new MfaRecoveryError(400, 'INVALID_REASON', 'A rejection reason is required.')
  }
  const r = await loadForAdmin(actor, id, expectedType)
  if (!REJECTABLE_STATUSES.includes(r.status)) {
    throw new MfaRecoveryError(409, 'INVALID_STATE', `Cannot reject while the request is ${r.status}.`)
  }

  const now = new Date()
  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.mfaRecoveryRequest.updateMany({
      where: { id, status: r.status },
      data: { status: 'REJECTED', rejectedByAccountId: actor.accountId, rejectedAt: now, rejectionReason: reason, activeKey: null },
    })
    if (res.count === 0) throw new MfaRecoveryError(409, 'CONCURRENT_UPDATE', 'The request was already handled.')
    await invalidateOtps(tx, id, now)
    await audit(tx, {
      request: r, actor,
      action: expectedType === 'STANDARD' ? 'REJECTED' : 'EMERGENCY_REJECTED',
      previousStatus: r.status, newStatus: 'REJECTED', metadata: { reason },
    })
    return tx.mfaRecoveryRequest.findUnique({ where: { id } })
  })
  await emails.sendRequestDecision(r.registeredEmail, false, reason)
  return toAdminView(updated!)
}

// ─────────────────────────────────────────────────────────────
// Recovery approver configuration (each admin configures their own)
// ─────────────────────────────────────────────────────────────

export async function getApproverConfig(actor: RecoveryActor) {
  requireAdminAccount(actor)
  const assignment = await prisma.mfaRecoveryApprover.findFirst({
    where: { superAdminAccountId: actor.accountId, isActive: true },
  })
  const approver = assignment ? await loadRecoveryAccount(assignment.approverAccountId) : null
  const problem = assignment ? await approverIneligibility(approver) : null
  return {
    approver: assignment && approver
      ? {
          accountId: approver.accountId,
          name: approver.displayName,
          email: approver.email,
          assignedAt: assignment.assignedAt,
          available: !problem,
          unavailableReason: problem?.code ?? null,
        }
      : null,
    candidates: await listApproverCandidates(actor.accountId),
  }
}

export async function setRecoveryApprover(
  actor: RecoveryActor,
  rawApproverAccountId: unknown,
  freshMfaAt: Date | null,
) {
  requireAdminAccount(actor)
  if (!freshMfaAt || Date.now() - freshMfaAt.getTime() > FRESH_MFA_WINDOW_MS) {
    throw new MfaRecoveryError(401, 'REAUTH_REQUIRED', 'Verify your authenticator code again to change your recovery approver.')
  }
  const approverAccountId = typeof rawApproverAccountId === 'string' ? rawApproverAccountId.trim() : ''
  if (!approverAccountId) throw new MfaRecoveryError(400, 'INVALID_APPROVER', 'approverAccountId is required.')
  if (approverAccountId === actor.accountId) {
    throw new MfaRecoveryError(400, 'SELF_ASSIGNMENT', 'You cannot be your own recovery approver.')
  }

  const candidate = await loadRecoveryAccount(approverAccountId)
  const problem = await approverIneligibility(candidate)
  if (problem) throw new MfaRecoveryError(400, problem.code, problem.message)
  if (await findOpenRequest(approverAccountId)) {
    throw new MfaRecoveryError(409, 'APPROVER_UNAVAILABLE', 'That admin is recovering their own authenticator.')
  }

  const current = await prisma.mfaRecoveryApprover.findFirst({
    where: { superAdminAccountId: actor.accountId, isActive: true },
  })
  if (current?.approverAccountId === approverAccountId) return { changed: false }

  const now = new Date()
  try {
    await prisma.$transaction(async (tx) => {
      if (current) {
        const res = await tx.mfaRecoveryApprover.updateMany({
          where: { id: current.id, isActive: true },
          data: { isActive: false, revokedAt: now, revokedByAccountId: actor.accountId },
        })
        if (res.count === 0) throw new MfaRecoveryError(409, 'CONCURRENT_UPDATE', 'Your approver changed. Reload and try again.')
      }
      await tx.mfaRecoveryApprover.create({
        data: {
          superAdminAccountId: actor.accountId,
          approverAccountId,
          assignedByAccountId: actor.accountId,
          assignedAt: now,
        },
      })
      // Open emergency requests keep the approver snapshotted at creation.
      await audit(tx, {
        subjectAccountId: actor.accountId,
        actor,
        action: current ? 'APPROVER_CHANGED' : 'APPROVER_ASSIGNED',
        metadata: { previousApproverAccountId: current?.approverAccountId ?? null, newApproverAccountId: approverAccountId },
      })
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new MfaRecoveryError(409, 'CONCURRENT_UPDATE', 'Your approver changed. Reload and try again.')
    throw error
  }

  const [owner, previous] = await Promise.all([
    loadRecoveryAccount(actor.accountId),
    current ? loadRecoveryAccount(current.approverAccountId) : Promise.resolve(null),
  ])
  await emails.sendApproverAssignmentNotice({
    ownerEmail: owner?.email ?? actor.email,
    ownerName: owner?.displayName ?? actor.email,
    newApproverEmail: candidate!.email,
    newApproverName: candidate!.displayName,
    previousApproverEmail: previous?.email ?? null,
  })
  return { changed: true }
}

export async function getApproverHistory(actor: RecoveryActor) {
  requireAdminAccount(actor)
  const rows = await prisma.mfaRecoveryApprover.findMany({
    where: { superAdminAccountId: actor.accountId },
    orderBy: { assignedAt: 'desc' },
  })
  const ids = [...new Set(rows.map((r) => r.approverAccountId))]
  const people = new Map((await Promise.all(ids.map(loadRecoveryAccount))).filter(Boolean).map((a) => [a!.accountId, a!]))
  return rows.map((r) => ({
    ...r,
    approverName: people.get(r.approverAccountId)?.displayName ?? null,
    approverEmail: people.get(r.approverAccountId)?.email ?? null,
  }))
}
