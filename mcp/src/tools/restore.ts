import { z } from 'zod';
import { getDb, getFirstUser } from '../db/index.js';
import { makeGmailAdapter } from '../gmail/adapter.js';
import { restoreAction, loadAction } from '../quarantine/outbox.js';
import type { EmailAction } from '../quarantine/types.js';

export const restoreSchema = z.object({
  action_id: z.string().optional().describe('Action ID to restore (preferred — unambiguous).'),
  email_id: z.string().optional().describe(
    'Gmail message ID to restore. If multiple actions exist for this email, restores the most recent quarantined one.',
  ),
  batch_action_ids: z.array(z.string()).optional().describe('Restore multiple actions at once.'),
});

export type RestoreInput = z.infer<typeof restoreSchema>;

export async function restoreTool(input: RestoreInput) {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };

  if (!input.action_id && !input.email_id && !input.batch_action_ids) {
    return { error: 'Provide one of: action_id, email_id, or batch_action_ids.' };
  }

  const db = getDb();
  const gmail = makeGmailAdapter(user.id);

  // Build the list of action_ids to operate on.
  const ids: string[] = [];
  if (input.batch_action_ids) ids.push(...input.batch_action_ids);
  if (input.action_id) ids.push(input.action_id);
  if (input.email_id) {
    const row = db.prepare(`
      SELECT id FROM email_actions
      WHERE user_id = ? AND email_id = ? AND state = 'quarantined'
      ORDER BY state_changed_at DESC LIMIT 1
    `).get(user.id, input.email_id) as { id: string } | undefined;
    if (!row) {
      return { error: `No quarantined action found for email ${input.email_id}.` };
    }
    ids.push(row.id);
  }

  const restored: EmailAction[] = [];
  const failed: { action_id: string; reason: string }[] = [];

  for (const id of ids) {
    const before = loadAction(db, id);
    if (!before) {
      failed.push({ action_id: id, reason: 'not found' });
      continue;
    }
    if (before.state !== 'quarantined') {
      failed.push({ action_id: id, reason: `state is ${before.state}, expected quarantined` });
      continue;
    }
    try {
      const result = await restoreAction(db, gmail, id);
      if (result.state === 'restored') restored.push(result);
      else failed.push({ action_id: id, reason: result.upstream_status ?? 'unknown failure' });
    } catch (err) {
      failed.push({ action_id: id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    success: failed.length === 0,
    restored_count: restored.length,
    failed_count: failed.length,
    restored: restored.map(a => ({
      action_id: a.id,
      email_id: a.email_id,
      intent: a.intent,
      restored_at: a.state_changed_at,
    })),
    failures: failed.length > 0 ? failed : undefined,
    message: restored.length > 0
      ? `Restored ${restored.length} item(s) from Vault back to inbox.`
      : 'No items restored.',
  };
}
