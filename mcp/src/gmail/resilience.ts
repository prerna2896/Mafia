// Resilience helpers for upstream calls.
//
// withRetry — retries transient failures (429, 5xx, network) with exponential
//             backoff + jitter. Permanent failures (401, 403, 404) bubble up
//             immediately so the outbox can mark the action as failed.
//
// withTimeout — caps each attempt so a hung Gmail call can't stall the MCP
//               server forever.
//
// Both are pure utilities — no Gmail-specific knowledge except the default
// `isRetriable` heuristic that recognises Google's 429 + 5xx error shapes.

export interface RetryOptions {
  /** Total attempts including the first. Default 4. */
  maxAttempts?: number;
  /** Base delay before first retry; doubles each attempt. Default 250ms. */
  baseMs?: number;
  /** Cap on individual delay. Default 8000ms. */
  maxDelayMs?: number;
  /** Random jitter [0..jitterMs] added to each delay. Default 100ms. */
  jitterMs?: number;
  /** Decide whether to retry. Default: 429 + 5xx + network errors. */
  isRetriable?: (err: unknown, attempt: number) => boolean;
  /** Sleep injection for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRY: Required<Omit<RetryOptions, 'isRetriable' | 'sleep'>> = {
  maxAttempts: 4,
  baseMs: 250,
  maxDelayMs: 8000,
  jitterMs: 100,
};

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Treat a googleapis-shaped error as retriable when its status is 429 or
 * 500–599. Network errors (no status, but `code === 'ENOTFOUND' / 'ECONNRESET'
 * / 'ETIMEDOUT'`) are also retried. Anything else is permanent.
 */
export function defaultIsRetriable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: number | string; status?: number; response?: { status?: number } };
  const status = typeof e.status === 'number' ? e.status : e.response?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  if (typeof e.code === 'string' && (e.code === 'ENOTFOUND' || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'EAI_AGAIN')) return true;
  return false;
}

/**
 * Run `fn` with exponential-backoff retry on transient failures.
 * Throws the last error encountered after all attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY, ...opts };
  const isRetriable = opts.isRetriable ?? defaultIsRetriable;
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === cfg.maxAttempts;
      if (isLast || !isRetriable(err, attempt)) throw err;
      const delay = Math.min(cfg.maxDelayMs, cfg.baseMs * Math.pow(2, attempt - 1)) + Math.random() * cfg.jitterMs;
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ── Timeout ───────────────────────────────────────────────────────────────────

export class TimeoutError extends Error {
  constructor(public readonly ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Race `fn()` against a timeout. If the timer fires first, throws TimeoutError.
 * Note: this does not actually cancel the underlying work — it just unblocks
 * the caller. Combine with AbortSignal at the request layer if cancellation
 * matters.
 */
export async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return fn();
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── Token-bucket pacing ───────────────────────────────────────────────────────
//
// Gmail's per-user quota is ~250 quota-units per second. Stay well below that
// so concurrent traffic (e.g. parallel batches, retries, the reconciler) never
// pushes us into 429-throttling. The bucket refills continuously at
// QUOTA_UNITS_PER_SEC and caps at BUCKET_CAPACITY tokens.

/** Default refill rate in tokens (quota-units) per second. */
export const QUOTA_UNITS_PER_SEC = 200;
/** Default bucket capacity in tokens. */
export const BUCKET_CAPACITY = 200;
/** Hard cap on how long a single acquire() may block before rejecting. */
const MAX_ACQUIRE_WAIT_MS = 10_000;

export class RateLimitedError extends Error {
  constructor(public readonly costRequested: number, public readonly waitMs: number) {
    super(`Rate limiter could not satisfy cost=${costRequested} within ${waitMs}ms; would exceed Gmail per-user quota.`);
    this.name = 'RateLimitedError';
  }
}

export interface TokenBucketOptions {
  /** Tokens added per second. Defaults to QUOTA_UNITS_PER_SEC. */
  refillPerSec?: number;
  /** Maximum tokens the bucket can hold. Defaults to BUCKET_CAPACITY. */
  capacity?: number;
  /** Max time a single acquire() will wait before rejecting. Defaults to 10s. */
  maxWaitMs?: number;
  /** now()-injection for tests. */
  now?: () => number;
  /** sleep()-injection for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Continuous-refill token bucket. Single-process; the cap is wall-clock based
 * (Date.now()) so concurrent callers naturally serialise by waiting their turn.
 *
 * acquire(cost) resolves once `cost` tokens are available. If the wait would
 * exceed `maxWaitMs`, it rejects with RateLimitedError without consuming any
 * tokens — caller can decide to back off or surface the error.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly refillPerSec: number;
  private readonly capacity: number;
  private readonly maxWaitMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Serialise acquire() so a long waiter doesn't get starved by a short one. */
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: TokenBucketOptions = {}) {
    this.refillPerSec = opts.refillPerSec ?? QUOTA_UNITS_PER_SEC;
    this.capacity = opts.capacity ?? BUCKET_CAPACITY;
    this.maxWaitMs = opts.maxWaitMs ?? MAX_ACQUIRE_WAIT_MS;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? defaultSleep;
    this.tokens = this.capacity;
    this.lastRefill = this.now();
  }

  private refill() {
    const t = this.now();
    const dtSec = (t - this.lastRefill) / 1000;
    if (dtSec <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + dtSec * this.refillPerSec);
    this.lastRefill = t;
  }

  /**
   * Acquire `cost` tokens, blocking until available. Rejects with
   * RateLimitedError if the required wait exceeds maxWaitMs.
   *
   * A cost exceeding capacity is allowed (we wait for the bucket to fill all
   * the way and then consume) but still bounded by maxWaitMs.
   */
  async acquire(cost: number): Promise<void> {
    if (cost <= 0) return;
    // Serialise: each acquire waits for the prior one to finish its wait
    // before checking the bucket. Prevents the bucket from being raided by a
    // newly-arriving cheap call while an earlier expensive call is sleeping.
    const prev = this.chain;
    let release: () => void;
    this.chain = new Promise<void>((r) => { release = r; });
    try {
      await prev;
      this.refill();
      if (this.tokens >= cost) {
        this.tokens -= cost;
        return;
      }
      const deficit = cost - this.tokens;
      const waitMs = Math.ceil((deficit / this.refillPerSec) * 1000);
      if (waitMs > this.maxWaitMs) {
        throw new RateLimitedError(cost, waitMs);
      }
      await this.sleep(waitMs);
      this.refill();
      // After waiting we should have enough; floor at 0 in case of jitter.
      this.tokens = Math.max(0, this.tokens - cost);
    } finally {
      release!();
    }
  }

  /** Test/diagnostic accessor. */
  get available(): number {
    this.refill();
    return this.tokens;
  }
}

// Module-level instance used by withResilience / withPacing. Tests can swap
// via setGmailRateLimiter() and reset via resetGmailRateLimiter().
let _bucket = new TokenBucket();

export function getGmailRateLimiter(): TokenBucket {
  return _bucket;
}

export function setGmailRateLimiter(bucket: TokenBucket) {
  _bucket = bucket;
}

export function resetGmailRateLimiter() {
  _bucket = new TokenBucket();
}

/**
 * Acquire pacing tokens for `cost`, then run `fn`. Pure pacing — no retry,
 * no timeout. Compose with withResilience if you want both.
 */
export async function withPacing<T>(cost: number, fn: () => Promise<T>): Promise<T> {
  await _bucket.acquire(cost);
  return fn();
}

// ── Composition: retry + timeout per attempt ──────────────────────────────────

export interface ResilientOptions extends RetryOptions {
  /** Per-attempt timeout in ms. Default 15000. Set to 0 to disable. */
  timeoutMs?: number;
  /** Token-bucket cost per attempt. Default 1. Set to 0 to disable pacing. */
  cost?: number;
}

export const DEFAULT_RESILIENT: Required<Pick<ResilientOptions, 'timeoutMs'>> = {
  timeoutMs: 15_000,
};

/**
 * Wrap a function so each attempt is timeout-bounded AND the whole chain
 * retries on transient failures. Each attempt also acquires `cost` tokens
 * from the pacing bucket before firing. Tests can override every knob.
 */
export function withResilience<T>(
  fn: () => Promise<T>,
  opts: ResilientOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_RESILIENT.timeoutMs;
  const cost = opts.cost ?? 1;
  const isRetriable = opts.isRetriable ?? ((err) => err instanceof TimeoutError || defaultIsRetriable(err));
  return withRetry(async () => {
    if (cost > 0) await _bucket.acquire(cost);
    return withTimeout(fn, timeoutMs);
  }, { ...opts, isRetriable });
}
