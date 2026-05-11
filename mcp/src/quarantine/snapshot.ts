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
  // URL-safe base64-encoded RFC822 raw body (Gmail's
  // users.messages.get({format:'raw'}) output). Only used for delete intent.
  body_raw?: string;
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
    // body_raw is base64url-encoded RFC822 (Gmail's format:'raw' output).
    // Decode to a binary buffer before gzipping so we (a) don't store the
    // ~33% base64 inflation and (b) report body_size_bytes as the actual
    // email size, not the encoded length.
    // NB: prior versions of this code used `Buffer.from(input.body_raw, 'utf-8')`
    // which double-inflated storage and recorded the wrong size — old rows in
    // a dev DB are still readable as latin1 strings but are gzipped base64.
    const decoded = Buffer.from(input.body_raw, 'base64url');
    bodyBlob = gzipSync(decoded);
    bodySize = decoded.length;
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
 * Decompress and return the raw RFC822 body as a Buffer, if present.
 * Returning Buffer (rather than string) keeps callers honest about binary
 * payloads: an RFC822 email is bytes, not text, and forcing a utf-8 decode
 * here would corrupt 8-bit MIME parts and binary attachments.
 */
export function readBody(snapshot: EmailSnapshot): Buffer | null {
  if (!snapshot.body_blob) return null;
  return gunzipSync(snapshot.body_blob);
}

/**
 * Drop the body blob (cold-tier path for purger). Keeps headers + size for stats.
 */
export function dropBody(db: Database.Database, id: string) {
  db.prepare(`UPDATE email_snapshots SET body_blob = NULL WHERE id = ?`).run(id);
}
