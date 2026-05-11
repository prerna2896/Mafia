import { z } from 'zod';
import { getStats, getFirstUser, getDb } from '../db/index.js';
import { getActiveSession } from './act-on-email.js';
import { listFlagged } from '../quarantine/outbox.js';

export const getSessionStatsSchema = z.object({});

export async function getSessionStatsTool() {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };

  const db = getDb();
  const stats = getStats(user.id);
  const activeSessionId = getActiveSession(user.id);
  const pending = activeSessionId ? listFlagged(db, activeSessionId) : [];

  // Investment metrics — what the user has accumulated with Mafia.
  // Per PRD §5.5: cumulative reflog as portfolio, not streaks.
  const lifetime = lifetimeMetrics(db, user.id);
  const session = activeSessionId ? sessionPreview(pending) : null;

  return {
    user: user.email,
    investment: {
      total_vaulted: lifetime.totalVaulted,
      total_restored: lifetime.totalRestored,
      total_purged: lifetime.totalPurged,
      restore_rate_pct: lifetime.restoreRatePct,
      reflog_entries: lifetime.reflogEntries,
      first_action_ts: lifetime.firstActionTs,
    },
    rolling: {
      junkScore: stats?.junk_score ?? 0,
      totalSessions: stats?.total_sessions ?? 0,
      lastSession: stats?.last_session_date ?? 'never',
    },
    current_session: session,
  };
}

function lifetimeMetrics(db: ReturnType<typeof getDb>, userId: string) {
  const totalVaulted = (db.prepare(`
    SELECT COUNT(*) as n FROM email_actions WHERE user_id = ? AND state IN ('quarantined','restored','purged')
  `).get(userId) as { n: number }).n;

  const totalRestored = (db.prepare(`
    SELECT COUNT(*) as n FROM email_actions WHERE user_id = ? AND state = 'restored'
  `).get(userId) as { n: number }).n;

  const totalPurged = (db.prepare(`
    SELECT COUNT(*) as n FROM email_actions WHERE user_id = ? AND state = 'purged'
  `).get(userId) as { n: number }).n;

  const reflogEntries = (db.prepare(`
    SELECT COUNT(*) as n FROM reflog WHERE user_id = ? AND transition != 'genesis'
  `).get(userId) as { n: number }).n;

  const firstAction = db.prepare(`
    SELECT MIN(state_changed_at) as ts FROM email_actions WHERE user_id = ?
  `).get(userId) as { ts: number | null };

  // Restore rate is a *calibration* signal — high rate means the AI/rules are too aggressive.
  const restoreRatePct = totalVaulted > 0
    ? Math.round((totalRestored / totalVaulted) * 1000) / 10
    : 0;

  return {
    totalVaulted,
    totalRestored,
    totalPurged,
    restoreRatePct,
    reflogEntries,
    firstActionTs: firstAction.ts,
  };
}

function sessionPreview(pending: { intent: string; email_id: string }[]) {
  return {
    pending_total: pending.length,
    pending_keep: pending.filter(a => a.intent === 'keep').length,
    pending_archive: pending.filter(a => a.intent === 'archive').length,
    pending_delete: pending.filter(a => a.intent === 'delete').length,
  };
}
