-- Phase 0 schema additions: quarantine + reflog state machine.
-- See /Users/prernaagarwal/wonder/Mafia/docs/adr/ADR-0001-quarantine-reflog-state-machine.md

-- State machine: one row per (session, email_id, action_intent).
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

-- Append-only reflog: hash-chained log of state transitions.
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

-- INSERT-only enforcement at the storage layer.
CREATE TRIGGER IF NOT EXISTS reflog_no_update BEFORE UPDATE ON reflog BEGIN
  SELECT RAISE(FAIL, 'reflog is append-only');
END;
CREATE TRIGGER IF NOT EXISTS reflog_no_delete BEFORE DELETE ON reflog BEGIN
  SELECT RAISE(FAIL, 'reflog is append-only');
END;

-- Pre-action snapshots, content-addressable.
-- body_blob is gzipped RFC822 for delete-intent only; NULL for archive (recoverable from [Gmail]/All Mail).
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
