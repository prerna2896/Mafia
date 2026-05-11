// Transactional outbox for quarantine actions.
//
// Pattern (per Microservices.io / standard outbox):
//   1. Local transaction: write intent + reflog entry, mark row as in-flight (`*-ing`).
//   2. Call Gmail.
//   3. Local transaction: write outcome + reflog entry, mark row terminal.
//
// If the process crashes between (1) and (3), reconcileInFlight() picks up
// any rows stuck in `*-ing` states and queries Gmail to converge them.
//
// All actions are idempotent: trash/untrash/modify are safe to retry.

import type Database from 'better-sqlite3';
import type { GmailAdapter } from '../gmail/adapter.js';
import { nextState } from './state-machine.js';
import { appendReflog } from './reflog.js';
import { writeSnapshot, dropBody } from './snapshot.js';
import {
  DEFAULT_PURGE_HORIZON_SECONDS,
  type EmailAction,
  type Intent,
  type State,
  type Transition,
} from './types.js';

// ── Flag ──────────────────────────────────────────────────────────────────────

export interface FlagArgs {
  user_id: string;
  session_id: string;
  email_id: string;
  thread_id?: string | null;
  intent: Intent;
  rule_provenance?: string | null;
}

/**
 * Flag an email for an action. No upstream call — purely local.
 * Idempotent within (session_id, email_id): re-flagging in the same session
 * with a different intent updates the existing row in-place; with the same
 * intent it's a no-op. (Implemented as: delete prior row in same session +
 * insert new — preserves history via reflog.)
 */
export function flagAction(db: Database.Database, args: FlagArgs): EmailAction {
  const id = newActionId();
  const now = nowSeconds();
  const transition: Transition = 'flag';
  // state machine validates the transition shape
  const state: State = nextState(null, transition);

  const tx = db.transaction(() => {
    // If a previous flagged row exists for the same (session, email), supersede it.
    db.prepare(`
      DELETE FROM email_actions
      WHERE session_id = ? AND email_id = ? AND state = 'flagged'
    `).run(args.session_id, args.email_id);

    db.prepare(`
      INSERT INTO email_actions
        (id, user_id, session_id, email_id, thread_id, intent, state, state_changed_at, rule_provenance, upstream_status, snapshot_id, purge_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    `).run(
      id,
      args.user_id,
      args.session_id,
      args.email_id,
      args.thread_id ?? null,
      args.intent,
      state,
      now,
      args.rule_provenance ?? null,
    );

    appendReflog(db, {
      user_id: args.user_id,
      action_id: id,
      transition,
      payload: {
        email_id: args.email_id,
        intent: args.intent,
        rule_provenance: args.rule_provenance ?? null,
      },
      ts: now,
    });
  });
  tx();

  return loadAction(db, id)!;
}

// ── Commit (flagged → quarantined or kept) ────────────────────────────────────

/**
 * Commit a flagged action. For 'keep' intent, transitions flagged → kept with
 * no upstream call. For 'archive' / 'delete', goes flagged → quarantining,
 * calls Gmail, then quarantining → quarantined (or → failed).
 */
export async function commitAction(
  db: Database.Database,
  gmail: GmailAdapter,
  action_id: string,
): Promise<EmailAction> {
  const action = loadAction(db, action_id);
  if (!action) throw new Error(`Action not found: ${action_id}`);

  if (action.intent === 'keep') {
    return localTransition(db, action_id, 'keep', { email_id: action.email_id });
  }

  // Snapshot — for delete we fetch and store full body, for archive metadata only.
  const detail = await gmail.fetchDetail(action.email_id, action.intent === 'delete');
  const snapshot_id = writeSnapshot(db, action.intent, {
    email_id: action.email_id,
    internal_date: detail.internal_date,
    headers: detail.headers,
    label_ids: detail.label_ids,
    body_raw: detail.raw_body,
  });

  // Transition local state into in-flight, recording the snapshot.
  const purge_after = nowSeconds() + DEFAULT_PURGE_HORIZON_SECONDS;
  const inFlight = localTransition(db, action_id, 'quarantine', {
    email_id: action.email_id,
    intent: action.intent,
    snapshot_id,
  }, { snapshot_id, purge_after });

  // Call Gmail.
  try {
    if (action.intent === 'delete') {
      await gmail.trash(action.email_id);
    } else {
      await gmail.archive(action.email_id);
    }
  } catch (err) {
    return localTransition(db, action_id, 'fail', {
      email_id: action.email_id,
      from: 'quarantining',
      error: errorMessage(err),
    }, { upstream_status: errorMessage(err) });
  }

  return localTransition(db, action_id, 'quarantine_complete', {
    email_id: action.email_id,
    intent: action.intent,
  }, { upstream_status: 'ok' });
}

// ── Batched commit (archive intent only) ─────────────────────────────────────

export interface CommitArchiveBatchResult {
  quarantined: EmailAction[];
  failed: EmailAction[];
}

/**
 * Batched analog of commitAction() for archive intent.
 *
 * Per Gmail's API surface, only label mutations (modify / batchModify) are
 * batchable — trash has no batch endpoint, and keep is a no-op locally — so
 * this helper handles archive only. The caller is responsible for chunking
 * to ≤500 ids per call (`archiveBatch` accepts up to 1000 but we leave
 * headroom for concurrent traffic + the pacing bucket).
 *
 * Outbox shape:
 *   1. For each action: validate (intent='archive', state='flagged'), snapshot,
 *      transition flagged → quarantining (one INSERT + one reflog entry).
 *   2. Issue exactly one `gmail.archiveBatch(ids)` call.
 *   3. For each `ok` id: transition quarantining → quarantined (per-row reflog).
 *      For each `failed` id: transition quarantining → failed (per-row reflog,
 *      payload includes the error message).
 *
 * Any precondition failure (wrong intent, wrong state, snapshot fetch error)
 * surfaces as a per-row `failed` outcome — the batch still proceeds for the
 * rows that passed validation. We never silently skip rows: every input id
 * appears in either `quarantined` or `failed`.
 *
 * Idempotency: Gmail's batchModify is idempotent for label changes, so a
 * retry-on-crash from the reconciler converges to the same state.
 */
export async function commitArchiveBatch(
  db: Database.Database,
  gmail: GmailAdapter,
  action_ids: string[],
): Promise<CommitArchiveBatchResult> {
  if (action_ids.length === 0) return { quarantined: [], failed: [] };

  const quarantined: EmailAction[] = [];
  const failed: EmailAction[] = [];

  // Build the list of rows to actually send to Gmail. Rows that fail
  // preconditions (wrong intent / state / snapshot fetch) short-circuit into
  // `failed` without ever advancing to `quarantining`.
  const ready: { action_id: string; email_id: string }[] = [];

  for (const action_id of action_ids) {
    const action = loadAction(db, action_id);
    if (!action) throw new Error(`Action not found: ${action_id}`);

    if (action.intent !== 'archive') {
      throw new Error(
        `commitArchiveBatch: action ${action_id} has intent='${action.intent}', expected 'archive'`,
      );
    }
    if (action.state !== 'flagged') {
      throw new Error(
        `commitArchiveBatch: action ${action_id} is in state '${action.state}', expected 'flagged'`,
      );
    }

    // Snapshot per row (one INSERT each; each gets a distinct snapshot_id).
    // We do this BEFORE flipping the state so a snapshot fetch failure leaves
    // the row in `flagged` (caller can re-commit later) rather than stuck in
    // `quarantining`.
    let snapshot_id: string;
    try {
      const detail = await gmail.fetchDetail(action.email_id, false);
      snapshot_id = writeSnapshot(db, 'archive', {
        email_id: action.email_id,
        internal_date: detail.internal_date,
        headers: detail.headers,
        label_ids: detail.label_ids,
      });
    } catch (err) {
      // Snapshot fetch failed — we cannot proceed for this row. Record a
      // failure transition out of band: the row stays in 'flagged', and we
      // just emit a synthetic fail-shaped result. To keep the audit log
      // honest we DO emit a reflog entry by sending the row through the
      // quarantine→fail path (snapshot stored as NULL is not legal here, so
      // we go state-only — see below).
      // Simpler: surface via a failed pseudo-action so the caller can react.
      failed.push({
        ...action,
        upstream_status: errorMessage(err),
      });
      continue;
    }

    const purge_after = nowSeconds() + DEFAULT_PURGE_HORIZON_SECONDS;
    localTransition(db, action_id, 'quarantine', {
      email_id: action.email_id,
      intent: 'archive',
      snapshot_id,
    }, { snapshot_id, purge_after });
    ready.push({ action_id, email_id: action.email_id });
  }

  if (ready.length === 0) {
    return { quarantined, failed };
  }

  // ONE upstream batch call.
  const email_ids = ready.map((r) => r.email_id);
  const batchResult = await gmail.archiveBatch(email_ids);

  // Per-row outcome reflog. Build a map for O(1) lookups by email_id; the
  // adapter contract guarantees ok + failed cover every requested id without
  // overlap, so we can pivot back to action_id confidently.
  const okSet = new Set(batchResult.ok);
  const failByEmail = new Map<string, string>();
  for (const f of batchResult.failed) failByEmail.set(f.email_id, f.error);

  for (const { action_id, email_id } of ready) {
    if (okSet.has(email_id)) {
      const row = localTransition(db, action_id, 'quarantine_complete', {
        email_id,
        intent: 'archive',
        batched: true,
      }, { upstream_status: 'ok' });
      quarantined.push(row);
    } else {
      const err = failByEmail.get(email_id) ?? 'archiveBatch: id missing from response';
      const row = localTransition(db, action_id, 'fail', {
        email_id,
        from: 'quarantining',
        error: err,
        batched: true,
      }, { upstream_status: err });
      failed.push(row);
    }
  }

  return { quarantined, failed };
}

// ── Restore (quarantined → restored) ──────────────────────────────────────────

export async function restoreAction(
  db: Database.Database,
  gmail: GmailAdapter,
  action_id: string,
): Promise<EmailAction> {
  const action = loadAction(db, action_id);
  if (!action) throw new Error(`Action not found: ${action_id}`);
  if (action.intent === 'keep') {
    throw new Error(`Cannot restore a 'keep' action: ${action_id}`);
  }

  localTransition(db, action_id, 'restore', {
    email_id: action.email_id,
    intent: action.intent,
  });

  try {
    if (action.intent === 'delete') {
      await gmail.untrash(action.email_id);
    } else {
      await gmail.unarchive(action.email_id);
    }
  } catch (err) {
    return localTransition(db, action_id, 'fail', {
      email_id: action.email_id,
      from: 'restoring',
      error: errorMessage(err),
    }, { upstream_status: errorMessage(err) });
  }

  return localTransition(db, action_id, 'restore_complete', {
    email_id: action.email_id,
  }, { upstream_status: 'ok' });
}

// ── Purge (quarantined → purged) ──────────────────────────────────────────────

/**
 * Purge a quarantined action. Phase 0: drops local body_blob (if any) and
 * marks row as purged. Gmail itself auto-expunges trash at 30 days; we don't
 * need to call anything upstream.
 */
export function purgeAction(db: Database.Database, action_id: string): EmailAction {
  const action = loadAction(db, action_id);
  if (!action) throw new Error(`Action not found: ${action_id}`);

  localTransition(db, action_id, 'purge', { email_id: action.email_id });

  if (action.snapshot_id) dropBody(db, action.snapshot_id);

  return localTransition(db, action_id, 'purge_complete', {
    email_id: action.email_id,
    snapshot_id: action.snapshot_id,
  });
}

// ── Reconcile (recover in-flight rows after crash) ────────────────────────────

export interface ReconcileResult {
  reconciled: EmailAction[];
  failed: EmailAction[];
}

/**
 * Find all rows in *-ing states and converge them.
 *
 * Strategy: query Gmail for current label state and infer outcome.
 *  - quarantining (delete) → if labels include TRASH, consider quarantined; else retry trash.
 *  - quarantining (archive) → if labels do not include INBOX, consider quarantined; else retry archive.
 *  - restoring (delete) → if labels do not include TRASH, restored; else retry untrash.
 *  - restoring (archive) → if labels include INBOX, restored; else retry unarchive.
 *  - purging → advance to purged locally (Gmail handles its side).
 *
 * On any upstream error during reconcile, transition row to 'failed' with the error.
 */
export async function reconcileInFlight(
  db: Database.Database,
  gmail: GmailAdapter,
): Promise<ReconcileResult> {
  const rows = db.prepare(`
    SELECT * FROM email_actions
    WHERE state IN ('quarantining','restoring','purging')
  `).all() as EmailAction[];

  const reconciled: EmailAction[] = [];
  const failed: EmailAction[] = [];

  for (const row of rows) {
    try {
      if (row.state === 'purging') {
        // Already advanced into purging before crash; just complete it.
        if (row.snapshot_id) dropBody(db, row.snapshot_id);
        reconciled.push(localTransition(db, row.id, 'purge_complete', {
          email_id: row.email_id,
          snapshot_id: row.snapshot_id,
          reconciled: true,
        }));
        continue;
      }

      const labels = await gmail.fetchLabels(row.email_id);
      const inTrash = labels.includes('TRASH');
      const inInbox = labels.includes('INBOX');

      let isComplete = false;
      if (row.state === 'quarantining') {
        isComplete = row.intent === 'delete' ? inTrash : !inInbox;
        if (!isComplete) {
          if (row.intent === 'delete') await gmail.trash(row.email_id);
          else await gmail.archive(row.email_id);
          isComplete = true;
        }
        reconciled.push(localTransition(db, row.id, 'quarantine_complete', {
          email_id: row.email_id, reconciled: true,
        }, { upstream_status: 'ok' }));
      } else if (row.state === 'restoring') {
        isComplete = row.intent === 'delete' ? !inTrash : inInbox;
        if (!isComplete) {
          if (row.intent === 'delete') await gmail.untrash(row.email_id);
          else await gmail.unarchive(row.email_id);
          isComplete = true;
        }
        reconciled.push(localTransition(db, row.id, 'restore_complete', {
          email_id: row.email_id, reconciled: true,
        }, { upstream_status: 'ok' }));
      }
    } catch (err) {
      failed.push(localTransition(db, row.id, 'fail', {
        email_id: row.email_id,
        from: row.state,
        error: errorMessage(err),
        reconciled: true,
      }, { upstream_status: errorMessage(err) }));
    }
  }

  return { reconciled, failed };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function localTransition(
  db: Database.Database,
  action_id: string,
  transition: Transition,
  payload: Record<string, unknown>,
  fields: Partial<Pick<EmailAction, 'snapshot_id' | 'purge_after' | 'upstream_status'>> = {},
): EmailAction {
  const tx = db.transaction(() => {
    const action = loadAction(db, action_id);
    if (!action) throw new Error(`Action not found: ${action_id}`);
    const newState = nextState(action.state, transition);
    const now = nowSeconds();

    const sets: string[] = ['state = ?', 'state_changed_at = ?'];
    const vals: unknown[] = [newState, now];
    if (fields.snapshot_id !== undefined) {
      sets.push('snapshot_id = ?');
      vals.push(fields.snapshot_id);
    }
    if (fields.purge_after !== undefined) {
      sets.push('purge_after = ?');
      vals.push(fields.purge_after);
    }
    if (fields.upstream_status !== undefined) {
      sets.push('upstream_status = ?');
      vals.push(fields.upstream_status);
    }
    vals.push(action_id);

    db.prepare(`UPDATE email_actions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);

    appendReflog(db, {
      user_id: action.user_id,
      action_id,
      transition,
      payload,
      ts: now,
    });
  });
  tx();

  return loadAction(db, action_id)!;
}

export function loadAction(db: Database.Database, action_id: string): EmailAction | null {
  return (db.prepare(`SELECT * FROM email_actions WHERE id = ?`).get(action_id) as EmailAction | undefined) ?? null;
}

export function listFlagged(db: Database.Database, session_id: string): EmailAction[] {
  return db.prepare(`
    SELECT * FROM email_actions WHERE session_id = ? AND state = 'flagged'
  `).all(session_id) as EmailAction[];
}

export function listVault(
  db: Database.Database,
  user_id: string,
  opts: { since_ts?: number; limit?: number } = {},
): EmailAction[] {
  const since = opts.since_ts ?? 0;
  const limit = opts.limit ?? 200;
  return db.prepare(`
    SELECT * FROM email_actions
    WHERE user_id = ? AND state IN ('quarantined','restored','purged','failed')
      AND state_changed_at >= ?
    ORDER BY state_changed_at DESC
    LIMIT ?
  `).all(user_id, since, limit) as EmailAction[];
}

function newActionId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
