import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, MockGmailAdapter } from './helpers.js';
import {
  flagAction,
  commitAction,
  restoreAction,
  purgeAction,
  reconcileInFlight,
  loadAction,
  listFlagged,
  listVault,
} from '../src/quarantine/outbox.js';
import { verifyChain, readActionLog } from '../src/quarantine/reflog.js';
import { readSnapshot } from '../src/quarantine/snapshot.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function setup() {
  const { db, close } = makeTestDb();
  cleanup = close;
  const gmail = new MockGmailAdapter({ msg1: ['INBOX'], msg2: ['INBOX'], msg3: ['INBOX'] });
  return { db, gmail };
}

describe('outbox: flag', () => {
  it('writes a flagged email_actions row + a flag reflog entry', () => {
    const { db } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    expect(a.state).toBe('flagged');
    expect(a.intent).toBe('delete');
    expect(a.user_id).toBe('u1');

    const log = readActionLog(db, a.id);
    expect(log).toHaveLength(1);
    expect(log[0].transition).toBe('flag');
    expect(verifyChain(db).ok).toBe(true);
  });

  it('re-flagging same email in same session supersedes prior', () => {
    const { db } = setup();
    const a1 = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    const a2 = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });

    // a1 row should be gone (superseded), a2 should be the only flagged row
    expect(loadAction(db, a1.id)).toBeNull();
    expect(loadAction(db, a2.id)?.intent).toBe('archive');
    expect(listFlagged(db, 's1').length).toBe(1);

    // Reflog still has both flag entries — supersession does not destroy history
    const allReflogForA1 = readActionLog(db, a1.id);
    expect(allReflogForA1).toHaveLength(1);
    expect(verifyChain(db).ok).toBe(true);
  });
});

describe('outbox: commit', () => {
  it('keep intent: flagged → kept, no Gmail call', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'keep' });
    const result = await commitAction(db, gmail, a.id);
    expect(result.state).toBe('kept');
    expect(gmail.calls.length).toBe(0);
  });

  it('archive intent: flagged → quarantining → quarantined; calls archive once', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    const result = await commitAction(db, gmail, a.id);

    expect(result.state).toBe('quarantined');
    expect(result.snapshot_id).not.toBeNull();
    expect(result.purge_after).not.toBeNull();
    expect(gmail.calls.find(c => c.method === 'archive')).toBeDefined();
    expect(gmail.calls.find(c => c.method === 'trash')).toBeUndefined();

    const snap = readSnapshot(db, result.snapshot_id!);
    expect(snap!.body_blob).toBeNull(); // archive = metadata only

    const log = readActionLog(db, a.id);
    expect(log.map(e => e.transition)).toEqual(['flag', 'quarantine', 'quarantine_complete']);
    expect(verifyChain(db).ok).toBe(true);
  });

  it('delete intent: stores body blob, calls trash', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    const result = await commitAction(db, gmail, a.id);

    expect(result.state).toBe('quarantined');
    const snap = readSnapshot(db, result.snapshot_id!);
    expect(snap!.body_blob).not.toBeNull();
    expect(gmail.calls.find(c => c.method === 'trash')).toBeDefined();
  });

  it('Gmail failure → state=failed + reflog records the error', async () => {
    const { db, gmail } = setup();
    gmail.failOnce.add('archive');
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    const result = await commitAction(db, gmail, a.id);

    expect(result.state).toBe('failed');
    expect(result.upstream_status).toMatch(/once-fail/);

    const log = readActionLog(db, a.id);
    expect(log.map(e => e.transition)).toEqual(['flag', 'quarantine', 'fail']);
    expect(verifyChain(db).ok).toBe(true);
  });
});

describe('outbox: restore', () => {
  it('restores a quarantined archive (re-adds INBOX)', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    await commitAction(db, gmail, a.id);

    const result = await restoreAction(db, gmail, a.id);
    expect(result.state).toBe('restored');
    expect(gmail.labels.get('msg1')!.has('INBOX')).toBe(true);

    const log = readActionLog(db, a.id);
    expect(log.map(e => e.transition)).toEqual(['flag', 'quarantine', 'quarantine_complete', 'restore', 'restore_complete']);
  });

  it('restores a quarantined delete (untrash)', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    await commitAction(db, gmail, a.id);
    expect(gmail.labels.get('msg1')!.has('TRASH')).toBe(true);

    await restoreAction(db, gmail, a.id);
    expect(gmail.labels.get('msg1')!.has('TRASH')).toBe(false);
    expect(gmail.labels.get('msg1')!.has('INBOX')).toBe(true);
  });

  it("restoring a 'keep' action throws", async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'keep' });
    await commitAction(db, gmail, a.id);
    await expect(restoreAction(db, gmail, a.id)).rejects.toThrow();
  });

  it('Gmail failure during restore → state=failed', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    await commitAction(db, gmail, a.id);
    gmail.failOnce.add('unarchive');

    const result = await restoreAction(db, gmail, a.id);
    expect(result.state).toBe('failed');
  });
});

describe('outbox: purge', () => {
  it('quarantined → purged drops body_blob', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    const c = await commitAction(db, gmail, a.id);

    const purged = purgeAction(db, a.id);
    expect(purged.state).toBe('purged');
    const snap = readSnapshot(db, c.snapshot_id!);
    expect(snap!.body_blob).toBeNull();
    expect(snap!.body_size_bytes).not.toBeNull(); // size retained for stats
  });
});

describe('outbox: reconcile', () => {
  it("quarantining (delete) reconciles to quarantined when Gmail labels show TRASH", async () => {
    const { db, gmail } = setup();
    // Manually create a stuck-in-flight row simulating a crashed commit
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    db.prepare(`
      UPDATE email_actions SET state='quarantining', state_changed_at = unixepoch()
      WHERE id = ?
    `).run(a.id);
    // Pretend Gmail already received the trash call before crash
    gmail.labels.set('msg1', new Set(['TRASH']));

    const result = await reconcileInFlight(db, gmail);
    expect(result.reconciled.length).toBe(1);
    expect(result.failed.length).toBe(0);
    expect(loadAction(db, a.id)?.state).toBe('quarantined');
  });

  it("quarantining (delete) without Gmail evidence retries trash, then advances", async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    db.prepare(`
      UPDATE email_actions SET state='quarantining', state_changed_at = unixepoch()
      WHERE id = ?
    `).run(a.id);
    // Gmail has not yet trashed
    expect(gmail.labels.get('msg1')!.has('TRASH')).toBe(false);

    await reconcileInFlight(db, gmail);
    expect(loadAction(db, a.id)?.state).toBe('quarantined');
    expect(gmail.calls.find(c => c.method === 'trash')).toBeDefined();
  });

  it('purging is advanced locally without Gmail call beyond fetchLabels', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    await commitAction(db, gmail, a.id);
    const callsBefore = gmail.calls.length;

    db.prepare(`UPDATE email_actions SET state='purging' WHERE id = ?`).run(a.id);
    await reconcileInFlight(db, gmail);
    expect(loadAction(db, a.id)?.state).toBe('purged');
    // Reconcile didn't add Gmail calls for purging path
    expect(gmail.calls.length).toBe(callsBefore);
  });

  it('reconcile failure marks row as failed without throwing out of reconcileInFlight', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    db.prepare(`UPDATE email_actions SET state='quarantining' WHERE id = ?`).run(a.id);
    gmail.failAlways.add('fetchLabels');

    const result = await reconcileInFlight(db, gmail);
    expect(result.failed.length).toBe(1);
    expect(loadAction(db, a.id)?.state).toBe('failed');
    expect(verifyChain(db).ok).toBe(true);
  });
});

describe('outbox: listVault', () => {
  it('lists quarantined / restored / purged but not flagged or kept', async () => {
    const { db, gmail } = setup();
    const a1 = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    const a2 = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg2', intent: 'keep' });
    const a3 = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg3', intent: 'delete' });
    await commitAction(db, gmail, a1.id);
    await commitAction(db, gmail, a2.id);
    await commitAction(db, gmail, a3.id);

    const items = listVault(db, 'u1');
    const ids = items.map(i => i.email_id);
    expect(ids).toContain('msg1');
    expect(ids).toContain('msg3');
    expect(ids).not.toContain('msg2'); // keep is not in the vault
  });
});
