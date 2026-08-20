import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  checkRateLimit,
  rateLimitHeaders,
  clientIdentifier,
} from "@/lib/security/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("permits requests up to the limit", () => {
    const key = `test:${Math.random()}`;

    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit(key, { limit: 5, windowSeconds: 60 }).ok).toBe(
        true
      );
    }
  });

  it("rejects the request that exceeds the limit", () => {
    const key = `test:${Math.random()}`;
    const options = { limit: 3, windowSeconds: 60 };

    checkRateLimit(key, options);
    checkRateLimit(key, options);
    checkRateLimit(key, options);

    const blocked = checkRateLimit(key, options);

    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets once the window elapses", () => {
    const key = `test:${Math.random()}`;
    const options = { limit: 2, windowSeconds: 60 };

    checkRateLimit(key, options);
    checkRateLimit(key, options);
    expect(checkRateLimit(key, options).ok).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect(checkRateLimit(key, options).ok).toBe(true);
  });

  it("tracks each key independently", () => {
    const options = { limit: 1, windowSeconds: 60 };
    const a = `test:a:${Math.random()}`;
    const b = `test:b:${Math.random()}`;

    expect(checkRateLimit(a, options).ok).toBe(true);
    expect(checkRateLimit(a, options).ok).toBe(false);

    // Company B must not be throttled by company A's traffic.
    expect(checkRateLimit(b, options).ok).toBe(true);
  });

  it("reports remaining capacity accurately", () => {
    const key = `test:${Math.random()}`;
    const options = { limit: 10, windowSeconds: 60 };

    expect(checkRateLimit(key, options).remaining).toBe(9);
    expect(checkRateLimit(key, options).remaining).toBe(8);
  });
});

describe("rateLimitHeaders", () => {
  it("omits Retry-After while under the limit", () => {
    const headers = rateLimitHeaders({
      ok: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });

    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers).not.toHaveProperty("Retry-After");
  });

  it("sets Retry-After once blocked", () => {
    const headers = rateLimitHeaders({
      ok: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterSeconds: 30,
    });

    expect(headers["Retry-After"]).toBe("30");
  });
});

describe("clientIdentifier", () => {
  it("takes the first hop from x-forwarded-for", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" },
    });

    expect(clientIdentifier(request)).toBe("203.0.113.5");
  });

  it("falls back to a sentinel when no address is present", () => {
    expect(clientIdentifier(new Request("https://example.com"))).toBe(
      "unknown"
    );
  });
});