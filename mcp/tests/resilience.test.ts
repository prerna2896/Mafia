// Coverage for the deferred V0 hardening items:
//  - retry/backoff for transient Gmail failures (429, 5xx, network)
//  - per-attempt timeout
//  - clean error UX when the refresh token is revoked
//
// These guard against future regressions even though the original symptoms
// were "deferred" until they actually bit a user.

import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  withTimeout,
  withResilience,
  defaultIsRetriable,
  TimeoutError,
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
