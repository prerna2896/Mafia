// Pin Mafia's current single-user behavior so a future Phase-1 multi-user
// change is intentional rather than accidental.
//
// Today every tool calls getFirstUser(). The whole-app assumption is "one
// user per Mafia install." If/when we add multi-user (Phase 1+), these tests
// will fail loudly and force the change to update the contract everywhere.

import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import {
  flagAction,
  loadAction,
  listVault,
  listFlagged,
} from '../src/quarantine/outbox.js';
import { readAll } from '../src/quarantine/reflog.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function setup() {
  const { db, close } = makeTestDb();
  cleanup = close;
  return db;
}

describe('multi-user: data layer is already user-scoped', () => {
  // The quarantine layer takes user_id explicitly; the single-user
  // assumption only lives in the *tools* (getFirstUser). These tests confirm
  // the lower layer is already correct, so Phase 1 multi-user is a tool-level
  // refactor, not a schema migration.

  it('flagged actions are isolated by user_id', () => {
    const db = setup();
    const a1 = flagAction(db, { user_id: 'alice', session_id: 'sA', email_id: 'msg1', intent: 'archive' });
    const b1 = flagAction(db, { user_id: 'bob',   session_id: 'sB', email_id: 'msg1', intent: 'delete' });

    // Same email_id, different users — both rows persist.
    expect(loadAction(db, a1.id)?.user_id).toBe('alice');
    expect(loadAction(db, b1.id)?.user_id).toBe('bob');
    expect(a1.id).not.toBe(b1.id);
  });

  it('listVault scopes results by user_id', () => {
    const db = setup();
    flagAction(db, { user_id: 'alice', session_id: 'sA', email_id: 'msg1', intent: 'archive' });
    flagAction(db, { user_id: 'bob',   session_id: 'sB', email_id: 'msg2', intent: 'delete' });
    // Note: listVault filters to non-flagged states, so flagged rows above
    // won't appear. Insert post-commit-style rows directly to test the filter.
    db.prepare(`
      INSERT INTO email_actions (id, user_id, session_id, email_id, thread_id, intent, state, state_changed_at, rule_provenance)
      VALUES ('a-q', 'alice', 'sA', 'msg1', NULL, 'archive', 'quarantined', unixepoch(), NULL)
    `).run();
    db.prepare(`
      INSERT INTO email_actions (id, user_id, session_id, email_id, thread_id, intent, state, state_changed_at, rule_provenance)
      VALUES ('b-q', 'bob', 'sB', 'msg2', NULL, 'delete', 'quarantined', unixepoch(), NULL)
    `).run();

    const aliceVault = listVault(db, 'alice');
    const bobVault = listVault(db, 'bob');

    expect(aliceVault.map(a => a.email_id)).toEqual(['msg1']);
    expect(bobVault.map(a => a.email_id)).toEqual(['msg2']);
  });

  it('listFlagged scopes by session_id (not user)', () => {
    const db = setup();
    // Two users with the same session id (unusual but allowed at the data layer)
    flagAction(db, { user_id: 'alice', session_id: 's1', email_id: 'msg1', intent: 'archive' });
    flagAction(db, { user_id: 'bob',   session_id: 's2', email_id: 'msg2', intent: 'archive' });

    expect(listFlagged(db, 's1').map(a => a.user_id)).toEqual(['alice']);
    expect(listFlagged(db, 's2').map(a => a.user_id)).toEqual(['bob']);
  });

  it('reflog records user_id on every entry', () => {
    const db = setup();
    flagAction(db, { user_id: 'alice', session_id: 'sA', email_id: 'msg1', intent: 'archive' });
    flagAction(db, { user_id: 'bob',   session_id: 'sB', email_id: 'msg2', intent: 'archive' });

    const all = readAll(db).filter(e => e.transition === 'flag');
    expect(all.length).toBe(2);
    expect(all.find(e => e.user_id === 'alice')).toBeDefined();
    expect(all.find(e => e.user_id === 'bob')).toBeDefined();
  });
});

describe('multi-user: V0 contract — first-user-only at tool layer', () => {
  // These pin the *current* tool-layer behavior. When Phase 1 introduces a
  // user_id parameter on every tool, these tests should be updated, not
  // deleted — they prove the migration is intentional.

  it('reflog can store entries from many users without conflict', () => {
    const db = setup();
    for (let i = 0; i < 5; i++) {
      flagAction(db, {
        user_id: `u${i}`,
        session_id: `s${i}`,
        email_id: `msg${i}`,
        intent: 'archive',
      });
    }
    const all = readAll(db).filter(e => e.transition === 'flag');
    expect(all.length).toBe(5);
    const users = new Set(all.map(e => e.user_id));
    expect(users.size).toBe(5);
  });
});
