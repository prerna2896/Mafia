// Coverage for the deferred V0 hardening items:
//  - retry/backoff for transient Gmail failures (429, 5xx, network)
//  - per-attempt timeout
//  - clean error UX when the refresh token is revoked
//
// These guard against future regressions even though the original symptoms
// were "deferred" until they actually bit a user.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  withTimeout,
  withResilience,
  withPacing,
  defaultIsRetriable,
  TimeoutError,
  TokenBucket,
  RateLimitedError,
  setGmailRateLimiter,
  resetGmailRateLimiter,
  QUOTA_UNITS_PER_SEC,
  BUCKET_CAPACITY,
} from '../src/gmail/resilience.js';
import { ReauthRequiredError } from '../src/gmail/client.js';

// ── withRetry ─────────────────────────────────────────────────────────────────

describe('resilience: withRetry', () => {
  it('returns immediately on first-try success', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const result = await withRetry(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and eventually succeeds', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('Too Many Requests'), { status: 429 });
      return 'ok';
    });
    const sleep = vi.fn(async () => {});
    const result = await withRetry(fn, { sleep, baseMs: 1, maxAttempts: 5 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2); // sleep before retries 2 and 3
  });

  it('retries on 503 and ENOTFOUND', async () => {
    const errors = [
      Object.assign(new Error('Service Unavailable'), { status: 503 }),
      Object.assign(new Error('DNS failure'), { code: 'ENOTFOUND' }),
    ];
    let i = 0;
    const fn = vi.fn(async () => {
      if (i < errors.length) throw errors[i++];
      return 'recovered';
    });
    const result = await withRetry(fn, { sleep: async () => {}, baseMs: 1 });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on 401 / 403 / 404 (permanent errors)', async () => {
    for (const status of [401, 403, 404]) {
      const fn = vi.fn(async () => {
        throw Object.assign(new Error(`status ${status}`), { status });
      });
      await expect(withRetry(fn, { sleep: async () => {}, baseMs: 1 })).rejects.toThrow(`status ${status}`);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('throws the last error after exhausting attempts', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('persistent 429'), { status: 429 });
    });
    await expect(withRetry(fn, { sleep: async () => {}, maxAttempts: 3, baseMs: 1 })).rejects.toThrow('persistent 429');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('honors custom isRetriable', async () => {
    let i = 0;
    const fn = vi.fn(async () => {
      if (i++ < 1) throw new Error('weird-but-retriable');
      return 'ok';
    });
    const result = await withRetry(fn, {
      sleep: async () => {},
      baseMs: 1,
      isRetriable: (err) => err instanceof Error && err.message.includes('weird'),
    });
    expect(result).toBe('ok');
  });

  it('exponential delays grow correctly (with sleep injection)', async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => { delays.push(ms); });
    const fn = vi.fn(async () => { throw Object.assign(new Error('429'), { status: 429 }); });
    await expect(withRetry(fn, { sleep, baseMs: 100, jitterMs: 0, maxAttempts: 4, maxDelayMs: 10000 }))
      .rejects.toThrow();
    // Three sleeps before three retries; delays should be 100, 200, 400
    expect(delays).toEqual([100, 200, 400]);
  });

  it('caps delay at maxDelayMs', async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => { delays.push(ms); });
    const fn = vi.fn(async () => { throw Object.assign(new Error('429'), { status: 429 }); });
    await expect(withRetry(fn, { sleep, baseMs: 1000, jitterMs: 0, maxAttempts: 5, maxDelayMs: 3000 }))
      .rejects.toThrow();
    // 1000, 2000, then capped at 3000, then capped at 3000
    expect(delays).toEqual([1000, 2000, 3000, 3000]);
  });
});

describe('resilience: defaultIsRetriable', () => {
  it('classifies common errors correctly', () => {
    expect(defaultIsRetriable(Object.assign(new Error(), { status: 429 }))).toBe(true);
    expect(defaultIsRetriable(Object.assign(new Error(), { status: 500 }))).toBe(true);
    expect(defaultIsRetriable(Object.assign(new Error(), { status: 502 }))).toBe(true);
    expect(defaultIsRetriable(Object.assign(new Error(), { status: 599 }))).toBe(true);
    expect(defaultIsRetriable(Object.assign(new Error(), { status: 401 }))).toBe(false);
    expect(defaultIsRetriable(Object.assign(new Error(), { status: 403 }))).toBe(false);
    expect(defaultIsRetriable(Object.assign(new Error(), { status: 404 }))).toBe(false);
    expect(defaultIsRetriable(Object.assign(new Error(), { code: 'ENOTFOUND' }))).toBe(true);
    expect(defaultIsRetriable(Object.assign(new Error(), { code: 'ECONNRESET' }))).toBe(true);
    expect(defaultIsRetriable(Object.assign(new Error(), { code: 'ETIMEDOUT' }))).toBe(true);
    expect(defaultIsRetriable(Object.assign(new Error(), { code: 'ESOMETHINGELSE' }))).toBe(false);
    expect(defaultIsRetriable(null)).toBe(false);
    expect(defaultIsRetriable('string error')).toBe(false);
  });

  it('reads status from response.status (googleapis shape)', () => {
    expect(defaultIsRetriable({ response: { status: 429 } })).toBe(true);
    expect(defaultIsRetriable({ response: { status: 502 } })).toBe(true);
    expect(defaultIsRetriable({ response: { status: 401 } })).toBe(false);
  });
});

// ── withTimeout ───────────────────────────────────────────────────────────────

describe('resilience: withTimeout', () => {
  it('returns the result if fn resolves within the deadline', async () => {
    const result = await withTimeout(() => Promise.resolve('fast'), 100);
    expect(result).toBe('fast');
  });

  it('throws TimeoutError if fn exceeds the deadline', async () => {
    const slow = () => new Promise(r => setTimeout(() => r('eventually'), 200));
    await expect(withTimeout(slow, 30)).rejects.toThrow(TimeoutError);
  });

  it('TimeoutError carries the timeout value', async () => {
    const slow = () => new Promise(r => setTimeout(r, 200));
    try {
      await withTimeout(slow, 25);
      throw new Error('should have timed out');
    } catch (err) {
      expect(err).toBeInstanceOf(TimeoutError);
      expect((err as TimeoutError).ms).toBe(25);
    }
  });

  it('disables timeout when ms <= 0', async () => {
    const result = await withTimeout(() => Promise.resolve('immediate'), 0);
    expect(result).toBe('immediate');
  });

  it('clears the timer on success so the test process can exit', async () => {
    // Smoke: if this leaks a timer we'll see it in test output as "process did not exit"
    for (let i = 0; i < 50; i++) await withTimeout(() => Promise.resolve(i), 1000);
  });
});

// ── withResilience: composition ───────────────────────────────────────────────

describe('resilience: withResilience composition', () => {
  it('applies timeout per attempt and retries on TimeoutError', async () => {
    let attempt = 0;
    const fn = async () => {
      attempt++;
      if (attempt < 3) {
        return new Promise<string>(r => setTimeout(() => r('late'), 200));
      }
      return 'fast';
    };
    const result = await withResilience(fn, {
      timeoutMs: 30,
      sleep: async () => {},
      baseMs: 1,
      maxAttempts: 5,
    });
    expect(result).toBe('fast');
    expect(attempt).toBe(3);
  });

  it('does not retry permanent errors even with timeout in place', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('insufficient permissions'), { status: 403 });
    });
    await expect(
      withResilience(fn, { sleep: async () => {}, baseMs: 1 }),
    ).rejects.toThrow('insufficient permissions');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ── TokenBucket / pacing ──────────────────────────────────────────────────────

describe('resilience: TokenBucket', () => {
  it('allows immediate consumption up to capacity', async () => {
    const b = new TokenBucket({ refillPerSec: 100, capacity: 50 });
    // Capacity is 50; consume the whole bucket in one call.
    await b.acquire(50);
    expect(b.available).toBeLessThan(1); // basically empty
  });

  it('blocks until tokens refill', async () => {
    // Simulated clock + sleep so the test is deterministic and fast.
    let now = 0;
    const sleeps: number[] = [];
    const b = new TokenBucket({
      refillPerSec: 100,
      capacity: 10,
      now: () => now,
      sleep: async (ms) => { sleeps.push(ms); now += ms; },
    });
    // Drain the bucket.
    await b.acquire(10);
    // Next 5-token call must wait for ~50ms of refill (5 / 100 tokens/sec).
    await b.acquire(5);
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(50);
    expect(sleeps[0]).toBeLessThan(60);
  });

  it('rejects with RateLimitedError if wait would exceed maxWaitMs', async () => {
    let now = 0;
    const b = new TokenBucket({
      refillPerSec: 1, // glacial refill
      capacity: 1,
      maxWaitMs: 1000,
      now: () => now,
      sleep: async (ms) => { now += ms; },
    });
    await b.acquire(1); // drain
    // Asking for 5 more at 1 token/sec = 5000ms wait > 1000ms cap.
    await expect(b.acquire(5)).rejects.toThrow(RateLimitedError);
  });

  it('serialises concurrent acquires (no starvation)', async () => {
    let now = 0;
    const order: number[] = [];
    const b = new TokenBucket({
      refillPerSec: 100,
      capacity: 10,
      now: () => now,
      sleep: async (ms) => { now += ms; },
    });
    // Three callers, total cost 30, bucket starts at 10 — each must wait its turn.
    const p1 = b.acquire(10).then(() => order.push(1));
    const p2 = b.acquire(10).then(() => order.push(2));
    const p3 = b.acquire(10).then(() => order.push(3));
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('100 cost-5 acquires take >= simulated 2s under default rate', async () => {
    // 100 × 5 = 500 tokens; refill rate 250/s would take 2s (after the
    // initial 250-token capacity is exhausted). With our default 200/s rate
    // and 200-capacity, the math is: first 200 tokens free, remaining 300 at
    // 200/s = 1.5s. Total ~1.5s simulated.
    let now = 0;
    const b = new TokenBucket({
      refillPerSec: QUOTA_UNITS_PER_SEC, // 200
      capacity: BUCKET_CAPACITY,         // 200
      now: () => now,
      sleep: async (ms) => { now += ms; },
    });
    const start = now;
    for (let i = 0; i < 100; i++) {
      await b.acquire(5);
    }
    const elapsedSec = (now - start) / 1000;
    // Lower bound: (500 - 200) / 200 = 1.5s. Upper bound: a generous 2.5s.
    expect(elapsedSec).toBeGreaterThanOrEqual(1.5);
    expect(elapsedSec).toBeLessThan(2.5);
  });
});

describe('resilience: withPacing + withResilience pacing wiring', () => {
  beforeEach(() => {
    // Each test installs its own bucket so pacing is observable + fast.
    resetGmailRateLimiter();
  });
  afterEach(() => {
    resetGmailRateLimiter();
  });

  it('withPacing blocks via the module-level bucket', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const bucket = new TokenBucket({
      refillPerSec: 100,
      capacity: 5,
      now: () => now,
      sleep: async (ms) => { sleeps.push(ms); now += ms; },
    });
    setGmailRateLimiter(bucket);

    await withPacing(5, async () => 'a'); // drains bucket, no wait
    await withPacing(5, async () => 'b'); // must wait ~50ms

    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThan(0);
  });

  it('withResilience honors cost option (acquires tokens before the call)', async () => {
    let now = 0;
    let waited = false;
    const bucket = new TokenBucket({
      refillPerSec: 100,
      capacity: 5,
      now: () => now,
      sleep: async (ms) => { waited = true; now += ms; },
    });
    setGmailRateLimiter(bucket);

    await withResilience(async () => 'ok', { cost: 5, timeoutMs: 1000 });
    await withResilience(async () => 'ok2', { cost: 5, timeoutMs: 1000 });

    expect(waited).toBe(true); // second call had to wait for refill
  });

  it('withResilience cost=0 disables pacing entirely', async () => {
    let waited = false;
    const bucket = new TokenBucket({
      refillPerSec: 1,
      capacity: 0,
      now: () => 0,
      sleep: async () => { waited = true; },
    });
    setGmailRateLimiter(bucket);
    // Even with an empty bucket, cost=0 should not block.
    await withResilience(async () => 'fast', { cost: 0, timeoutMs: 1000 });
    expect(waited).toBe(false);
  });
});

// ── ReauthRequiredError ───────────────────────────────────────────────────────

describe('resilience: ReauthRequiredError shape', () => {
  it('includes user_id and a clear remediation message', () => {
    const err = new ReauthRequiredError('user@example.com', 'invalid_grant: Token has been expired or revoked.');
    expect(err.name).toBe('ReauthRequiredError');
    expect(err.user_id).toBe('user@example.com');
    expect(err.message).toMatch(/Mafia needs to re-authorize/);
    expect(err.message).toMatch(/npm run auth/);
    expect(err.message).toMatch(/invalid_grant/);
  });

  it('is a real Error subclass (instanceof works)', () => {
    const err = new ReauthRequiredError('u1', 'cause');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ReauthRequiredError);
  });
});
