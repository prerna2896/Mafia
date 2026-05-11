// Coverage for the privacy-gap fix in summarization: MAFIA_SUMMARY_BACKEND
// gates which path runs (cloud / local / off). The local and off paths must
// never invoke the Anthropic SDK — that's the whole point of the env var.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { EmailMetadata } from '../src/gmail/client.js';

// We re-import the module after mutating process.env between tests so that
// `getBackend()` re-reads it. The summarize module reads env per-call, so a
// fresh import isn't strictly required, but we spy on `getClient` to assert no
// cloud call ever happens.
import * as summarize from '../src/lib/summarize.js';

function makeEmail(overrides: Partial<EmailMetadata> = {}): EmailMetadata {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    from: 'Test Sender',
    fromEmail: 'test@example.com',
    subject: '(no subject)',
    date: 'Mon, 11 May 2026 10:00:00 +0000',
    snippet: '',
    labels: ['INBOX'],
    sizeEstimate: 1024,
    ...overrides,
  };
}

const originalBackend = process.env.MAFIA_SUMMARY_BACKEND;
let clientSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  // Belt-and-suspenders: spy on the module-level client factory so any test
  // that *would* hit the cloud path will throw loudly instead of trying to
  // talk to Anthropic.
  clientSpy = vi.spyOn(summarize, 'getClient').mockImplementation(() => {
    throw new Error('cloud client must not be invoked in local/off path');
  });
});

afterEach(() => {
  clientSpy?.mockRestore();
  clientSpy = null;
  if (originalBackend === undefined) delete process.env.MAFIA_SUMMARY_BACKEND;
  else process.env.MAFIA_SUMMARY_BACKEND = originalBackend;
});

// ── Local rule matrix ────────────────────────────────────────────────────────

describe('summarizeEmail — local rule matrix', () => {
  beforeEach(() => {
    process.env.MAFIA_SUMMARY_BACKEND = 'local';
  });

  it('delete: no-reply sender matches automated-sender pattern', async () => {
    const email = makeEmail({
      fromEmail: 'no-reply@bigcorp.com',
      subject: 'Account security notice',
      snippet: 'Your password was changed.',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.recommendedAction).toBe('delete');
    expect(out.backend).toBe('local');
    expect(out.reasoning).toContain('automated-sender');
    expect(out.reasoning).toContain('rule-based, no AI');
  });

  it('delete: subject contains "unsubscribe"', async () => {
    const email = makeEmail({
      fromEmail: 'marketing@retailer.io',
      subject: 'Big news from us — unsubscribe anytime',
      snippet: 'Check out our new collection.',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.recommendedAction).toBe('delete');
    expect(out.backend).toBe('local');
    expect(out.reasoning).toContain('unsubscribe');
  });

  it('archive: sender domain in transactional allowlist (amazon.com)', async () => {
    const email = makeEmail({
      fromEmail: 'orders@amazon.com',
      subject: 'Shipped',
      snippet: 'Your package is on the way.',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.recommendedAction).toBe('archive');
    expect(out.backend).toBe('local');
    expect(out.reasoning).toContain('amazon.com');
    expect(out.reasoning).toContain('transactional allowlist');
  });

  it('archive: subject contains "receipt"', async () => {
    const email = makeEmail({
      fromEmail: 'billing@indie-saas.example',
      subject: 'Your receipt for May',
      snippet: 'Thanks for your payment.',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.recommendedAction).toBe('archive');
    expect(out.backend).toBe('local');
    expect(out.reasoning).toContain('receipt');
  });

  it('keep: no marketing or transactional patterns match', async () => {
    const email = makeEmail({
      fromEmail: 'alice@example.com',
      subject: 'lunch tomorrow?',
      snippet: 'Hey, are you free at noon?',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.recommendedAction).toBe('keep');
    expect(out.backend).toBe('local');
    expect(out.reasoning).toContain('No marketing or transactional patterns matched');
  });

  it('delete rule wins over archive rule when both would match', async () => {
    // automated sender (delete) on a transactional domain (archive) — the
    // sender pattern should fire first since delete is more decisive.
    const email = makeEmail({
      fromEmail: 'no-reply@amazon.com',
      subject: 'Your order has shipped',
      snippet: 'Tracking info enclosed.',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.recommendedAction).toBe('delete');
    expect(out.backend).toBe('local');
  });

  it('case-insensitive sender pattern match (Notifications@…)', async () => {
    const email = makeEmail({
      fromEmail: 'Notifications@example.com',
      subject: 'You have a new alert',
      snippet: 'Open the app for details.',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.recommendedAction).toBe('delete');
  });

  it('local path never invokes the Anthropic client', async () => {
    const email = makeEmail({
      fromEmail: 'alice@example.com',
      subject: 'lunch?',
      snippet: 'Free at noon?',
    });
    await summarize.summarizeEmail(email);
    expect(clientSpy).not.toHaveBeenCalled();
  });

  it('oneLiner is extracted from snippet, trimmed, with ellipsis when long', async () => {
    const email = makeEmail({
      fromEmail: 'alice@example.com',
      subject: 'note',
      snippet:
        'This is a fairly long opening sentence that has more than fifteen distinct words in it so it should be trimmed.',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.oneLiner.endsWith('…')).toBe(true);
    expect(out.oneLiner.split(/\s+/).length).toBeLessThanOrEqual(16); // 15 words + ellipsis token
  });
});

// ── Off backend ──────────────────────────────────────────────────────────────

describe('summarizeEmail — off backend', () => {
  beforeEach(() => {
    process.env.MAFIA_SUMMARY_BACKEND = 'off';
  });

  it('returns keep with disabled-gate reasoning', async () => {
    const email = makeEmail({
      fromEmail: 'no-reply@spam.example',
      subject: 'BUY NOW 90% off',
      snippet: 'Best deals ever!',
    });
    const out = await summarize.summarizeEmail(email);
    expect(out.recommendedAction).toBe('keep');
    expect(out.backend).toBe('off');
    expect(out.reasoning).toContain('MAFIA_SUMMARY_BACKEND=off');
    expect(out.reasoning).toContain('summarization disabled');
  });

  it('off path never invokes the Anthropic client', async () => {
    const email = makeEmail();
    await summarize.summarizeEmail(email);
    expect(clientSpy).not.toHaveBeenCalled();
  });
});

// ── Backend wiring / default ─────────────────────────────────────────────────

describe('summarizeEmail — backend wiring', () => {
  it('response.backend reflects the env-selected backend (local)', async () => {
    process.env.MAFIA_SUMMARY_BACKEND = 'local';
    const out = await summarize.summarizeEmail(makeEmail());
    expect(out.backend).toBe('local');
  });

  it('response.backend reflects the env-selected backend (off)', async () => {
    process.env.MAFIA_SUMMARY_BACKEND = 'off';
    const out = await summarize.summarizeEmail(makeEmail());
    expect(out.backend).toBe('off');
  });

  it('getBackend() defaults to cloud when env var is unset', () => {
    delete process.env.MAFIA_SUMMARY_BACKEND;
    expect(summarize.getBackend()).toBe('cloud');
  });

  it('getBackend() falls back to cloud on unknown values', () => {
    process.env.MAFIA_SUMMARY_BACKEND = 'bogus';
    expect(summarize.getBackend()).toBe('cloud');
  });

  it('getBackend() is case-insensitive', () => {
    process.env.MAFIA_SUMMARY_BACKEND = 'LOCAL';
    expect(summarize.getBackend()).toBe('local');
    process.env.MAFIA_SUMMARY_BACKEND = 'Off';
    expect(summarize.getBackend()).toBe('off');
  });
});
