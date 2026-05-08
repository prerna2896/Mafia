import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, MockGmailAdapter } from './helpers.js';
import { flagAction, commitAction } from '../src/quarantine/outbox.js';
import { runPurger } from '../src/quarantine/purger.js';
import { readSnapshot } from '../src/quarantine/snapshot.js';
import { verifyChain } from '../src/quarantine/reflog.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function setup() {
  const { db, close } = makeTestDb();
  cleanup = close;
  const gmail = new MockGmailAdapter({ msg1: ['INBOX'], msg2: ['INBOX'] });
  return { db, gmail };
}

describe('purger', () => {
  it('does nothing for fresh quarantined items (purge_after in future)', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    await commitAction(db, gmail, a.id);

    const result = runPurger(db);
    expect(result.purged.length).toBe(0);
  });

  it('purges items past purge_after and drops body_blob', async () => {
    const { db, gmail } = setup();
    const a = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    const c = await commitAction(db, gmail, a.id);
    expect(c.snapshot_id).not.toBeNull();

    // Force purge_after to be in the past
    db.prepare(`UPDATE email_actions SET purge_after = 1 WHERE id = ?`).run(a.id);

    const result = runPurger(db);
    expect(result.purged.length).toBe(1);
    expect(result.purged[0].state).toBe('purged');

    const snap = readSnapshot(db, c.snapshot_id!);
    expect(snap!.body_blob).toBeNull();
  });

  it('writes a reflog entry per purged item; chain remains valid', async () => {
    const { db, gmail } = setup();
    const a1 = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete' });
    const a2 = flagAction(db, { user_id: 'u1', session_id: 's1', email_id: 'msg2', intent: 'archive' });
    await commitAction(db, gmail, a1.id);
    await commitAction(db, gmail, a2.id);

    db.prepare(`UPDATE email_actions SET purge_after = 1`).run();

    const result = runPurger(db);
    expect(result.purged.length).toBe(2);
    expect(verifyChain(db).ok).toBe(true);
  });
});
