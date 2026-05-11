// Cross-language consistency: TS writes the reflog, Rust verifies it.
// If this test fails it means the hash chain formats have drifted between
// the two implementations — at that point Mafia's audit history is no
// longer portable to the Rust core, which is a blocking issue.

import { describe, it, expect, afterEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import {
  appendReflog,
  canonicalJson,
  readAll,
  verifyChain as tsVerifyChain,
} from '../src/quarantine/reflog.js';
import { canonicalJson as rustCanonicalJson, verifyChain as rustVerifyChain } from '@mafia/core-node';

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; });

function fresh() {
  const { db, close } = makeTestDb();
  cleanup = close;
  return db;
}

describe('TS↔Rust canonical_json parity', () => {
  it('produces identical output for nested objects', () => {
    const samples: unknown[] = [
      { b: 2, a: 1 },
      { z: 'x', a: { d: 4, c: { e: 5, a: 1 } } },
      { list: [{ z: 1, a: 2 }, { y: 3, b: 4 }] },
      { mix: 1, arr: [3, 1, 2], obj: { k: null, j: true, i: 'str' } },
      {}, // empty object
      [], // empty array
      null,
      42,
      'string',
    ];
    for (const s of samples) {
      const tsOut = canonicalJson(s);
      const rustOut = rustCanonicalJson(JSON.stringify(s));
      expect(rustOut).toBe(tsOut);
    }
  });
});

describe('TS↔Rust verifyChain parity', () => {
  it('Rust accepts a clean chain written by TS (genesis + 50 entries)', () => {
    const db = fresh();
    for (let i = 0; i < 50; i++) {
      appendReflog(db, {
        user_id: 'u1',
        action_id: `act_${i}`,
        transition: i % 2 === 0 ? 'flag' : 'quarantine',
        payload: { i, intent: i % 2 === 0 ? 'delete' : 'archive' },
        ts: 1700000000 + i,
      });
    }
    const all = readAll(db);
    expect(all).toHaveLength(51); // genesis + 50

    // TS verifier OK
    expect(tsVerifyChain(db).ok).toBe(true);

    // Rust verifier OK — fed the same rows
    const rustEntries = all.map(e => ({
      seq: e.seq,
      prevHash: e.prev_hash,
      entryHash: e.entry_hash,
      ts: e.ts,
      userId: e.user_id,
      actionId: e.action_id,
      transition: e.transition,
      payloadJson: e.payload_json,
    }));
    const rustResult = rustVerifyChain(rustEntries as never);
    expect(rustResult.ok).toBe(true);
  });

  it('Rust detects a tampered payload introduced after TS write', () => {
    const db = fresh();
    appendReflog(db, { user_id: 'u', action_id: 'a1', transition: 'flag', payload: { x: 1 } });
    appendReflog(db, { user_id: 'u', action_id: 'a1', transition: 'quarantine', payload: { x: 2 } });
    const all = readAll(db);

    // Tamper the SECOND-to-last entry's payload without recomputing entry_hash.
    const tampered = all.map((e, idx) =>
      idx === all.length - 2
        ? { ...e, payload_json: '{"x":999}' }
        : e,
    );
    const rustEntries = tampered.map(e => ({
      seq: e.seq,
      prevHash: e.prev_hash,
      entryHash: e.entry_hash,
      ts: e.ts,
      userId: e.user_id,
      actionId: e.action_id,
      transition: e.transition,
      payloadJson: e.payload_json,
    }));
    const rustResult = rustVerifyChain(rustEntries as never);
    expect(rustResult.ok).toBe(false);
    expect(rustResult.brokenAt).toBeDefined();
  });

  it('Rust + TS agree on whether a chain is valid (fuzz across 100 random shapes)', () => {
    const db = fresh();
    // Write a varied sequence; each entry's payload picks random keys/values.
    for (let i = 0; i < 100; i++) {
      const payload: Record<string, unknown> = {};
      const k = 1 + Math.floor(Math.random() * 5);
      for (let j = 0; j < k; j++) {
        payload[`field_${String.fromCharCode(97 + j)}`] =
          Math.random() < 0.5 ? Math.floor(Math.random() * 1000) : `val_${i}_${j}`;
      }
      appendReflog(db, {
        user_id: `u_${i % 3}`,
        action_id: `act_${i}`,
        transition: ['flag', 'quarantine', 'restore', 'keep', 'purge'][i % 5] as never,
        payload,
        ts: 1700000000 + i,
      });
    }
    const all = readAll(db);
    expect(tsVerifyChain(db).ok).toBe(true);

    const rustEntries = all.map(e => ({
      seq: e.seq,
      prevHash: e.prev_hash,
      entryHash: e.entry_hash,
      ts: e.ts,
      userId: e.user_id,
      actionId: e.action_id,
      transition: e.transition,
      payloadJson: e.payload_json,
    }));
    expect(rustVerifyChain(rustEntries as never).ok).toBe(true);
  });
});
