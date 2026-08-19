import "server-only";

/**
 * Fixed-window rate limiter.
 *
 * Deliberately in-memory: it needs no infrastructure and stops the failure
 * mode that actually matters today, which is a single caller looping an
 * expensive endpoint. On serverless the counter is per-instance, so the real
 * ceiling is `limit * activeInstances` rather than `limit`. That is a weaker
 * guarantee than a shared store, but it is bounded, and it is a very large
 * improvement over no limit at all.
 *
 * When traffic justifies it, swap the body of `check` for Upstash Redis
 * (@upstash/ratelimit) and keep this signature. Nothing else has to change.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

const MAX_TRACKED_KEYS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export type RateLimitOptions = {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/**
 * Records a hit against `key` and reports whether it is permitted.
 * Call once per request, before doing any expensive work.
 */
export function checkRateLimit(
  key: string,
  { limit, windowSeconds }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  sweepIfNeeded(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });

    return {
      ok: true,
      limit,
      remaining: limit - 1,
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;

  const permitted = existing.count <= limit;

  return {
    ok: permitted,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSeconds: permitted
      ? 0
      : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/**
 * Standard headers so clients can back off politely rather than hammering.
 */
export function rateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };

  if (!result.ok) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

/**
 * Best-effort client identifier for unauthenticated routes.
 * Prefer a user or company ID whenever one is available: an IP is shared by
 * everyone behind a corporate NAT, which is exactly the shape of a brokerage.
 */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

function sweepIfNeeded(now: number): void {
  if (buckets.size < MAX_TRACKED_KEYS) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  // Still oversized after removing expired entries: drop the oldest windows
  // rather than let the map grow without bound.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const sorted = [...buckets.entries()].sort(
      (a, b) => a[1].resetAt - b[1].resetAt
    );

    for (const [key] of sorted.slice(0, Math.floor(MAX_TRACKED_KEYS / 4))) {
      buckets.delete(key);
    }
  }
}