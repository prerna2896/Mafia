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

// ── Composition: retry + timeout per attempt ──────────────────────────────────

export interface ResilientOptions extends RetryOptions {
  /** Per-attempt timeout in ms. Default 15000. Set to 0 to disable. */
  timeoutMs?: number;
}

export const DEFAULT_RESILIENT: Required<Pick<ResilientOptions, 'timeoutMs'>> = {
  timeoutMs: 15_000,
};

/**
 * Wrap a function so each attempt is timeout-bounded AND the whole chain
 * retries on transient failures. Tests can override every knob.
 */
export function withResilience<T>(
  fn: () => Promise<T>,
  opts: ResilientOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_RESILIENT.timeoutMs;
  const isRetriable = opts.isRetriable ?? ((err) => err instanceof TimeoutError || defaultIsRetriable(err));
  return withRetry(() => withTimeout(fn, timeoutMs), { ...opts, isRetriable });
}
