// Integration test: full V0 round-trip with a mocked Gmail.
// Mirrors what a user would do via the MCP tools — flag a batch, commit,
// inspect the vault, restore some, leave others to purge.

import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, MockGmailAdapter } from './helpers.js';
import {
  flagAction,
  commitAction,
  restoreAction,
  listFlagged,
  listVault,
  reconcileInFlight,
} from '../src/quarantine/outbox.js';
import { runPurger } from '../src/quarantine/purger.js';
import { verifyChain, readAll } from '../src/quarantine/reflog.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function setup(numEmails: number) {
  const { db, close } = makeTestDb();
  cleanup = close;
  const initial: Record<string, string[]> = {};
  for (let i = 1; i <= numEmails; i++) initial[`msg${i}`] = ['INBOX'];
  const gmail = new MockGmailAdapter(initial);
  return { db, gmail };
}

describe('V0 end-to-end', () => {
  it('full session: flag 10, commit (5 archive + 3 delete + 2 keep), restore 2, purge 2', async () => {
    const { db, gmail } = setup(10);
    const sess = 's_e2e_1';
    const userId = 'u_e2e';

    // Phase 1: flag 10 emails
    const flagged: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const intent: 'keep' | 'archive' | 'delete' =
        i <= 5 ? 'archive' : i <= 8 ? 'delete' : 'keep';
      const a = flagAction(db, {
        user_id: userId,
        session_id: sess,
        email_id: `msg${i}`,
        intent,
        rule_provenance: 'AI suggestion',
      });
      flagged.push(a.id);
    }
    expect(listFlagged(db, sess).length).toBe(10);

    // Phase 2: commit all
    for (const id of flagged) await commitAction(db, gmail, id);

    // After commit: nothing flagged; 8 quarantined; 2 kept
    expect(listFlagged(db, sess).length).toBe(0);
    const vaulted = listVault(db, userId);
    expect(vaulted.filter(a => a.state === 'quarantined').length).toBe(8);

    // Verify Gmail labels for archive intent — INBOX removed
    for (let i = 1; i <= 5; i++) {
      expect(gmail.labels.get(`msg${i}`)!.has('INBOX')).toBe(false);
    }
    // Verify Gmail labels for delete intent — TRASH added
    for (let i = 6; i <= 8; i++) {
      expect(gmail.labels.get(`msg${i}`)!.has('TRASH')).toBe(true);
    }
    // Keep intent — untouched
    for (let i = 9; i <= 10; i++) {
      expect(gmail.labels.get(`msg${i}`)!.has('INBOX')).toBe(true);
    }

    // Phase 3: restore 1 archive + 1 delete
    const archiveA = vaulted.find(a => a.intent === 'archive')!;
    const deleteA = vaulted.find(a => a.intent === 'delete')!;
    await restoreAction(db, gmail, archiveA.id);
    await restoreAction(db, gmail, deleteA.id);

    // Verify restore round-trip in Gmail
    expect(gmail.labels.get(archiveA.email_id)!.has('INBOX')).toBe(true);
    expect(gmail.labels.get(deleteA.email_id)!.has('TRASH')).toBe(false);
    expect(gmail.labels.get(deleteA.email_id)!.has('INBOX')).toBe(true);

    // Phase 4: backdate two more rows past purge_after, run purger
    const stillQuarantined = listVault(db, userId).filter(a => a.state === 'quarantined');
    const toPurge = stillQuarantined.slice(0, 2);
    db.prepare(`UPDATE email_actions SET purge_after = 1 WHERE id IN (?, ?)`)
      .run(toPurge[0].id, toPurge[1].id);
    const purged = runPurger(db);
    expect(purged.purged.length).toBe(2);

    // Phase 5: chain integrity — every transition logged, no breaks
    expect(verifyChain(db).ok).toBe(true);

    // Spot-check totals: 1 genesis + 10 flag + 8 quarantine + 8 quarantine_complete
    // + 2 keep + 2 restore + 2 restore_complete + 2 purge + 2 purge_complete = 37
    const all = readAll(db);
    expect(all.length).toBe(37);
  });

  it('crash mid-commit: row stuck in quarantining, reconcile fixes it', async () => {
    const { db, gmail } = setup(3);
    // Simulate the local "quarantining" row write succeeding but Gmail call
    // never happening (process killed). We can't easily kill the process
    // in-test; instead, we manually create the stuck row state.
    const a = flagAction(db, {
      user_id: 'u1', session_id: 's1', email_id: 'msg1', intent: 'delete',
    });

    // Begin commit but interrupt: snapshot row + transition to quarantining
    // happens in commitAction's first transaction. We'll mimic by setting
    // state to quarantining without actually calling Gmail.
    db.prepare(`UPDATE email_actions SET state='quarantining' WHERE id = ?`).run(a.id);

    // Restart: reconcile sees a row in quarantining. Gmail still has msg1
    // in INBOX (since the trash call never happened). Reconcile should
    // retry the trash call, then advance to quarantined.
    const result = await reconcileInFlight(db, gmail);
    expect(result.reconciled.length).toBe(1);
    expect(result.failed.length).toBe(0);
    expect(gmail.labels.get('msg1')!.has('TRASH')).toBe(true);
    expect(verifyChain(db).ok).toBe(true);
  });
});
