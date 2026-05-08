# ADR-0001: Quarantine + reflog state machine for Phase 0

## Status
Proposed

## Context
Mafia's current `commit_session` (`/Users/prernaagarwal/wonder/Mafia/src/tools/commit-session.ts`) is destructive: it calls `executeActions` against Gmail, deletes the in-DB queue, and retains no per-email audit trail. The only persistent state is aggregate counts on the `sessions` row (`/Users/prernaagarwal/wonder/Mafia/src/db/index.ts`). PRD §3.2, §5.4, and §6.4 require a reversible quarantine model with an append-only hash-chained reflog supporting per-action restore. This is the trust primitive of the entire product — without it, no user will hand Mafia destructive authority over their inbox.

## Decision
Adopt **Recommendation C — Hybrid storage**:
- State machine: `flagged` → `quarantined` → {`kept` | `restored` | `purged`}, with intermediate `*-ing` states (`quarantining`, `restoring`, `purging`) for crash recovery.
- Quarantine for archives = Gmail labels modified via `batchModify`; **metadata-only** snapshot stored locally (body recoverable from `[Gmail]/All Mail` indefinitely).
- Quarantine for deletes = `users.messages.trash` + **full email body blob** stored locally (so deep-restore works after Gmail's 30-day auto-purge of trash).
- Append-only SHA-256 hash-chained reflog (`prev_hash` + `entry_hash` on every entry).
- INSERT-only enforced at the storage layer via SQLite triggers (`BEFORE UPDATE` / `BEFORE DELETE` → `RAISE FAIL`).
- Default purge horizon: 30 days (matches Gmail trash auto-purge), per-action overridable via `purge_after` column.
- Idempotence via transactional outbox: write intent + reflog locally → call Gmail → write outcome + reflog. Reconcile on startup.
- Schema: three tables — `email_actions` (state machine), `reflog` (audit chain), `email_snapshots` (content-addressable pre-action snapshots).

Full SQL DDL is in the **Schema (canonical)** section below.

## Consequences

### Positive
- Phase 0 ships a real trust primitive instead of a destructive tool wrapper.
- Data model ports to the Rust core in Phase 1 without redesign — the schema is storage-engine agnostic.
- Faithfully mirrors Gmail's asymmetric reversibility (archive = cheap & infinite, delete = costly & 30-day).
- Deep-restore enables a Phase 4 paid feature aligned with PRD §12.
- Hash chain + INSERT-only triggers cost almost nothing now but are extremely expensive to retrofit later.

### Negative
- ~50–200 KB per quarantined-for-deletion email × 30-day retention. Manageable on desktop, painful on mobile.
- Need a cold-tier strategy by Phase 1 (compress + offload `body_blob` after some interval).
- Adds three tables and a reconcile-on-startup path; raises the floor of "what could go wrong on first run."

### Neutral
- Outbox + reconcile is a one-time investment that pays back across every future action type.
- Reflog format is forward-compatible: adding new transition types doesn't break the hash chain.

## Alternatives considered

| | Approach | Why rejected |
|---|---|---|
| **A** | Trust the upstream — reflog stores metadata only; quarantine = `messages.trash`. Cheapest. | Loses ground if user empties Gmail trash manually mid-window. Forecloses deep-restore feature in PRD §12. |
| **B** | Local source of truth — always store full body blob for archive and delete. | Wasted storage: archives are infinitely recoverable from `[Gmail]/All Mail` already. |
| Postgres-style MVCC tombstones | Each action writes a new row version; restore = revert to prior version. | Too heavyweight; SQLite isn't built for it; conflates audit log with operational state. |
| APFS-style filesystem snapshots | Snapshot the mailbox at session start; restore = diff. | Wrong granularity — can't restore one email without restoring all of them. |

## Schema (canonical)

```sql
-- State machine: one row per (session, email_id, action_intent)
CREATE TABLE email_actions (
  id TEXT PRIMARY KEY,                -- act_<ts>_<rand>
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  email_id TEXT NOT NULL,             -- Gmail message id
  thread_id TEXT,
  intent TEXT NOT NULL CHECK(intent IN ('keep','archive','delete')),
  state TEXT NOT NULL CHECK(state IN ('flagged','quarantining','quarantined','restoring','kept','restored','purging','purged','failed')),
  state_changed_at INTEGER NOT NULL,
  rule_provenance TEXT,               -- which rule/AI suggestion → enables "restore + allowlist"
  upstream_status TEXT,               -- last Gmail API result code
  snapshot_id TEXT,                   -- FK to email_snapshots; NULL for archives, present for deletes
  purge_after INTEGER,                -- unix ts; default state_changed_at + 30d for quarantined
  FOREIGN KEY (snapshot_id) REFERENCES email_snapshots(id)
);
CREATE INDEX idx_email_actions_state_purge ON email_actions(state, purge_after);
CREATE INDEX idx_email_actions_session ON email_actions(session_id);
CREATE INDEX idx_email_actions_email ON email_actions(user_id, email_id);

-- Append-only reflog: hash-chained log of state transitions
CREATE TABLE reflog (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  prev_hash TEXT NOT NULL,                -- hex sha256; '' for genesis
  entry_hash TEXT NOT NULL UNIQUE,        -- sha256(prev_hash||canonical_json(payload))
  ts INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  action_id TEXT NOT NULL,                -- references email_actions.id (logical, not FK to allow log to outlive actions)
  transition TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE TRIGGER reflog_no_update BEFORE UPDATE ON reflog BEGIN
  SELECT RAISE(FAIL, 'reflog is append-only');
END;
CREATE TRIGGER reflog_no_delete BEFORE DELETE ON reflog BEGIN
  SELECT RAISE(FAIL, 'reflog is append-only');
END;

-- Pre-action snapshot store, content-addressable
CREATE TABLE email_snapshots (
  id TEXT PRIMARY KEY,                -- sha256 of canonical (message_id, internal_date)
  email_id TEXT NOT NULL,
  internal_date INTEGER NOT NULL,
  headers_json TEXT NOT NULL,         -- from, to, cc, subject, date, message-id, references
  label_ids_json TEXT NOT NULL,       -- snapshot of labels at action time
  body_blob BLOB,                     -- gzip'd raw RFC822, NULL for archive intent
  body_size_bytes INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_email_snapshots_email ON email_snapshots(email_id);
```

## Open questions to verify before implementation
1. Does `users.messages.trash` honor the same 30-day timer as UI-side trashing?
2. What HTTP code / error name does `messages.untrash` return after the 30-day window?
3. Is `internalDate` stable enough to use as part of the snapshot's content-addressable id?
4. better-sqlite3 + WAL durability under crash mid-transaction — is `synchronous=NORMAL` sufficient, or must we move to `FULL`?
5. Hash chain semantics under concurrent writes — is single-connection serialization (better-sqlite3's default) sufficient, or do we need an explicit mutex?
6. Should `body_blob` go NULL after 30d (move to cold tier) — Phase 4 design but doesn't foreclose it now?
7. Allowlist UX coupling — log `rule_provenance` on every action so Phase 0+1 can build allowlist UX without schema migration.

## References
- PRD: `/Users/prernaagarwal/wonder/Mafia/PRD.md` §3.2, §5.4, §6.4, §9 Phase 0
- Gmail API: `messages.trash`, `messages.untrash`, `batchModify`
- Git reflog (`gc.reflogExpire`), Restic forget/prune split, AV quarantine model
- Crosby & Wallach 2009 — *Efficient Data Structures for Tamper-Evident Logging*
- Microservices.io — Transactional outbox pattern
