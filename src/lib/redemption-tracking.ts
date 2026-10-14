import { Prisma, type PrismaClient } from '@prisma/client'

type Tx = PrismaClient | Prisma.TransactionClient

export class OfferNotActiveError extends Error {
  code = 'OFFER_INACTIVE'
  constructor(message = 'This offer is no longer available.') {
    super(message)
  }
}

export class OfferLimitReachedError extends Error {
  code = 'OFFER_LIMIT_REACHED'
  constructor(message = 'This offer has reached its maximum redemption limit and is no longer available.') {
    super(message)
  }
}

export class AlreadyRedeemedError extends Error {
  code = 'ALREADY_REDEEMED'
  constructor(message = 'You have already redeemed this offer.') {
    super(message)
  }
}

/**
 * Per-offer repeat cooldown, read from OfferRedemption.configuration
 * `repeatAfterHours`. Returns null (one redemption ever) when missing,
 * non-numeric, or <= 0.
 */
export function getRepeatAfterHours(configuration: unknown): number | null {
  if (!configuration || typeof configuration !== 'object') return null
  const raw = (configuration as Record<string, unknown>).repeatAfterHours
  const hours = typeof raw === 'string' ? Number(raw) : raw
  return typeof hours === 'number' && Number.isFinite(hours) && hours > 0 ? hours : null
}

/**
 * Parse `repeatAfterHours` from an offer create/edit request body.
 *   - undefined          → { ok: true, value: undefined } (not sent; leave config alone)
 *   - null or ''         → { ok: true, value: null }      (clear / not set)
 *   - finite number > 0  → { ok: true, value }
 *   - anything else      → { ok: false }
 */
export function parseRepeatAfterHoursInput(
  raw: unknown,
): { ok: true; value: number | null | undefined } | { ok: false } {
  if (raw === undefined) return { ok: true, value: undefined }
  if (raw === null || raw === '') return { ok: true, value: null }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return { ok: true, value: raw }
  return { ok: false }
}

/**
 * Return a copy of a redemption configuration with `repeatAfterHours` set
 * (number) or removed (null). Other keys are preserved.
 */
export function withRepeatAfterHours(
  config: Record<string, unknown>,
  value: number | null,
): Record<string, unknown> {
  const next = { ...config }
  if (value == null) delete next.repeatAfterHours
  else next.repeatAfterHours = value
  return next
}

/**
 * Employee-facing redeem state for an offer given their latest redemption.
 *   - no redemption              → not redeemed
 *   - no cooldown                → redeemed forever (nextRedeemAt null)
 *   - cooldown not yet elapsed   → redeemed, nextRedeemAt = last + cooldown
 *   - cooldown elapsed           → not redeemed
 */
export function getRedeemState(
  lastRedeemedAt: Date | null | undefined,
  repeatAfterHours: number | null,
  now: Date = new Date(),
): { isRedeemed: boolean; nextRedeemAt: Date | null } {
  if (!lastRedeemedAt) return { isRedeemed: false, nextRedeemAt: null }
  if (repeatAfterHours == null) return { isRedeemed: true, nextRedeemAt: null }
  const next = new Date(lastRedeemedAt.getTime() + repeatAfterHours * 3_600_000)
  return next > now
    ? { isRedeemed: true, nextRedeemAt: next }
    : { isRedeemed: false, nextRedeemAt: null }
}

/**
 * Ensure a capacity-tracking row exists for the offer.
 * Copies the current maxRedemptions from OfferRedemption the first time
 * (mirrors existing schema); subsequent calls are no-ops.
 *
 * Safe to call repeatedly.
 */
export async function ensureCapacityRow(
  tx: Tx,
  offerId: string,
  maxRedemptions: number | null,
): Promise<void> {
  await tx.offerRedemptionCapacity.upsert({
    where: { offerId },
    create: { offerId, maxRedemptions, redeemedCount: 0 },
    update: {},
  })
}

/**
 * Atomically reserve one redemption slot for the offer.
 *
 * Uses a conditional UPDATE so two concurrent requests cannot both succeed
 * when only one slot remains:
 *
 *   UPDATE offer_redemption_capacity
 *      SET "redeemedCount" = "redeemedCount" + 1,
 *          "lastRedeemedAt" = NOW(),
 *          "updatedAt" = NOW()
 *    WHERE "offerId" = $1
 *      AND ("maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions")
 *
 * Returns true on success, false if the limit was reached.
 */
export async function reserveCapacity(
  tx: Tx,
  offerId: string,
): Promise<{ ok: boolean; capacity?: { maxRedemptions: number | null; redeemedCount: number } }> {
  const result = await tx.$executeRaw(
    Prisma.sql`
      UPDATE "offer_redemption_capacity"
         SET "redeemedCount" = "redeemedCount" + 1,
             "lastRedeemedAt" = NOW(),
             "updatedAt" = NOW()
       WHERE "offerId" = ${offerId}::uuid
         AND ("maxRedemptions" IS NULL OR "redeemedCount" < "maxRedemptions")
    `,
  )
  if (result === 0) {
    return { ok: false }
  }
  const capacity = await tx.offerRedemptionCapacity.findUnique({
    where: { offerId },
    select: { maxRedemptions: true, redeemedCount: true },
  })
  return { ok: true, capacity: capacity ?? undefined }
}

/**
 * Release a reserved slot (rollback path). Only decrements if it would not
 * underflow below zero.
 */
export async function releaseCapacity(tx: Tx, offerId: string): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`
      UPDATE "offer_redemption_capacity"
         SET "redeemedCount" = "redeemedCount" - 1,
             "updatedAt" = NOW()
       WHERE "offerId" = ${offerId}::uuid
         AND "redeemedCount" > 0
    `,
  )
}

/**
 * Atomically claim a redemption slot for this employee on this offer.
 * Returns true on first attempt, false if a row already exists.
 *
 * The DB-level UNIQUE(offerId, employeeId) constraint makes this race-safe —
 * two concurrent requests from the same employee cannot both succeed.
 *
 * When the offer has a repeat cooldown, attempt rows older than the cutoff
 * are deleted first (same transaction) so the insert can succeed again.
 */
export async function claimAttempt(
  tx: Tx,
  offerId: string,
  employeeId: string,
  repeatAfterHours: number | null = null,
): Promise<{ ok: boolean; attemptId?: string }> {
  if (repeatAfterHours != null && repeatAfterHours > 0) {
    const cutoff = new Date(Date.now() - repeatAfterHours * 3_600_000)
    await tx.offerRedemptionAttempt.deleteMany({
      where: { offerId, employeeId, createdAt: { lt: cutoff } },
    })
  }
  try {
    const attempt = await tx.offerRedemptionAttempt.create({
      data: { offerId, employeeId },
      select: { id: true },
    })
    return { ok: true, attemptId: attempt.id }
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return { ok: false }
    }
    throw err
  }
}

/**
 * Link an attempt to its Redemption row once the Redemption is created.
 * Errors are swallowed — the link is informational only and shouldn't fail
 * the redemption flow.
 */
export async function linkAttemptToRedemption(
  tx: Tx,
  attemptId: string,
  redemptionId: string,
): Promise<void> {
  try {
    await tx.offerRedemptionAttempt.update({
      where: { id: attemptId },
      data: { redemptionId },
    })
  } catch {
    /* best-effort */
  }
}

/**
 * Compute offer status from the capacity row.
 *   - "ENDED"   when capacity exists and maxRedemptions is set and count >= max
 *   - "ACTIVE"  otherwise (includes null/unlimited and "no capacity row")
 */
export function deriveCapacityStatus(
  capacity: { maxRedemptions: number | null; redeemedCount: number } | null | undefined,
): 'ACTIVE' | 'ENDED' {
  if (!capacity) return 'ACTIVE'
  if (capacity.maxRedemptions == null) return 'ACTIVE'
  if (capacity.redeemedCount >= capacity.maxRedemptions) return 'ENDED'
  return 'ACTIVE'
}
