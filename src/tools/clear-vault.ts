import { z } from 'zod';
import type Database from 'better-sqlite3';
import { getDb, getFirstUser } from '../db/index.js';
import { listVault, purgeAction } from '../quarantine/outbox.js';
import type { EmailAction } from '../quarantine/types.js';

export const clearVaultSchema = z.object({
  older_than_days: z.number().min(0).max(30).default(7).describe(
    'Only purge items that have been in the vault for more than this many days. 0 = clear all currently-quarantined items.',
  ),
  action_ids: z.array(z.string()).optional().describe(
    'Restrict the purge to specific action_ids (overrides the age filter).',
  ),
  confirm: z.boolean().default(false).describe(
    'Must be true to actually purge. Without confirm, returns a preview of what would be purged.',
  ),
});

export type ClearVaultInput = z.infer<typeof clearVaultSchema>;

/**
 * Core implementation — takes db + user_id directly so it's unit-testable
 * without the module-level getDb()/getFirstUser() singletons.
 */
export function runClearVault(
  db: Database.Database,
  user_id: string,
  input: ClearVaultInput,
  now: number = Math.floor(Date.now() / 1000),
) {
  const cutoff = now - input.older_than_days * 86400;

  const all = listVault(db, user_id, { limit: 5000 });
  const quarantined = all.filter(a => a.state === 'quarantined');

  const candidates = input.action_ids
    ? quarantined.filter(a => input.action_ids!.includes(a.id))
    : quarantined.filter(a => a.state_changed_at <= cutoff);

  if (!input.confirm) {
    return {
      preview: true,
      would_purge_count: candidates.length,
      candidates: candidates.map(a => ({
        action_id: a.id,
        email_id: a.email_id,
        intent: a.intent,
        vaulted_at: a.state_changed_at,
        days_in_vault: Math.floor((now - a.state_changed_at) / 86400),
      })),
      message: candidates.length === 0
        ? 'No items match — nothing to purge.'
        : `Would purge ${candidates.length} item(s) from local Vault. Re-run with confirm=true to apply. NOTE: purged items can no longer be restored via Mafia. Emails themselves remain in Gmail (trash for delete-intent, All Mail for archive-intent) until Gmail's own retention expires.`,
    };
  }

  const purged: EmailAction[] = [];
  const failed: { action_id: string; reason: string }[] = [];

  for (const a of candidates) {
    try {
      purged.push(purgeAction(db, a.id));
    } catch (err) {
      failed.push({
        action_id: a.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    success: failed.length === 0,
    purged_count: purged.length,
    failed_count: failed.length,
    purged: purged.map(a => ({
      action_id: a.id,
      email_id: a.email_id,
      intent: a.intent,
      purged_at: a.state_changed_at,
    })),
    failures: failed.length > 0 ? failed : undefined,
    message: purged.length > 0
      ? `Purged ${purged.length} item(s) from local Vault. Body snapshots dropped — these are no longer restorable from Mafia.`
      : 'No items purged.',
  };
}

export async function clearVaultTool(input: ClearVaultInput) {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };
  return runClearVault(getDb(), user.id, input);
}
