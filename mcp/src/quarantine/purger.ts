// 30-day purge sweep.
//
// Phase 0 behaviour: find email_actions in 'quarantined' state with
// purge_after <= now, and transition them to 'purged' (dropping any local
// body_blob along the way). Gmail does its own auto-purge of trash at 30d;
// we don't call upstream.
//
// Intended to be called periodically (e.g. on tool invocation, on startup,
// or on a timer).

import type Database from 'better-sqlite3';
import type { EmailAction } from './types.js';
import { purgeAction } from './outbox.js';

export interface PurgeResult {
  purged: EmailAction[];
}

export function runPurger(db: Database.Database, now: number = Math.floor(Date.now() / 1000)): PurgeResult {
  const due = db.prepare(`
    SELECT id FROM email_actions
    WHERE state = 'quarantined' AND purge_after IS NOT NULL AND purge_after <= ?
  `).all(now) as { id: string }[];

  const purged: EmailAction[] = [];
  for (const { id } of due) {
    purged.push(purgeAction(db, id));
  }
  return { purged };
}
