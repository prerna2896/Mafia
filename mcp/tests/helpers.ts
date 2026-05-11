import Database from 'better-sqlite3';
import { migrate001 } from '../src/db/migrations/001_quarantine_reflog.js';
import { MockGmailAdapter } from '../src/testing/mock-gmail.js';

export { MockGmailAdapter };

/**
 * In-memory SQLite DB with the quarantine schema applied. One per test.
 * Returns a function that closes it.
 */
export function makeTestDb(): { db: Database.Database; close: () => void } {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  migrate001(db);
  return { db, close: () => db.close() };
}
