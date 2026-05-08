import { z } from 'zod';
import { getDb, getFirstUser } from '../db/index.js';
import { listVault } from '../quarantine/outbox.js';
import { readSnapshot } from '../quarantine/snapshot.js';
import { DEFAULT_PURGE_HORIZON_SECONDS } from '../quarantine/types.js';

export const listVaultSchema = z.object({
  since_days: z.number().min(1).max(365).default(30)
    .describe('How far back to look (default 30 days — covers all currently-quarantined items).'),
  limit: z.number().min(1).max(500).default(100).describe('Max results.'),
  state: z.enum(['quarantined', 'restored', 'purged', 'failed', 'any']).default('quarantined')
    .describe('Filter by state. "quarantined" = still in vault, "restored" = pulled back, "purged" = past 30d, "any" = all.'),
});

export type ListVaultInput = z.infer<typeof listVaultSchema>;

export async function listVaultTool(input: ListVaultInput) {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };

  const db = getDb();
  const sinceTs = Math.floor(Date.now() / 1000) - input.since_days * 86400;
  const all = listVault(db, user.id, { since_ts: sinceTs, limit: input.limit });

  const filtered = input.state === 'any' ? all : all.filter(a => a.state === input.state);

  const items = filtered.map(a => {
    const snapshot = a.snapshot_id ? readSnapshot(db, a.snapshot_id) : null;
    const headers = snapshot ? JSON.parse(snapshot.headers_json) as Record<string, string> : {};

    const purgeAfterSec = a.purge_after ?? null;
    const daysUntilPurge = purgeAfterSec
      ? Math.max(0, Math.ceil((purgeAfterSec - Date.now() / 1000) / 86400))
      : null;

    return {
      action_id: a.id,
      email_id: a.email_id,
      intent: a.intent,
      state: a.state,
      from: headers.From ?? '(unknown sender)',
      subject: headers.Subject ?? '(no subject)',
      vaulted_at: a.state_changed_at,
      purge_after: purgeAfterSec,
      days_until_purge: daysUntilPurge,
      rule_provenance: a.rule_provenance,
      body_recoverable: snapshot?.body_blob != null,
    };
  });

  // Aggregate stats so the caller (and the user) sees the vault as a *place*.
  const counts = {
    quarantined: all.filter(a => a.state === 'quarantined').length,
    restored: all.filter(a => a.state === 'restored').length,
    purged: all.filter(a => a.state === 'purged').length,
    failed: all.filter(a => a.state === 'failed').length,
  };

  const oldestPurge = all
    .filter(a => a.state === 'quarantined' && a.purge_after)
    .map(a => a.purge_after!)
    .sort()[0];
  const earliestPurgeDays = oldestPurge
    ? Math.max(0, Math.ceil((oldestPurge - Date.now() / 1000) / 86400))
    : null;

  return {
    summary: {
      total_in_vault: counts.quarantined,
      restored_in_window: counts.restored,
      purged_in_window: counts.purged,
      failed_in_window: counts.failed,
      earliest_purge_in_days: earliestPurgeDays,
      retention_days: Math.floor(DEFAULT_PURGE_HORIZON_SECONDS / 86400),
    },
    items,
    message: counts.quarantined > 0
      ? `${counts.quarantined} item(s) currently in Vault. ${earliestPurgeDays != null ? `Earliest purge in ${earliestPurgeDays} day(s).` : ''}`
      : 'Vault is empty.',
  };
}
