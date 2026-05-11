// Hybrid snapshot store.
// - Archive intent: metadata only (headers + labels). Body recoverable from
//   [Gmail]/All Mail indefinitely; storing body locally would be waste.
// - Delete intent: metadata + gzipped RFC822 body blob. Gmail hard-purges
//   after 30d; the local blob is what enables deep-restore in Phase 4.
//
// id is content-addressable: sha256(email_id|internal_date). Stable so long
// as Gmail's internalDate is stable (ADR open question 3).

import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import type Database from 'better-sqlite3';
import type { Intent, EmailSnapshot } from './types.js';

export interface SnapshotInput {
  email_id: string;
  internal_date: number;
  headers: Record<string, string>;
  label_ids: string[];
  body_raw?: string; // RFC822 raw body; only used for delete intent
}

/**
 * Compute the content-addressable snapshot id.
 */
export function snapshotId(email_id: string, internal_date: number): string {
  return createHash('sha256').update(`${email_id}|${internal_date}`).digest('hex');
}

/**
 * Persist a snapshot. Returns the id (idempotent — same input produces same row).
 * For archive intent, body_raw is ignored even if supplied.
 */
export function writeSnapshot(
  db: Database.Database,
  intent: Intent,
  input: SnapshotInput,
): string {
  const id = snapshotId(input.email_id, input.internal_date);

  let bodyBlob: Buffer | null = null;
  let bodySize: number | null = null;
  if (intent === 'delete' && input.body_raw !== undefined) {
    const buf = Buffer.from(input.body_raw, 'utf-8');
    bodyBlob = gzipSync(buf);
    bodySize = buf.length;
  }

  db.prepare(`
    INSERT OR IGNORE INTO email_snapshots
      (id, email_id, internal_date, headers_json, label_ids_json, body_blob, body_size_bytes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.email_id,
    input.internal_date,
    JSON.stringify(input.headers),
    JSON.stringify(input.label_ids),
    bodyBlob,
    bodySize,
    Math.floor(Date.now() / 1000),
  );

  return id;
}

export function readSnapshot(db: Database.Database, id: string): EmailSnapshot | null {
  const row = db.prepare(`SELECT * FROM email_snapshots WHERE id = ?`).get(id) as
    | EmailSnapshot
    | undefined;
  return row ?? null;
}

/**
 * Decompress and return the raw RFC822 body, if present.
 */
export function readBody(snapshot: EmailSnapshot): string | null {
  if (!snapshot.body_blob) return null;
  return gunzipSync(snapshot.body_blob).toString('utf-8');
}

/**
 * Drop the body blob (cold-tier path for purger). Keeps headers + size for stats.
 */
export function dropBody(db: Database.Database, id: string) {
  db.prepare(`UPDATE email_snapshots SET body_blob = NULL WHERE id = ?`).run(id);
}
