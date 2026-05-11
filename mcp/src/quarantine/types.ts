// Shared types for the quarantine + reflog state machine.
// Mirror the schema in src/db/migrations/001_quarantine_reflog.ts.

export type Intent = 'keep' | 'archive' | 'delete';

export type State =
  | 'flagged'
  | 'quarantining'
  | 'quarantined'
  | 'restoring'
  | 'kept'
  | 'restored'
  | 'purging'
  | 'purged'
  | 'failed';

export type Transition =
  | 'flag'
  | 'quarantine'
  | 'quarantine_complete'
  | 'restore'
  | 'restore_complete'
  | 'keep'
  | 'purge'
  | 'purge_complete'
  | 'fail'
  | 'genesis';

export interface EmailAction {
  id: string;
  user_id: string;
  session_id: string;
  email_id: string;
  thread_id: string | null;
  intent: Intent;
  state: State;
  state_changed_at: number;
  rule_provenance: string | null;
  upstream_status: string | null;
  snapshot_id: string | null;
  purge_after: number | null;
}

export interface ReflogEntry {
  seq: number;
  prev_hash: string;
  entry_hash: string;
  ts: number;
  user_id: string;
  action_id: string;
  transition: Transition;
  payload_json: string;
}

export interface EmailSnapshot {
  id: string;
  email_id: string;
  internal_date: number;
  headers_json: string;
  label_ids_json: string;
  body_blob: Buffer | null;
  body_size_bytes: number | null;
  created_at: number;
}

export const DEFAULT_PURGE_HORIZON_SECONDS = 30 * 24 * 60 * 60;
