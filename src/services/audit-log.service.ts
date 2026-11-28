import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { CurrentUser } from '@/lib/supabase/server';
import { clientIpOrNull } from '@/lib/rate-limit';
import { reportAuditAlert } from '@/lib/monitoring/audit-health';

export interface AuditLogInput {
  actorType: 'admin' | 'merchant' | 'company_admin' | 'employee' | 'system';

  actorId?: string | null;

  // Explicit foreign keys
  adminId?: string | null;
  merchantId?: string | null;
  companyAdminId?: string | null;
  employeeId?: string | null;

  /** Company the event belongs to (not an actor); read by company-scoped audit views. */
  companyId?: string | null;

  action: string;
  entityType: string;
  entityId: string;

  changes?: unknown;
  metadata?: unknown;

  /**
   * Request context. When omitted, `createAuditLog` resolves it from the
   * current Next.js request (if any). Explicit values win.
   */
  request?: AuditRequestContext;
}

export interface AuditRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Redaction
// ─────────────────────────────────────────────────────────────

export const REDACTED = '[REDACTED]';

/** Keys whose values are secrets and are never stored. */
const SECRET_KEY =
  /password|passwd|passphrase|^pass$|^pwd$|token|secret|otp|mfa_?code|recovery_?codes?|backup_?codes?|api_?key|private_?key|authorization|cookie|session_?id|^pin$|cvv|card_?number/i;

/** Keys holding codes that are useful for forensics: keep only the last 4 chars. */
const CODE_KEY = /^(code|redemption_?code|offer_?code|voucher_?code|promo_?code|qr_?code)$/i;

function maskCode(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return REDACTED;
  const s = String(value);
  return s.length > 4 ? `***${s.slice(-4)}` : REDACTED;
}

/**
 * Deep-copy `value`, replacing secrets. Passwords, tokens, OTPs, recovery codes
 * etc. become `[REDACTED]`; redemption/offer codes keep only their last 4
 * characters. Cycle-safe and depth-limited.
 */
export function redactAuditPayload(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth > 8) return '[TRUNCATED]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => redactAuditPayload(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    if (CODE_KEY.test(key)) out[key] = v === null ? null : maskCode(v);
    else if (SECRET_KEY.test(key)) out[key] = v === null ? null : REDACTED;
    else out[key] = redactAuditPayload(v, depth + 1, seen);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Request context
// ─────────────────────────────────────────────────────────────

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Build audit request context from a headers-like object. */
export function requestContextFromHeaders(h: { get(name: string): string | null }): AuditRequestContext {
  const requestId = h.get('x-request-id');
  return {
    ipAddress: clientIpOrNull({ headers: h }),
    userAgent: h.get('user-agent')?.slice(0, 500) || null,
    requestId: requestId && REQUEST_ID.test(requestId) ? requestId : null,
  };
}

/**
 * Context of the in-flight Next.js request. Outside a request scope (queue
 * workers, schedulers, scripts) `headers()` throws and nothing is returned.
 */
export async function resolveRequestContext(): Promise<AuditRequestContext> {
  try {
    const { headers } = await import('next/headers');
    return requestContextFromHeaders(await headers());
  } catch {
    return {};
  }
}

/**
 * Thrown when an audit event claims a non-system actor but no usable actor id
 * can be resolved. Previously the actor was silently rewritten to `system`,
 * which hid the identity of the real caller.
 */
export class AuditIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditIdentityError';
  }
}

export function buildAuditData(input: AuditLogInput) {
  const {
    actorType,
    actorId,

    adminId,
    merchantId,
    companyAdminId,
    employeeId,
    companyId,

    action,
    entityType,
    entityId,
    changes,
    metadata,
    request,
  } = input;

  const safeMetadata = redactAuditPayload(metadata ?? undefined);
  const requestId = request?.requestId ?? null;
  const metadataObject =
    safeMetadata && typeof safeMetadata === 'object' && !Array.isArray(safeMetadata)
      ? (safeMetadata as Record<string, unknown>)
      : safeMetadata === undefined
        ? {}
        : { value: safeMetadata };

  const data: any = {
    actorType,
    ...(companyId ? { companyId } : {}),
    action,
    entityType,
    entityId,
    changes: redactAuditPayload(changes ?? undefined),
    ...(request?.ipAddress ? { ipAddress: request.ipAddress.slice(0, 45) } : {}),
    ...(request?.userAgent ? { userAgent: request.userAgent.slice(0, 500) } : {}),
  };

  const finish = (extra: Record<string, unknown> = {}) => {
    const merged = { ...metadataObject, ...(requestId ? { requestId } : {}), ...extra };
    data.metadata = Object.keys(merged).length ? merged : undefined;
    return data;
  };

  // System-generated events deliberately have no actor FK. Do not attempt to
  // resolve one, and do not fall through to the default actor-type branch.
  if (actorType === 'system') {
    return finish();
  }

  // Fail closed: an audit row that claims an actor must carry that actor's id.
  // Silently downgrading to `system` destroys accountability.
  const explicitActorId =
    actorType === 'admin'
      ? adminId
      : actorType === 'merchant'
        ? merchantId
        : actorType === 'company_admin'
          ? companyAdminId
          : actorType === 'employee'
            ? employeeId
            : null;
  const resolvedActorId = explicitActorId ?? actorId;

  if (!resolvedActorId) {
    throw new AuditIdentityError(
      `Missing ${actorType} identity for audit action "${action}" on ${entityType}/${entityId}`,
    );
  }

  switch (actorType) {
    case 'admin':
      data.adminId = resolvedActorId;
      break;

    case 'merchant':
      // NEVER overwrite an explicitly supplied merchantId
      data.merchantId = resolvedActorId;
      break;

    case 'company_admin':
      data.companyAdminId = resolvedActorId;
      break;

    case 'employee':
      data.employeeId = resolvedActorId;
      break;

    default:
      // Unknown runtime actor types cannot be represented by a typed FK.
      return finish({ actorId: resolvedActorId, actor: { type: actorType, profileId: resolvedActorId } });
  }

  // Identity snapshot: survives the FK being nulled or the profile deleted.
  return finish({ actor: { type: actorType, profileId: resolvedActorId } });
}

type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'> | typeof prisma

/**
 * Persist an audit row. Audit failures are intentionally NOT swallowed:
 * callers (and their transactions) must see the error so a business change
 * cannot succeed without evidence.
 *
 * Pass a transaction client as `client` when the audited change happens inside
 * `$transaction`, so the state change and its evidence commit together.
 */
export async function createAuditLog(
  input: AuditLogInput,
  client: AuditWriter = prisma,
): Promise<void> {
  try {
    const data = await buildAuditDataWithContext(input);
    await client.auditLog.create({ data });
  } catch (err) {
    // Still rethrown: the caller's change must not commit without evidence.
    reportAuditAlert('audit_insert_failed', {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * `buildAuditData` plus the in-flight request's IP, user agent and request id.
 * Use this when writing `tx.auditLog.create({ data })` directly. Explicit
 * `input.request` values win over the ambient request.
 */
export async function buildAuditDataWithContext(input: AuditLogInput) {
  const ctx = await resolveRequestContext();
  return buildAuditData({
    ...input,
    request: {
      ipAddress: input.request?.ipAddress ?? ctx.ipAddress ?? null,
      userAgent: input.request?.userAgent ?? ctx.userAgent ?? null,
      requestId: input.request?.requestId ?? ctx.requestId ?? null,
    },
  });
}

export function fromCurrentUser(
  user: CurrentUser,
  action: string,
  entityType: string,
  entityId: string,
  opts?: {
    changes?: unknown;
    metadata?: unknown;
  },
): AuditLogInput {
  return {
    actorType: user.userType as AuditLogInput['actorType'],
    actorId: user.profileId,

    action,
    entityType,
    entityId,

    changes: opts?.changes,
    metadata: opts?.metadata,
  };
}
