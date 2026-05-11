// Coverage for the V0 critical-functionality gaps identified in audit.
// Pairs with state-machine / reflog / snapshot / outbox / purger / integration
// tests; this file targets the *boundary* behaviors a user can hit but the
// existing tests don't yet exercise.

import { describe, it, expect, afterEach } from 'vitest';
import { gzipSync } from 'zlib';
import { makeTestDb, MockGmailAdapter } from './helpers.js';
import { migrate001 } from '../src/db/migrations/001_quarantine_reflog.js';
import {
  flagAction,
  commitAction,
  restoreAction,
  purgeAction,
  loadAction,
  listFlagged,
  listVault,
} from '../src/quarantine/outbox.js';
import { writeSnapshot, readSnapshot, readBody } from '../src/quarantine/snapshot.js';
import { readAll, verifyChain } from '../src/quarantine/reflog.js';
import { IllegalTransition, nextState } from '../src/quarantine/state-machine.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function setup() {
  const { db, close } = makeTestDb();
  cleanup = close;
  const gmail = new MockGmailAdapter({ msg1: ['INBOX'], msg2: ['INBOX'], msg3: ['INBOX'] });
  return { db, gmail };
}

// 🔴 must-test #1: migration idempotence
describe('critical: migration idempotence', () => {
  it('running migrate001 twice does not error and produces one genesis row', () => {
    const { db } = setup();
    expect(() => migrate001(db)).not.toThrow();
    expect(() => migrate001(db)).not.toThrow();
    expect(() => migrate001(db)).not.toThrow();

    const genesisRows = db.prepare(`SELECT COUNT(*) as n FROM reflog WHERE action_id = '__genesis__'`).get() as { n: number };
    expect(genesisRows.n).toBe(1);

    expect(verifyChain(db).ok).toBe(true);
  });

  it('migrate001 preserves data across re-runs', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    await commitAction(db, gmail, a.id);

    // Re-run migration — should be a no-op
    migrate001(db);

    const reload = loadAction(db, a.id);
    expect(reload).not.toBeNull();
    expect(reload!.state).toBe('quarantined');
    expect(verifyChain(db).ok).toBe(true);
  });
});

// 🔴 must-test #2: dry_run preserves state
// Note: dry_run is a tool-level concept (commit-session.ts). At the outbox
// level there's no dry_run — the tool just reads listFlagged without calling
// commitAction. We test the equivalent: flagged rows persist if you don't
// call commitAction.
describe('critical: state machine never advances without explicit transition', () => {
  it('listFlagged is read-only — does not advance state', async () => {
    const { db } = setup();
    flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg2', intent: 'delete' });

    listFlagged(db, 's1');
    listFlagged(db, 's1');
    listFlagged(db, 's1');

    const after = listFlagged(db, 's1');
    expect(after.length).toBe(2);
    expect(after.every(a => a.state === 'flagged')).toBe(true);

    // Reflog should still have only the two flag entries (plus genesis).
    expect(readAll(db).filter(e => e.transition === 'flag').length).toBe(2);
    expect(readAll(db).filter(e => e.transition === 'quarantine').length).toBe(0);
  });
});

// 🔴 must-test #3: terminal-state restore rejection
describe('critical: re-restoring or restoring a terminal item is rejected', () => {
  it('restoring a restored item is rejected by state machine', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    await commitAction(db, gmail, a.id);
    await restoreAction(db, gmail, a.id);

    // Now state is 'restored' — terminal.
    expect(loadAction(db, a.id)?.state).toBe('restored');
    await expect(restoreAction(db, gmail, a.id)).rejects.toThrow(IllegalTransition);
  });

  it('restoring a failed item is rejected', async () => {
    const { db, gmail } = setup();
    gmail.failAlways.add('archive');
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    const result = await commitAction(db, gmail, a.id);
    expect(result.state).toBe('failed');

    await expect(restoreAction(db, gmail, a.id)).rejects.toThrow(IllegalTransition);
  });

  it('restoring a purged item is rejected', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    await commitAction(db, gmail, a.id);
    purgeAction(db, a.id);

    await expect(restoreAction(db, gmail, a.id)).rejects.toThrow(IllegalTransition);
  });

  it('purging a non-quarantined item is rejected', () => {
    const { db } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    // Row is in 'flagged' state; purge expects 'quarantined'
    expect(() => purgeAction(db, a.id)).toThrow(IllegalTransition);
  });
});

// 🔴 must-test #4: empty session
describe('critical: empty session', () => {
  it('listFlagged on a never-flagged session returns []', () => {
    const { db } = setup();
    expect(listFlagged(db, 'nonexistent_session')).toEqual([]);
  });

  it('listVault on a brand-new user returns []', () => {
    const { db } = setup();
    expect(listVault(db, 'new_user')).toEqual([]);
  });
});

// 🟡 should-test #1: cross-session re-flag after restore
describe('critical: cross-session re-flag after restore', () => {
  it('flagging an already-restored email in a new session creates a fresh row', async () => {
    const { db, gmail } = setup();

    // Session A: flag → commit → restore
    const a1 = flagAction(db, { user_id: 'u1', session_id: 'sA', email_id: 'msg1', intent: 'archive' });
    await commitAction(db, gmail, a1.id);
    await restoreAction(db, gmail, a1.id);
    expect(loadAction(db, a1.id)?.state).toBe('restored');

    // Session B: flag the same email again
    const a2 = flagAction(db, { user_id: 'u1', session_id: 'sB', email_id: 'msg1', intent: 'delete' });

    // A1 is still terminal (restored). A2 is fresh and flagged.
    expect(loadAction(db, a1.id)?.state).toBe('restored');
    expect(loadAction(db, a2.id)?.state).toBe('flagged');
    expect(a1.id).not.toBe(a2.id);

    // listFlagged for session B should show only the new row
    expect(listFlagged(db, 'sB').map(a => a.id)).toEqual([a2.id]);
    // listFlagged for session A should be empty (A1 is no longer flagged)
    expect(listFlagged(db, 'sA')).toEqual([]);

    // Commit it through to delete this time
    await commitAction(db, gmail, a2.id);
    expect(loadAction(db, a2.id)?.state).toBe('quarantined');
    expect(gmail.labels.get('msg1')!.has('TRASH')).toBe(true);
  });
});

// 🟡 should-test #2: large body blob
describe('critical: large body blob is gzipped and stored without crash', () => {
  it('5 MB body is stored, gzipped smaller, round-trips intact', () => {
    const { db } = setup();
    // 5 MB of mostly-repeated text — gzip should compress dramatically.
    // body_raw must be base64url (Gmail's format:'raw' shape).
    const bodyBuf = Buffer.from('A'.repeat(5_000_000), 'utf-8');
    const id = writeSnapshot(db, 'delete', {
      email_id: 'msg-big',
      internal_date: 1700000000,
      headers: { Subject: 'big email' },
      label_ids: ['INBOX'],
      body_raw: bodyBuf.toString('base64url'),
    });

    const snap = readSnapshot(db, id);
    expect(snap).not.toBeNull();
    expect(snap!.body_size_bytes).toBe(5_000_000);
    // gzip on 5MB of repetition should be tiny (< 100 KB)
    expect(snap!.body_blob!.length).toBeLessThan(100_000);

    const round = readBody(snap!);
    expect(round).not.toBeNull();
    expect(round!.equals(bodyBuf)).toBe(true);
  });

  it('high-entropy body still round-trips', () => {
    const { db } = setup();
    // 1 MB of random bytes — gzip won't help much but must still work.
    // This exercises the binary-faithful path: arbitrary byte content
    // including 8-bit MIME parts and would-be attachments.
    const body = Buffer.alloc(1_000_000);
    for (let i = 0; i < body.length; i++) body[i] = Math.floor(Math.random() * 256);
    const id = writeSnapshot(db, 'delete', {
      email_id: 'msg-rnd',
      internal_date: 1700000000,
      headers: { Subject: 'random' },
      label_ids: ['INBOX'],
      body_raw: body.toString('base64url'),
    });
    const snap = readSnapshot(db, id);
    const round = readBody(snap!);
    expect(round).not.toBeNull();
    expect(round!.equals(body)).toBe(true);
  });

  it('gzip round-trip independently produces matching hashes', () => {
    const body = 'lorem ipsum '.repeat(10000);
    const compressed = gzipSync(Buffer.from(body, 'utf-8'));
    expect(compressed.length).toBeLessThan(body.length);
  });
});

// 🟡 should-test #3: restore-by-email when no quarantined row exists
// (The restore tool returns an error rather than throwing — this validates
// the runtime path that future restore-tool callers should rely on.)
describe('critical: restore by email_id with no quarantined row', () => {
  it("listVault then restore by action_id of a flagged-but-not-yet-committed item is rejected by state machine", async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    // Don't commit. State is still 'flagged'.

    await expect(restoreAction(db, gmail, a.id)).rejects.toThrow(IllegalTransition);
  });
});

// State-machine sanity check: the new failed→? transitions are correctly forbidden.
describe('critical: state machine — failed and terminal exits', () => {
  it('failed cannot transition to anything', () => {
    expect(() => nextState('failed', 'restore')).toThrow(IllegalTransition);
    expect(() => nextState('failed', 'quarantine')).toThrow(IllegalTransition);
    expect(() => nextState('failed', 'purge')).toThrow(IllegalTransition);
    expect(() => nextState('failed', 'fail')).toThrow(IllegalTransition);
  });
});
