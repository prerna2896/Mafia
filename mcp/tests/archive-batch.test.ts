// Coverage for the batched archive path (Gap B-1).
//
// Verifies the perf win — N archives → 1 Gmail call — without sacrificing
// the per-row audit trail (reflog + state machine remain unchanged).

import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, MockGmailAdapter } from './helpers.js';
import { flagAction, commitArchiveBatch, loadAction } from '../src/quarantine/outbox.js';
import { verifyChain, readActionLog, readAll } from '../src/quarantine/reflog.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function setupN(n: number) {
  const { db, close } = makeTestDb();
  cleanup = close;
  const labels: Record<string, string[]> = {};
  for (let i = 0; i < n; i++) labels[`msg${i}`] = ['INBOX'];
  const gmail = new MockGmailAdapter({ labels });
  const actionIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = flagAction(db, {
      user_id: 'u1',
      session_id: 's1',
      email_id: `msg${i}`,
      intent: 'archive',
    });
    actionIds.push(a.id);
  }
  return { db, gmail, actionIds };
}

describe('commitArchiveBatch', () => {
  it('archives 50 emails using exactly 1 archiveBatch call', async () => {
    const { db, gmail, actionIds } = setupN(50);

    const out = await commitArchiveBatch(db, gmail, actionIds);

    expect(out.quarantined.length).toBe(50);
    expect(out.failed.length).toBe(0);

    // PERF GUARANTEE: 1 batch call vs 50 individual archive calls.
    const batchCalls = gmail.calls.filter((c) => c.method === 'archiveBatch');
    const singleArchiveCalls = gmail.calls.filter((c) => c.method === 'archive');
    expect(batchCalls).toHaveLength(1);
    expect(singleArchiveCalls).toHaveLength(0);

    // All 50 rows landed in 'quarantined'.
    for (const id of actionIds) {
      expect(loadAction(db, id)?.state).toBe('quarantined');
    }
  });

  it('emits per-row reflog entries despite a single API call (audit integrity)', async () => {
    const { db, actionIds, gmail } = setupN(50);

    await commitArchiveBatch(db, gmail, actionIds);

    // Each action: flag + quarantine + quarantine_complete = 3 entries.
    let totalQuarantine = 0;
    let totalComplete = 0;
    for (const id of actionIds) {
      const log = readActionLog(db, id);
      expect(log.map((e) => e.transition)).toEqual(['flag', 'quarantine', 'quarantine_complete']);
      totalQuarantine += log.filter((e) => e.transition === 'quarantine').length;
      totalComplete += log.filter((e) => e.transition === 'quarantine_complete').length;
    }
    expect(totalQuarantine).toBe(50);
    expect(totalComplete).toBe(50);

    // Chain still verifies — hash links unbroken under batch path.
    expect(verifyChain(db).ok).toBe(true);
  });

  it('updates Gmail labels in the mock (INBOX removed)', async () => {
    const { db, gmail, actionIds } = setupN(10);
    await commitArchiveBatch(db, gmail, actionIds);
    for (let i = 0; i < 10; i++) {
      expect(gmail.labels.get(`msg${i}`)?.has('INBOX')).toBe(false);
    }
  });

  it('on whole-batch failure, marks every row as failed with the error', async () => {
    const { db, gmail, actionIds } = setupN(5);
    gmail.failOnce.add('archiveBatch');

    const out = await commitArchiveBatch(db, gmail, actionIds);

    expect(out.quarantined.length).toBe(0);
    expect(out.failed.length).toBe(5);
    for (const row of out.failed) {
      expect(row.state).toBe('failed');
      expect(row.upstream_status).toMatch(/once-fail/);
    }
    // Per-row reflog: flag → quarantine → fail.
    for (const id of actionIds) {
      const log = readActionLog(db, id);
      expect(log.map((e) => e.transition)).toEqual(['flag', 'quarantine', 'fail']);
    }
    expect(verifyChain(db).ok).toBe(true);
  });

  it('rejects non-archive intent', async () => {
    const { db } = makeTestDb();
    cleanup = () => db.close();
    const gmail = new MockGmailAdapter({ msg1: ['INBOX'] });
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    await expect(commitArchiveBatch(db, gmail, [a.id])).rejects.toThrow(/intent='delete'/);
  });

  it('handles empty input gracefully', async () => {
    const { db } = makeTestDb();
    cleanup = () => db.close();
    const gmail = new MockGmailAdapter();
    const out = await commitArchiveBatch(db, gmail, []);
    expect(out.quarantined).toEqual([]);
    expect(out.failed).toEqual([]);
    expect(gmail.calls.length).toBe(0);
  });

  it('reflog count stays in sync: 50 archives → 50 quarantine + 50 quarantine_complete entries', async () => {
    const { db, gmail, actionIds } = setupN(50);
    await commitArchiveBatch(db, gmail, actionIds);

    const all = readAll(db);
    const transitions = all.map((e) => e.transition);
    // Per-row counts excluding genesis.
    expect(transitions.filter((t) => t === 'flag').length).toBe(50);
    expect(transitions.filter((t) => t === 'quarantine').length).toBe(50);
    expect(transitions.filter((t) => t === 'quarantine_complete').length).toBe(50);
    expect(verifyChain(db).ok).toBe(true);
  });
});
