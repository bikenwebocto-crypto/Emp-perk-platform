import { prisma } from '@/lib/prisma';

/**
 * Fixed-window rate limiting for unauthenticated endpoints.
 *
 * The backend is hidden behind `RateLimiter` so it can be swapped for Redis (or
 * anything else) without touching call sites. `getRateLimiter()` returns the
 * active implementation.
 *
 * There is no Redis client in this project, so the default implementation uses a
 * Postgres counter table (`rate_limit_counters`) serialised per key with a
 * transaction-scoped advisory lock, which keeps concurrent requests for the same
 * key from racing past the limit.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the current window resets. 0 when the request was allowed. */
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimiter {
  readonly backend: string;
  consume(key: string, options: RateLimitOptions): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

class PostgresRateLimiter implements RateLimiter {
  readonly backend = 'postgres';

  async consume(key: string, { limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rate_limit:${key}`}))`;

      const now = Date.now();
      const existing = await tx.rateLimitCounter.findUnique({ where: { key } });
      const windowExpired = !existing || now >= existing.windowStart.getTime() + windowMs;

      if (windowExpired) {
        await tx.rateLimitCounter.upsert({
          where: { key },
          create: { key, count: 1, windowStart: new Date(now) },
          update: { count: 1, windowStart: new Date(now) },
        });
        return { allowed: true, limit, remaining: Math.max(0, limit - 1), retryAfterSeconds: 0 };
      }

      const used = existing!.count;
      if (used >= limit) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((existing!.windowStart.getTime() + windowMs - now) / 1000),
        );
        return { allowed: false, limit, remaining: 0, retryAfterSeconds };
      }

      await tx.rateLimitCounter.update({ where: { key }, data: { count: { increment: 1 } } });
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - used - 1),
        retryAfterSeconds: 0,
      };
    });
  }

  async reset(key: string): Promise<void> {
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  }
}

let activeLimiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!activeLimiter) activeLimiter = new PostgresRateLimiter();
  return activeLimiter;
}

/** Test seam: swap the backend (or reset state between cases). */
export function setRateLimiter(limiter: RateLimiter | null): void {
  activeLimiter = limiter;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:.]{2,45}$/;

function isIp(value: string): boolean {
  return value.length <= 45 && (IPV4.test(value) || (value.includes(':') && IPV6.test(value)));
}

/**
 * Number of trusted reverse proxies in front of the app (TRUSTED_PROXY_HOPS,
 * default 1). 0 = no proxy: forwarded headers are ignored entirely.
 */
export function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (raw === undefined || raw.trim() === '') return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

/**
 * Client IP derived only from headers our own proxies set, or null.
 *
 * Each trusted proxy APPENDS the address it received the connection from, so
 * the leftmost x-forwarded-for entries are client-controlled and must not be
 * trusted. With N trusted hops the real client is the Nth entry from the right.
 */
export function clientIpOrNull(request: {
  headers: { get(name: string): string | null };
}): string | null {
  const hops = trustedProxyHops();
  if (hops === 0) return null;

  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    const candidate = parts.length >= hops ? parts[parts.length - hops] : undefined;
    return candidate && isIp(candidate) ? candidate : null;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  return realIp && isIp(realIp) ? realIp : null;
}

/** Best-effort client IP for per-IP limiting behind a trusted proxy. */
export function clientIpFromRequest(request: {
  headers: { get(name: string): string | null };
}): string {
  return clientIpOrNull(request) ?? 'unknown';
}