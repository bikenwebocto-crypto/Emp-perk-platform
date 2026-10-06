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

/** Best-effort client IP for per-IP limiting behind a proxy. */
export function clientIpFromRequest(request: {
  headers: { get(name: string): string | null };
}): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}