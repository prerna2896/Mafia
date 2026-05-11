import { z } from 'zod';
import { topSenders, type TopSendersResult } from '../gmail/client.js';
import { getFirstUser } from '../db/index.js';

export const topSendersSchema = z.object({
  top_n: z.number().min(1).max(50).default(10)
    .describe('How many of the highest-volume senders to return (1-50).'),
  labels: z.array(z.string()).default(['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES'])
    .describe(
      'Gmail labels/categories to scan. Defaults to the three low-priority categories that produce most junk volume.',
    ),
  min_age_days: z.number().min(0).default(0)
    .describe('Only count messages older than this many days (0 = include the freshest mail).'),
  max_age_days: z.number().min(1).default(365)
    .describe('Only count messages newer than this many days. Pair with min_age_days to bracket a window.'),
  sample_size: z.number().min(1).max(2000).default(500)
    .describe('How many recent messages to scan before aggregating. Bigger = more accurate but slower; capped at 2000.'),
});

export type TopSendersInput = z.infer<typeof topSendersSchema>;

export interface TopSendersToolResult extends TopSendersResult {
  message: string;
  hint: string;
}

export async function topSendersTool(
  input: TopSendersInput,
): Promise<TopSendersToolResult | { error: string }> {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };

  const result = await topSenders(user.id, {
    topN: input.top_n,
    labels: input.labels,
    minAgeDays: input.min_age_days,
    maxAgeDays: input.max_age_days,
    sampleSize: input.sample_size,
  });

  // The aha headline (PRD §5.0a): "N senders are responsible for K% of your scanned mail."
  const message = result.totalScanned === 0
    ? 'No messages matched the scan window — try widening labels or max_age_days.'
    : `${result.topSenders.length} sender${result.topSenders.length === 1 ? '' : 's'} ` +
      `account for ${result.coverage.topN_percent}% of ${result.totalScanned} scanned messages ` +
      `(${result.totalSendersFound} unique senders total). ` +
      `Use fetch_emails with a sender filter + act_on_email to triage in bulk.`;

  return {
    ...result,
    message,
    hint: 'Pass any sender\'s fromEmail to fetch_emails (e.g. via the `q` field or a future sender filter), then act_on_email to bulk-archive/delete. Restore is available from the Vault for 30 days.',
  };
}
