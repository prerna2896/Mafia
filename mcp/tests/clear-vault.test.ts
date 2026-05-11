import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb, MockGmailAdapter } from './helpers.js';
import { flagAction, commitAction } from '../src/quarantine/outbox.js';
import { runClearVault } from '../src/tools/clear-vault.js';
import { readSnapshot } from '../src/quarantine/snapshot.js';
import { verifyChain } from '../src/quarantine/reflog.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

const USER = 'u_clear';
const SESS = 's_clear';

function setup(numEmails: number) {
  const { db, close } = makeTestDb();
  cleanup = close;
  const initial: Record<string, string[]> = {};
  for (let i = 1; i <= numEmails; i++) initial[`msg${i}`] = ['INBOX'];
  const gmail = new MockGmailAdapter(initial);
  return { db, gmail };
}

async function vaultBatch(
  db: ReturnType<typeof makeTestDb>['db'],
  gmail: MockGmailAdapter,
  emailIds: string[],
  intent: 'archive' | 'delete' = 'delete',
): Promise<string[]> {
  const ids: string[] = [];
  for (const eid of emailIds) {
    const a = flagAction(db, { user_id: USER, session_id: SESS, email_id: eid, intent });
    const c = await commitAction(db, gmail, a.id);
    ids.push(c.id);
  }
  return ids;
}

describe('clear_vault', () => {
  it('preview mode returns candidates without changing state', async () => {
    const { db, gmail } = setup(2);
    const ids = await vaultBatch(db, gmail, ['msg1', 'msg2']);
    // Backdate so they pass the default 7-day filter
    db.prepare(`UPDATE email_actions SET state_changed_at = state_changed_at - ?`)
      .run(10 * 86400);

    const result = runClearVault(db, USER, { older_than_days: 7, confirm: false }) as {
      preview: boolean; would_purge_count: number;
    };
    expect(result.preview).toBe(true);
    expect(result.would_purge_count).toBe(2);

    // No state change — both still quarantined.
    const states = db.prepare(`SELECT state FROM email_actions WHERE id IN (?, ?)`)
      .all(ids[0], ids[1]) as { state: string }[];
    expect(states.every(s => s.state === 'quarantined')).toBe(true);
  });

  it('default older_than_days=7 skips fresh items', async () => {
    const { db, gmail } = setup(2);
    await vaultBatch(db, gmail, ['msg1', 'msg2']);
    // Items are fresh (state_changed_at = now)

    const result = runClearVault(db, USER, { older_than_days: 7, confirm: true }) as {
      purged_count: number;
    };
    expect(result.purged_count).toBe(0);
  });

  it('purges items older than the age cutoff and drops body_blob', async () => {
    const { db, gmail } = setup(2);
    const ids = await vaultBatch(db, gmail, ['msg1', 'msg2'], 'delete');
    const snapBefore = db.prepare(`SELECT snapshot_id FROM email_actions WHERE id = ?`)
      .get(ids[0]) as { snapshot_id: string };
    expect(readSnapshot(db, snapBefore.snapshot_id)!.body_blob).not.toBeNull();

    db.prepare(`UPDATE email_actions SET state_changed_at = state_changed_at - ?`)
      .run(10 * 86400);

    const result = runClearVault(db, USER, { older_than_days: 7, confirm: true }) as {
      purged_count: number; failed_count: number;
    };
    expect(result.purged_count).toBe(2);
    expect(result.failed_count).toBe(0);

    const states = db.prepare(`SELECT state FROM email_actions WHERE id IN (?, ?)`)
      .all(ids[0], ids[1]) as { state: string }[];
    expect(states.every(s => s.state === 'purged')).toBe(true);

    expect(readSnapshot(db, snapBefore.snapshot_id)!.body_blob).toBeNull();
  });

  it('older_than_days=0 clears everything quarantined', async () => {
    const { db, gmail } = setup(3);
    await vaultBatch(db, gmail, ['msg1', 'msg2', 'msg3']);

    const result = runClearVault(db, USER, { older_than_days: 0, confirm: true }) as {
      purged_count: number;
    };
    expect(result.purged_count).toBe(3);
  });

  it('action_ids overrides the age filter', async () => {
    const { db, gmail } = setup(3);
    const ids = await vaultBatch(db, gmail, ['msg1', 'msg2', 'msg3']);
    // All fresh — would normally be skipped by older_than_days=7

    const result = runClearVault(db, USER, {
      older_than_days: 7,
      action_ids: [ids[0], ids[2]],
      confirm: true,
    }) as { purged_count: number };
    expect(result.purged_count).toBe(2);

    const middle = db.prepare(`SELECT state FROM email_actions WHERE id = ?`)
      .get(ids[1]) as { state: string };
    expect(middle.state).toBe('quarantined');
  });

  it('does not touch other users\' vault items', async () => {
    const { db, gmail } = setup(2);
    // Vault one as USER, one as a different user.
    const a1 = flagAction(db, { user_id: USER, session_id: SESS, email_id: 'msg1', intent: 'delete' });
    await commitAction(db, gmail, a1.id);
    const a2 = flagAction(db, { user_id: 'other_user', session_id: 's_other', email_id: 'msg2', intent: 'delete' });
    await commitAction(db, gmail, a2.id);

    const result = runClearVault(db, USER, { older_than_days: 0, confirm: true }) as {
      purged_count: number;
    };
    expect(result.purged_count).toBe(1);

    const otherState = db.prepare(`SELECT state FROM email_actions WHERE id = ?`)
      .get(a2.id) as { state: string };
    expect(otherState.state).toBe('quarantined');
  });

  it('writes reflog entries; chain remains valid', async () => {
    const { db, gmail } = setup(2);
    await vaultBatch(db, gmail, ['msg1', 'msg2']);

    runClearVault(db, USER, { older_than_days: 0, confirm: true });

    expect(verifyChain(db).ok).toBe(true);
  });
});
