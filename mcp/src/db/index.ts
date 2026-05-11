import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import { migrate001 } from './migrations/001_quarantine_reflog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '../../data/mafia.db');

let _db: Database.Database | null = null;
let _dbPath = DEFAULT_DB_PATH;

export function setDbPath(p: string) {
  if (_db) {
    _db.close();
    _db = null;
  }
  _dbPath = p;
}

export function getDb(): Database.Database {
  if (!_db) {
    if (_dbPath !== ':memory:') {
      mkdirSync(path.dirname(_dbPath), { recursive: true });
    }
    _db = new Database(_dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('synchronous = NORMAL');
    _db.pragma('foreign_keys = ON');
    // Default WAL behavior lets the journal grow unbounded between commits;
    // we've observed 3 MB WAL against a 128 KB DB. 1000 pages × default page
    // size (~4 KB) gives a ~4 MB checkpoint threshold — enough to amortize
    // commits, small enough to keep the WAL bounded.
    _db.pragma('wal_autocheckpoint = 1000');
    migrate(_db);
    migrate001(_db);
  }
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expiry INTEGER,
      user_tier TEXT DEFAULT 'free',
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      started_at INTEGER DEFAULT (unixepoch()),
      committed_at INTEGER,
      emails_kept INTEGER DEFAULT 0,
      emails_deleted INTEGER DEFAULT 0,
      emails_archived INTEGER DEFAULT 0,
      duration_seconds INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS action_queue (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      email_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('keep','delete','archive')),
      created_at INTEGER DEFAULT (unixepoch()),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS user_stats (
      user_id TEXT PRIMARY KEY,
      junk_score INTEGER DEFAULT 0,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_session_date TEXT,
      total_sessions INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_badges (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      earned_at INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, badge_id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      cleanup_frequency TEXT DEFAULT 'balanced',
      preferred_labels TEXT DEFAULT '["CATEGORY_PROMOTIONS","CATEGORY_SOCIAL"]',
      voice_enabled INTEGER DEFAULT 0,
      session_length TEXT DEFAULT 'medium',
      min_gap_minutes INTEGER DEFAULT 30,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// ── User helpers ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: number | null;
}

export function upsertUser(user: Omit<User, 'id'> & { id?: string }): User {
  const db = getDb();
  const id = user.id ?? user.email;
  db.prepare(`
    INSERT INTO users (id, email, name, access_token, refresh_token, token_expiry)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expiry = excluded.token_expiry
  `).run(id, user.email, user.name, user.access_token, user.refresh_token, user.token_expiry);

  // Ensure stats + preferences rows exist
  db.prepare(`INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)`).run(id);
  db.prepare(`INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)`).run(id);

  return getUser(id)!;
}

export function getUser(id: string): User | null {
  return getDb().prepare(`SELECT * FROM users WHERE id = ? OR email = ?`).get(id, id) as User | null;
}

export function getFirstUser(): User | null {
  return getDb().prepare(`SELECT * FROM users LIMIT 1`).get() as User | null;
}

export function updateTokens(userId: string, accessToken: string, expiry: number) {
  getDb().prepare(`
    UPDATE users SET access_token = ?, token_expiry = ? WHERE id = ?
  `).run(accessToken, expiry, userId);
}

// ── Session helpers ───────────────────────────────────────────────────────────

export function createSession(userId: string): string {
  const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  getDb().prepare(`INSERT INTO sessions (id, user_id) VALUES (?, ?)`).run(id, userId);
  return id;
}

export function getSession(sessionId: string) {
  return getDb().prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
}

export function queueAction(sessionId: string, emailId: string, action: 'keep' | 'delete' | 'archive') {
  const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Remove any existing action for this email in this session first
  getDb().prepare(`DELETE FROM action_queue WHERE session_id = ? AND email_id = ?`).run(sessionId, emailId);
  getDb().prepare(`INSERT INTO action_queue (id, session_id, email_id, action) VALUES (?, ?, ?, ?)`)
    .run(id, sessionId, emailId, action);
}

export function getQueuedActions(sessionId: string) {
  return getDb().prepare(`SELECT * FROM action_queue WHERE session_id = ?`).all(sessionId) as
    { id: string; session_id: string; email_id: string; action: string }[];
}

export function commitSession(sessionId: string, stats: { kept: number; deleted: number; archived: number; duration: number }) {
  const db = getDb();
  db.prepare(`
    UPDATE sessions SET
      committed_at = unixepoch(),
      emails_kept = ?,
      emails_deleted = ?,
      emails_archived = ?,
      duration_seconds = ?
    WHERE id = ?
  `).run(stats.kept, stats.deleted, stats.archived, stats.duration, sessionId);

  // Clear the queue
  db.prepare(`DELETE FROM action_queue WHERE session_id = ?`).run(sessionId);
}

// ── Stats helpers ─────────────────────────────────────────────────────────────

export function getStats(userId: string) {
  return getDb().prepare(`SELECT * FROM user_stats WHERE user_id = ?`).get(userId) as {
    junk_score: number;
    current_streak: number;
    longest_streak: number;
    last_session_date: string | null;
    total_sessions: number;
  } | null;
}

export function updateStats(userId: string, deleted: number, archived: number) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const stats = getStats(userId);

  let newStreak = 1;
  if (stats?.last_session_date) {
    const last = new Date(stats.last_session_date);
    const diffDays = Math.floor((Date.now() - last.getTime()) / 86400000);
    if (diffDays <= 7) newStreak = (stats.current_streak || 0) + 1;
  }

  db.prepare(`
    UPDATE user_stats SET
      junk_score = junk_score + ?,
      current_streak = ?,
      longest_streak = MAX(longest_streak, ?),
      last_session_date = ?,
      total_sessions = total_sessions + 1
    WHERE user_id = ?
  `).run(deleted + archived, newStreak, newStreak, today, userId);
}

// ── Preferences helpers ───────────────────────────────────────────────────────

export function getPreferences(userId: string) {
  return getDb().prepare(`SELECT * FROM user_preferences WHERE user_id = ?`).get(userId) as {
    cleanup_frequency: string;
    preferred_labels: string;
    voice_enabled: number;
    session_length: string;
    min_gap_minutes: number;
  } | null;
}

export function updatePreferences(userId: string, prefs: Record<string, unknown>) {
  const fields = Object.keys(prefs).map(k => `${k} = ?`).join(', ');
  const values = Object.values(prefs);
  getDb().prepare(`UPDATE user_preferences SET ${fields} WHERE user_id = ?`).run(...values, userId);
}
