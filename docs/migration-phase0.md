# Phase 0 migration plan: quarantine + reflog state machine

Maps current Mafia code to the data model decided in `/Users/prernaagarwal/wonder/Mafia/docs/adr/ADR-0001-quarantine-reflog-state-machine.md`. Companion to that ADR — read it first.

## 1. Pre-work

| | Item | Notes |
|---|---|---|
| 1.1 | Remove `/Users/prernaagarwal/wonder/Mafia/src/lib/Claude.dmg` | Accidentally committed binary; not source code. Delete from working tree and (if already pushed) from git history via `git rm` + history rewrite. Add `*.dmg` to `.gitignore`. |
| 1.2 | Verify ADR open question 1 | `users.messages.trash` 30-day timer parity with UI-trash. Empirical: trash a message via API, observe in UI, confirm timer text. |
| 1.3 | Verify ADR open question 2 | Capture exact error shape for `messages.untrash` after 30d. Needed for the `restoring → failed` transition. |
| 1.4 | Verify ADR open question 3 | Confirm `internalDate` stability (it should never change for an existing message id). Document. |
| 1.5 | Verify ADR open question 4 | Decide `synchronous=NORMAL` vs `FULL`. Phase 0 default: `NORMAL` + WAL (current). Document the durability promise. |
| 1.6 | Verify ADR open question 5 | better-sqlite3 is synchronous and single-connection per process — confirm. If we ever go multi-connection, add explicit mutex on reflog writes. |

## 2. Schema migration

Current state (from `/Users/prernaagarwal/wonder/Mafia/src/db/index.ts`):
- `users`, `sessions`, `action_queue`, `user_stats`, `user_badges`, `user_preferences` exist.
- `action_queue` is **destructively cleared** by `commitSession()` (line 168) — no audit trail.

Migration approach:

| | Step | Notes |
|---|---|---|
| 2.1 | Add three new tables: `email_actions`, `reflog`, `email_snapshots` (DDL in ADR). | Idempotent `CREATE TABLE IF NOT EXISTS`. |
| 2.2 | Keep `action_queue` for now as a transient intent queue, OR fold its role into `email_actions` with state=`flagged`. | Recommended: **fold** — fewer concepts, one source of truth. |
| 2.3 | In-flight session data | Phase 0 is pre-launch hardening: there's no production data to preserve. Null-out: drop `action_queue` rows on first run of the new migration. Document this in the migration script. |
| 2.4 | Genesis reflog entry | On first run, insert a single genesis row with `prev_hash=''` and `entry_hash=sha256("genesis|<user_id>|<created_at>")`. |

## 3. New module structure

| Path | Purpose | Pure / IO |
|---|---|---|
| `/Users/prernaagarwal/wonder/Mafia/src/db/schema.sql` | Canonical DDL — single source of truth for table shape. | — |
| `/Users/prernaagarwal/wonder/Mafia/src/db/migrations/001_quarantine_reflog.ts` | Reads `schema.sql`, runs DDL idempotently, drops old `action_queue` rows, writes genesis reflog entry. | IO |
| `/Users/prernaagarwal/wonder/Mafia/src/quarantine/state-machine.ts` | Pure state-transition functions: `transition(current, event) → next`. Validates legal transitions. No DB. | Pure |
| `/Users/prernaagarwal/wonder/Mafia/src/quarantine/reflog.ts` | Append-only writer. Computes `entry_hash`, enforces `prev_hash` chain via SELECT-then-INSERT in a transaction. Verify-chain helper for tests. | IO |
| `/Users/prernaagarwal/wonder/Mafia/src/quarantine/outbox.ts` | Transactional outbox: (a) write intent + reflog locally, (b) call Gmail, (c) write outcome + reflog. Reconcile-on-startup sweep for any rows stuck in `*-ing` states. | IO |
| `/Users/prernaagarwal/wonder/Mafia/src/quarantine/snapshot.ts` | Hybrid metadata-vs-blob logic: archive = headers + labels only; delete = headers + labels + gzipped RFC822 blob. Deduplicates via content-addressable id. | IO |
| `/Users/prernaagarwal/wonder/Mafia/src/quarantine/purger.ts` | Sweep job: `SELECT id FROM email_actions WHERE state='quarantined' AND purge_after <= now()` → transition to `purging` → upstream-confirm (delete already auto-purged by Gmail) → `purged` + drop `body_blob`. | IO |

`/Users/prernaagarwal/wonder/Mafia/src/db/index.ts` becomes a thin glue file that re-exports the new modules and keeps existing user/session/stats helpers.

## 4. Tool changes

### `/Users/prernaagarwal/wonder/Mafia/src/tools/act-on-email.ts`
- Replace `queueAction(...)` with `outbox.flag({ user_id, session_id, email_id, intent, rule_provenance })`.
- This INSERTs into `email_actions` with `state='flagged'` and writes a `flag` reflog entry.
- No upstream Gmail call yet.

### `/Users/prernaagarwal/wonder/Mafia/src/tools/commit-session.ts`
- Replace direct `executeActions(...)` + `commitSession(...)` flow with:
  1. Load all `email_actions` for session in `state='flagged'`.
  2. For each: snapshot (if delete intent) → transition to `quarantining` + reflog → call Gmail (`trash` or `batchModify`) → on success, transition to `quarantined` + reflog; on failure, transition to `failed` + reflog with error payload.
  3. `dry_run=true` short-circuits before the Gmail call but still validates state machine transitions.
- Aggregate session counters update against `state='quarantined'` (not "deleted") since nothing is irreversibly gone yet.

### New tool: `restore`
- Input: `{ action_id }` or `{ email_id, since_ts }`.
- Loads `email_actions` row; transitions `quarantined → restoring`; calls Gmail `untrash` (delete) or `batchModify` to re-add `INBOX` label (archive); on success transitions to `restored` + reflog; on failure → `failed`.
- For deletes past the 30-day window: deep-restore path = re-`messages.insert` from `body_blob`. Phase 4 surfaces this; Phase 0 stubs it as "not yet supported, file is preserved locally."

### New tool: `list_vault`
- Input: `{ session_id? , email_id? , since_ts?, limit }`.
- Returns rows from `email_actions` in `state IN ('quarantined','restored','purged')` joined with `email_snapshots` headers.
- Backs the user-facing "what did Mafia just do to my inbox" view required by PRD §3.2 / §5.4.

## 5. Test surface

| Category | What to test |
|---|---|
| State machine (pure) | Every legal transition; every illegal transition rejected; idempotent re-application. |
| Hash chain | Genesis row writes correctly; chain verification rejects tampering (mutate one `payload_json`, rebuild, expect mismatch); `entry_hash` collision impossible under normal sequences. |
| INSERT-only triggers | Direct `UPDATE reflog`, `DELETE FROM reflog` both raise. |
| Idempotence | Replay the same `flag` twice → second is a no-op. Replay a `commit` after partial failure → only un-actioned rows are retried. |
| Crash recovery | Kill process between local-write and Gmail call; restart triggers reconcile; rows in `quarantining` → reconciled to `quarantined` (if Gmail confirms) or `failed`. |
| Snapshot store | Content-addressable id is deterministic; archive snapshot has NULL `body_blob`; delete snapshot has gzipped blob; size accounting accurate. |
| Gmail mock integration | `act_on_email` → `commit_session` → `restore` round-trips on a mock client. |
| End-to-end (test account) | Real Gmail test account: archive 5, delete 5, restore 3 of each. Verify Gmail UI state matches reflog. |
| Purger | Rows past `purge_after` transition correctly; `body_blob` is dropped (or moved to cold tier per Phase 1). |

## 6. Rollout sequence (commits)

| # | Commit | Contents |
|---|---|---|
| 1 | `chore: remove accidentally committed Claude.dmg` | Pre-work 1.1. |
| 2 | `docs: ADR-0001 quarantine + reflog state machine` | The ADR (already in place). |
| 3 | `db: extract schema.sql; add migration runner` | New `src/db/schema.sql` + `migrations/001_quarantine_reflog.ts`. Adds the three tables, drops old `action_queue` rows, writes genesis reflog. |
| 4 | `quarantine: pure state machine module` | `state-machine.ts` + tests. Pure; no IO; mergeable independently. |
| 5 | `quarantine: append-only reflog with hash chain` | `reflog.ts` + verify-chain tests. |
| 6 | `quarantine: snapshot store with hybrid storage` | `snapshot.ts` + tests. |
| 7 | `quarantine: transactional outbox + reconcile` | `outbox.ts` + crash-recovery tests. |
| 8 | `quarantine: purger sweep job` | `purger.ts` + tests. |
| 9 | `tools: act_on_email writes through outbox` | Refactor `act-on-email.ts`. |
| 10 | `tools: commit_session uses state machine` | Refactor `commit-session.ts`. |
| 11 | `tools: add restore tool` | New tool, registered in `src/index.ts`. |
| 12 | `tools: add list_vault tool` | New tool, registered in `src/index.ts`. |
| 13 | `test: end-to-end on Gmail test account` | Integration test, gated behind env var. |

Commits 4–8 are independently mergeable in any order after #3. Commits 9–12 depend on 4–7. Commit 13 closes Phase 0.

## 7. Acceptance checklist

Phase 0 is done when **all** of the following hold:

- [ ] `Claude.dmg` is gone from the working tree and `.gitignore` blocks it.
- [ ] `act_on_email` writes a `flagged` row to `email_actions` and a `flag` entry to `reflog` — no Gmail call.
- [ ] `commit_session` advances each row through `flagged → quarantining → quarantined`, snapshots delete-intent emails to `email_snapshots`, and writes one reflog entry per transition.
- [ ] `restore` reverts both archive and delete actions within the 30-day window, transitions row to `restored`, and writes the reflog entry.
- [ ] `list_vault` returns a chronological view of every action with provenance.
- [ ] Reflog hash chain verifier passes against a fresh DB after a 100-action E2E run.
- [ ] Killing the process during `commit_session` and restarting reconciles cleanly: no row remains in `quarantining`/`restoring`/`purging` after reconcile completes.
- [ ] Direct `UPDATE` or `DELETE` on `reflog` raises `reflog is append-only`.
- [ ] Purger transitions `quarantined → purged` for rows past `purge_after`, drops `body_blob`, and writes the reflog entry.
- [ ] All seven ADR open questions have written answers (in this doc or a follow-up).
- [ ] Test account run: 10 actions queued, committed, 5 restored, 5 left to purge — Gmail UI state matches reflog state at every step.
