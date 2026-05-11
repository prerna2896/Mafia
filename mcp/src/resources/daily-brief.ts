// daily_brief MCP resource.
//
// Phase 0 retention loop (PRD §9): "A `daily_brief` MCP resource Claude can
// pull into morning prompts — 'here's what Mafia found overnight'." Without
// it V0 has no retention surface; the user has no reason to come back unless
// re-prompted by something outside Mafia.
//
// Returns a single text/markdown blob. Sections that have no signal are
// omitted — empty sections would add noise, not value.

import type Database from 'better-sqlite3';
import { getDb, getFirstUser } from '../db/index.js';
import { listFlagged } from '../quarantine/outbox.js';
import { getActiveSession } from '../tools/act-on-email.js';
import { topSenders } from '../gmail/client.js';

export interface DailyBriefInputs {
  /** Override for tests; defaults to new Date(). */
  now?: Date;
  /**
   * Optional injection point for the topSenders call. If omitted, the resource
   * calls the real `topSenders()` against Gmail; when called inside tests this
   * lets us avoid mocking googleapis end-to-end.
   */
  topSendersFn?: typeof topSenders;
}

/**
 * Lifetime investment metrics. Mirrors the SQL pattern in
 * `tools/get-stats.ts#lifetimeMetrics` — kept in-sync intentionally. If the
 * fields ever diverge, update both. (Re-implemented here instead of imported
 * so this resource doesn't depend on the tool's response shape.)
 */
function investmentMetrics(db: Database.Database, userId: string) {
  const totalVaulted = (db.prepare(`
    SELECT COUNT(*) as n FROM email_actions
    WHERE user_id = ? AND state IN ('quarantined','restored','purged')
  `).get(userId) as { n: number }).n;
  const totalRestored = (db.prepare(`
    SELECT COUNT(*) as n FROM email_actions WHERE user_id = ? AND state = 'restored'
  `).get(userId) as { n: number }).n;
  const totalPurged = (db.prepare(`
    SELECT COUNT(*) as n FROM email_actions WHERE user_id = ? AND state = 'purged'
  `).get(userId) as { n: number }).n;
  const restoreRatePct = totalVaulted > 0
    ? Math.round((totalRestored / totalVaulted) * 1000) / 10
    : 0;
  return { totalVaulted, totalRestored, totalPurged, restoreRatePct };
}

/**
 * Find vault items whose purge_after lands within `horizonDays`. Used to
 * surface "things about to disappear" — gentle nudge, not an alarm.
 */
function expiringVaultItems(
  db: Database.Database,
  userId: string,
  nowSeconds: number,
  horizonDays: number,
) {
  const cutoff = nowSeconds + horizonDays * 86400;
  return db.prepare(`
    SELECT MIN(purge_after) as earliest, COUNT(*) as n
    FROM email_actions
    WHERE user_id = ? AND state = 'quarantined' AND purge_after IS NOT NULL AND purge_after <= ?
  `).get(userId, cutoff) as { earliest: number | null; n: number };
}

/**
 * Build the brief from a DB + (real or injected) Gmail surface. Pure function
 * over its inputs — tests can pass an in-memory DB plus a stub topSendersFn.
 */
export async function runDailyBrief(
  db: Database.Database,
  userId: string,
  inputs: DailyBriefInputs = {},
): Promise<string> {
  const now = inputs.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const isoDate = now.toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`# Mafia daily brief — ${isoDate}`, '');

  // ── Pending in this session ─────────────────────────────────────────────
  const activeSessionId = getActiveSession(userId);
  const pending = activeSessionId ? listFlagged(db, activeSessionId) : [];
  lines.push('## Pending in this session');
  if (pending.length === 0) {
    lines.push('Nothing flagged.');
  } else {
    const counts = { keep: 0, archive: 0, delete: 0 } as Record<string, number>;
    for (const p of pending) counts[p.intent] = (counts[p.intent] ?? 0) + 1;
    const parts: string[] = [];
    if (counts.delete) parts.push(`${counts.delete} delete`);
    if (counts.archive) parts.push(`${counts.archive} archive`);
    if (counts.keep) parts.push(`${counts.keep} keep`);
    lines.push(`${pending.length} flagged but uncommitted (${parts.join(', ')}). Call commit_session to apply.`);
  }
  lines.push('');

  // ── Vault expirations (next 3 days) ─────────────────────────────────────
  const expiring = expiringVaultItems(db, userId, nowSeconds, 3);
  lines.push('## Vault expirations');
  if (expiring.n === 0) {
    // Distinguish empty vault from "vault has items but none expiring soon"
    // by checking total quarantined count.
    const stillVaulted = (db.prepare(`
      SELECT COUNT(*) as n FROM email_actions WHERE user_id = ? AND state = 'quarantined'
    `).get(userId) as { n: number }).n;
    lines.push(stillVaulted === 0
      ? 'Vault is empty.'
      : `${stillVaulted} item(s) in vault, none expiring in the next 3 days.`);
  } else {
    const earliestDays = expiring.earliest !== null
      ? Math.max(0, Math.floor((expiring.earliest - nowSeconds) / 86400))
      : 0;
    lines.push(`${expiring.n} item(s) will purge in the next 3 days (earliest in ${earliestDays} day${earliestDays === 1 ? '' : 's'}). Use list_vault + restore to keep anything you want back.`);
  }
  lines.push('');

  // ── Top sender (last 7 days) ────────────────────────────────────────────
  const topFn = inputs.topSendersFn ?? topSenders;
  try {
    const result = await topFn(userId, { sampleSize: 200, maxAgeDays: 7, topN: 1 });
    if (result.topSenders.length > 0 && result.totalScanned > 0) {
      const top = result.topSenders[0];
      lines.push('## Top sender (last 7 days)');
      lines.push(
        `${top.count} from \`${top.fromEmail}\` — ${top.percentOfScanned}% of ${result.totalScanned} scanned. ` +
        `Call top_senders for the full breakdown.`,
      );
      lines.push('');
    }
  } catch {
    // Gmail unauthed / network / quota — skip section silently. The brief is
    // a "nice to have", not a hard failure surface.
  }

  // ── Investment ──────────────────────────────────────────────────────────
  const inv = investmentMetrics(db, userId);
  lines.push('## Investment');
  if (inv.totalVaulted === 0) {
    lines.push('No actions yet — try `fetch_emails` to start.');
  } else {
    lines.push(
      `You've vaulted ${inv.totalVaulted} · restored ${inv.totalRestored} · restore rate ${inv.restoreRatePct}%.` +
      (inv.totalPurged > 0 ? ` (${inv.totalPurged} purged.)` : ''),
    );
  }
  lines.push('');

  lines.push('---');
  lines.push('*Tip: ask me to "show top senders" or "fetch emails for triage" to act on this.*');

  return lines.join('\n');
}

/**
 * MCP resource read handler. Surfaces auth state in-band — never throws.
 */
export async function dailyBriefHandler(uri: URL) {
  const user = getFirstUser();
  if (!user) {
    return {
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: '# Mafia daily brief\n\nMafia is not authenticated. Run `npm run auth` in the Mafia repo to connect Gmail.',
      }],
    };
  }

  let text: string;
  try {
    text = await runDailyBrief(getDb(), user.id);
  } catch (err) {
    text = `# Mafia daily brief\n\nFailed to build brief: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    contents: [{
      uri: uri.href,
      mimeType: 'text/markdown',
      text,
    }],
  };
}

export const DAILY_BRIEF_URI = 'mafia://daily-brief';
