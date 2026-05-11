// Shared mock GmailAdapter for tests + evals.
// Tracks every call; lets you script failures with failOnce / failAlways.
//
// Used by:
//   - tests/* (unit + integration tests)
//   - evals/runner.ts (scenario runner)

import type { GmailAdapter, GmailMessageDetail } from '../gmail/adapter.js';

export interface MockGmailInit {
  /** Initial label state per email_id (e.g. { msg1: ['INBOX'] }). */
  labels?: Record<string, string[]>;
  /** Override fetchDetail responses per email_id. */
  details?: Record<string, GmailMessageDetail>;
}

/**
 * Accepts either the full MockGmailInit object, or a shorthand
 * `Record<string, string[]>` that's interpreted as the labels map.
 */
export type MockGmailCtorArg = MockGmailInit | Record<string, string[]>;

function isInit(v: MockGmailCtorArg): v is MockGmailInit {
  if (!v || typeof v !== 'object') return false;
  // If any value is an array, it's the shorthand label map.
  for (const val of Object.values(v)) if (Array.isArray(val)) return false;
  return true;
}

export class MockGmailAdapter implements GmailAdapter {
  public calls: { method: string; email_id: string; ts: number }[] = [];
  public labels = new Map<string, Set<string>>();
  public details = new Map<string, GmailMessageDetail>();
  public failOnce = new Set<string>();
  public failAlways = new Set<string>();

  constructor(init: MockGmailCtorArg = {}) {
    const config: MockGmailInit = isInit(init)
      ? init
      : { labels: init as Record<string, string[]> };

    if (config.labels) {
      for (const [id, labels] of Object.entries(config.labels)) {
        this.labels.set(id, new Set(labels));
      }
    }
    if (config.details) {
      for (const [id, d] of Object.entries(config.details)) this.details.set(id, d);
    }
  }

  private maybeThrow(method: string, email_id: string) {
    this.calls.push({ method, email_id, ts: Date.now() });
    if (this.failAlways.has(method)) throw new Error(`mock ${method} always-fails`);
    if (this.failOnce.has(method)) {
      this.failOnce.delete(method);
      throw new Error(`mock ${method} once-fail`);
    }
  }

  async trash(email_id: string): Promise<void> {
    this.maybeThrow('trash', email_id);
    const set = this.labels.get(email_id) ?? new Set();
    set.delete('INBOX');
    set.add('TRASH');
    this.labels.set(email_id, set);
  }

  async untrash(email_id: string): Promise<void> {
    this.maybeThrow('untrash', email_id);
    const set = this.labels.get(email_id) ?? new Set();
    set.delete('TRASH');
    set.add('INBOX');
    this.labels.set(email_id, set);
  }

  async archive(email_id: string): Promise<void> {
    this.maybeThrow('archive', email_id);
    const set = this.labels.get(email_id) ?? new Set();
    set.delete('INBOX');
    this.labels.set(email_id, set);
  }

  async unarchive(email_id: string): Promise<void> {
    this.maybeThrow('unarchive', email_id);
    const set = this.labels.get(email_id) ?? new Set();
    set.add('INBOX');
    this.labels.set(email_id, set);
  }

  async fetchDetail(email_id: string, includeBody: boolean): Promise<GmailMessageDetail> {
    this.maybeThrow('fetchDetail', email_id);
    const override = this.details.get(email_id);
    if (override) {
      return includeBody ? override : { ...override, raw_body: undefined };
    }
    return {
      email_id,
      thread_id: `thr_${email_id}`,
      internal_date: 1700000000,
      label_ids: [...(this.labels.get(email_id) ?? new Set())],
      headers: { From: 'noreply@example.com', Subject: `subject ${email_id}` },
      raw_body: includeBody ? `From: noreply@example.com\nSubject: subject ${email_id}\n\nbody of ${email_id}` : undefined,
    };
  }

  async fetchLabels(email_id: string): Promise<string[]> {
    this.maybeThrow('fetchLabels', email_id);
    return [...(this.labels.get(email_id) ?? new Set())];
  }
}
