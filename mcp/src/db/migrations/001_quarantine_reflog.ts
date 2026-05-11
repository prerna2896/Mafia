import { createHash } from 'crypto';
import type Database from 'better-sqlite3';

// Phase 0 schema additions: quarantine + reflog state machine.
// Source of truth: ADR-0001. Mirrored in src/db/schema.sql for documentation.
const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS email_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  email_id TEXT NOT NULL,
  thread_id TEXT,
  intent TEXT NOT NULL CHECK(intent IN ('keep','archive','delete')),
  state TEXT NOT NULL CHECK(state IN ('flagged','quarantining','quarantined','restoring','kept','restored','purging','purged','failed')),
  state_changed_at INTEGER NOT NULL,
  rule_provenance TEXT,
  upstream_status TEXT,
  snapshot_id TEXT,
  purge_after INTEGER,
  FOREIGN KEY (snapshot_id) REFERENCES email_snapshots(id)
);

CREATE INDEX IF NOT EXISTS idx_email_actions_state_purge ON email_actions(state, purge_after);
CREATE INDEX IF NOT EXISTS idx_email_actions_session ON email_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_email_actions_email ON email_actions(user_id, email_id);

CREATE TABLE IF NOT EXISTS reflog (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL UNIQUE,
  ts INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  transition TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS reflog_no_update BEFORE UPDATE ON reflog BEGIN
  SELECT RAISE(FAIL, 'reflog is append-only');
END;

CREATE TRIGGER IF NOT EXISTS reflog_no_delete BEFORE DELETE ON reflog BEGIN
  SELECT RAISE(FAIL, 'reflog is append-only');
END;

CREATE TABLE IF NOT EXISTS email_snapshots (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL,
  internal_date INTEGER NOT NULL,
  headers_json TEXT NOT NULL,
  label_ids_json TEXT NOT NULL,
  body_blob BLOB,
  body_size_bytes INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_snapshots_email ON email_snapshots(email_id);
`;

export const GENESIS_USER = '__system__';
export const GENESIS_ACTION_ID = '__genesis__';

export function migrate001(db: Database.Database) {
  db.exec(SCHEMA_DDL);

  // Phase 0 is pre-launch — drop any in-flight action_queue rows so we don't
  // leak destructive intent into the new state machine. The table itself
  // sticks around as legacy; it will be removed in a later migration.
  try {
    db.exec(`DELETE FROM action_queue`);
  } catch {
    // table doesn't exist on a fresh install
  }

  // Genesis reflog entry — gives the chain a known anchor.
  const hasGenesis = db.prepare(
    `SELECT 1 FROM reflog WHERE action_id = ? LIMIT 1`,
  ).get(GENESIS_ACTION_ID);

  if (!hasGenesis) {
    const ts = Math.floor(Date.now() / 1000);
    // Canonical JSON with sorted keys — must match canonicalJson() in reflog.ts
    // so verifyChain agrees on the genesis hash.
    const payload = JSON.stringify({ kind: 'genesis', schema_version: 1, ts });
    // Hash format: `${prev_hash}|${payload}` — same as appendReflog.
    const entryHash = sha256(`|${payload}`);
    db.prepare(`
      INSERT INTO reflog (prev_hash, entry_hash, ts, user_id, action_id, transition, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('', entryHash, ts, GENESIS_USER, GENESIS_ACTION_ID, 'genesis', payload);
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
