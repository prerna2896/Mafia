// Append-only hash-chained reflog writer + verifier.
// INSERT-only is enforced by SQLite triggers (see migration 001).
// Hash chain is enforced here at the application layer.
//
// Each entry: prev_hash || canonical_json(payload) → SHA-256 → entry_hash.
// Genesis row has prev_hash = '' and is written by migration001.

import { createHash } from 'crypto';
import type Database from 'better-sqlite3';
import type { ReflogEntry, Transition } from './types.js';

export interface AppendArgs {
  user_id: string;
  action_id: string;
  transition: Transition;
  payload: Record<string, unknown>;
  ts?: number; // override for testing
}

/**
 * Append a single reflog entry, computing the hash chain link.
 * Caller must supply an open SQLite connection. Wrap in a transaction
 * if multiple appends should be atomic.
 *
 * Returns the inserted entry_hash (also serves as the next entry's prev_hash).
 */
export function appendReflog(db: Database.Database, args: AppendArgs): string {
  const ts = args.ts ?? Math.floor(Date.now() / 1000);
  const payload = canonicalJson(args.payload);

  // Read tail under the same connection. better-sqlite3 is single-threaded
  // per connection, so we don't need an explicit lock as long as appends
  // are routed through one connection.
  const tail = db
    .prepare(`SELECT entry_hash FROM reflog ORDER BY seq DESC LIMIT 1`)
    .get() as { entry_hash: string } | undefined;

  const prevHash = tail?.entry_hash ?? '';
  const entryHash = sha256(`${prevHash}|${payload}`);

  db.prepare(`
    INSERT INTO reflog (prev_hash, entry_hash, ts, user_id, action_id, transition, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(prevHash, entryHash, ts, args.user_id, args.action_id, args.transition, payload);

  return entryHash;
}

/**
 * Read all reflog entries for a given action_id, in chronological order.
 */
export function readActionLog(db: Database.Database, action_id: string): ReflogEntry[] {
  return db.prepare(`
    SELECT * FROM reflog WHERE action_id = ? ORDER BY seq ASC
  `).all(action_id) as ReflogEntry[];
}

/**
 * Read all reflog entries, in chronological order. Use for full-chain verification.
 */
export function readAll(db: Database.Database): ReflogEntry[] {
  return db.prepare(`SELECT * FROM reflog ORDER BY seq ASC`).all() as ReflogEntry[];
}

export interface VerifyResult {
  ok: boolean;
  brokenAt?: number; // seq of the first invalid link
  reason?: string;
}

/**
 * Verify the entire chain. Recomputes each entry's hash from its prev_hash
 * and payload, comparing to the stored entry_hash. Confirms genesis prev_hash
 * is the empty string.
 */
export function verifyChain(db: Database.Database): VerifyResult {
  const entries = readAll(db);
  if (entries.length === 0) return { ok: true };

  // Genesis must have prev_hash = ''.
  if (entries[0].prev_hash !== '') {
    return { ok: false, brokenAt: entries[0].seq, reason: 'genesis prev_hash must be empty' };
  }

  let expectedPrev = '';
  for (const e of entries) {
    if (e.prev_hash !== expectedPrev) {
      return { ok: false, brokenAt: e.seq, reason: `prev_hash mismatch (expected ${expectedPrev}, got ${e.prev_hash})` };
    }
    const recomputed = sha256(`${e.prev_hash}|${e.payload_json}`);
    if (recomputed !== e.entry_hash) {
      return { ok: false, brokenAt: e.seq, reason: 'entry_hash mismatch — payload tampered' };
    }
    expectedPrev = e.entry_hash;
  }

  return { ok: true };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Canonical JSON: keys sorted alphabetically at every level. Required so the
 * hash is deterministic — two records with the same data must produce the
 * same hash regardless of insertion order.
 */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k]);
    return out;
  }
  return value;
}
