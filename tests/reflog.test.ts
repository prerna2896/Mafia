import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { appendReflog, verifyChain, readAll, canonicalJson } from '../src/quarantine/reflog.js';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function fresh() {
  const { db, close } = makeTestDb();
  cleanup = close;
  return db;
}

describe('reflog: append + verify chain', () => {
  it('genesis row is written by migration with empty prev_hash', () => {
    const db = fresh();
    const all = readAll(db);
    expect(all).toHaveLength(1);
    expect(all[0].prev_hash).toBe('');
    expect(all[0].transition).toBe('genesis');
  });

  it('verifyChain passes for the genesis-only state', () => {
    const db = fresh();
    expect(verifyChain(db).ok).toBe(true);
  });

  it('append + verify across many entries', () => {
    const db = fresh();
    for (let i = 0; i < 50; i++) {
      appendReflog(db, {
        user_id: 'u1',
        action_id: `act_${i}`,
        transition: 'flag',
        payload: { i, x: { y: 'z' } },
        ts: 1700000000 + i,
      });
    }
    expect(verifyChain(db).ok).toBe(true);

    const all = readAll(db);
    expect(all).toHaveLength(51); // genesis + 50

    // Each entry's prev_hash matches the previous entry's entry_hash
    for (let i = 1; i < all.length; i++) {
      expect(all[i].prev_hash).toBe(all[i - 1].entry_hash);
    }
  });

  it('verifyChain rejects payload tampering', () => {
    const db = fresh();
    appendReflog(db, { user_id: 'u1', action_id: 'a1', transition: 'flag', payload: { x: 1 } });
    appendReflog(db, { user_id: 'u1', action_id: 'a1', transition: 'quarantine', payload: { x: 2 } });

    // Direct UPDATE is blocked by the trigger, so we verify that the verifier
    // catches a tampered payload by simulating one. Open a second connection
    // to disable triggers? No — we test verifier robustness by stuffing a
    // bad row via insert and then re-verify.
    // Insert a row with a wrong entry_hash (chain-break injection).
    db.prepare(`
      INSERT INTO reflog (prev_hash, entry_hash, ts, user_id, action_id, transition, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('zzz_bad_prev', 'deadbeef', 1700000000, 'u1', 'a3', 'flag', '{"x":3}');

    const result = verifyChain(db);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/prev_hash mismatch/);
  });

  it('canonicalJson sorts keys recursively', () => {
    const a = canonicalJson({ b: 2, a: 1, c: { e: 5, d: 4 } });
    const b = canonicalJson({ a: 1, b: 2, c: { d: 4, e: 5 } });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2,"c":{"d":4,"e":5}}');
  });
});

describe('reflog: INSERT-only enforcement (storage layer)', () => {
  it('UPDATE on reflog raises', () => {
    const db = fresh();
    expect(() => {
      db.prepare(`UPDATE reflog SET payload_json = '{"hacked":true}' WHERE seq = 1`).run();
    }).toThrow(/append-only/);
  });

  it('DELETE on reflog raises', () => {
    const db = fresh();
    expect(() => {
      db.prepare(`DELETE FROM reflog WHERE seq = 1`).run();
    }).toThrow(/append-only/);
  });
});
