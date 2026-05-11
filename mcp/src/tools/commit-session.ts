import { z } from 'zod';
import { getSession, getFirstUser, getDb, updateStats } from '../db/index.js';
import { makeGmailAdapter } from '../gmail/adapter.js';
import { commitAction, listFlagged, reconcileInFlight } from '../quarantine/outbox.js';
import { runPurger } from '../quarantine/purger.js';
import { getActiveSession } from './act-on-email.js';
import type { EmailAction } from '../quarantine/types.js';

export const commitSessionSchema = z.object({
  session_id: z.string().optional()
    .describe('Session ID to commit. If omitted, uses the active session.'),
  dry_run: z.boolean().default(false)
    .describe('If true, validates state machine + reports what would happen, without calling Gmail.'),
});

export type CommitSessionInput = z.infer<typeof commitSessionSchema>;

export async function commitSessionTool(input: CommitSessionInput) {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };

  const sessionId = input.session_id ?? getActiveSession(user.id);
  if (!sessionId) return { error: 'No active session. Use fetch_emails and act_on_email first.' };

  const session = getSession(sessionId);
  if (!session) return { error: `Session ${sessionId} not found.` };

  const db = getDb();
  const flagged = listFlagged(db, sessionId);
  if (flagged.length === 0) {
    return { message: 'No flagged actions in this session.', session_id: sessionId };
  }

  const summary = countByIntent(flagged);

  if (input.dry_run) {
    return {
      dry_run: true,
      session_id: sessionId,
      summary: {
        would_keep: summary.keep,
        would_archive_to_vault: summary.archive,
        would_move_to_vault: summary.delete,
        total: flagged.length,
      },
      message: 'Dry run complete. Call commit_session without dry_run=true to apply.',
    };
  }

  // Reconcile any leftover in-flight rows from prior crashes before adding new work.
  const gmail = makeGmailAdapter(user.id);
  const reconciled = await reconcileInFlight(db, gmail);

  const startTime = Date.now();
  const results: { kept: EmailAction[]; quarantined: EmailAction[]; failed: EmailAction[] } = {
    kept: [],
    quarantined: [],
    failed: [],
  };

  for (const action of flagged) {
    try {
      const result = await commitAction(db, gmail, action.id);
      if (result.state === 'kept') results.kept.push(result);
      else if (result.state === 'quarantined') results.quarantined.push(result);
      else if (result.state === 'failed') results.failed.push(result);
    } catch (err) {
      results.failed.push(action);
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);

  // Investment metric: count items moved to vault. Total kept doesn't credit
  // toward "junk score" (PRD §5.5: investment + variable reward, not streaks).
  const vaultCount = results.quarantined.length;
  updateStats(user.id, vaultCount, 0);

  // Opportunistically run the purger so 30d-old items move to purged.
  const purged = runPurger(db);

  return {
    success: true,
    session_id: sessionId,
    summary: {
      kept: results.kept.length,
      vaulted_archive: results.quarantined.filter(a => a.intent === 'archive').length,
      vaulted_delete: results.quarantined.filter(a => a.intent === 'delete').length,
      failed: results.failed.length,
      total: flagged.length,
      duration_seconds: duration,
    },
    reconciled_pre_commit: {
      reconciled: reconciled.reconciled.length,
      failed: reconciled.failed.length,
    },
    purged_in_sweep: purged.purged.length,
    message: vaultedMessage(results.quarantined.length, results.kept.length, results.failed.length),
    failures: results.failed.length > 0
      ? results.failed.map(a => ({ action_id: a.id, email_id: a.email_id, upstream_status: a.upstream_status }))
      : undefined,
  };
}

function countByIntent(actions: EmailAction[]): Record<'keep' | 'archive' | 'delete', number> {
  const out = { keep: 0, archive: 0, delete: 0 };
  for (const a of actions) out[a.intent]++;
  return out;
}

function vaultedMessage(vaulted: number, kept: number, failed: number): string {
  const parts: string[] = [];
  if (vaulted > 0) parts.push(`Moved ${vaulted} to Vault — recoverable for 30 days. Use restore to bring any back.`);
  if (kept > 0) parts.push(`Kept ${kept} in inbox.`);
  if (failed > 0) parts.push(`${failed} failed — see failures list.`);
  return parts.join(' ') || 'Session committed with no changes.';
}
