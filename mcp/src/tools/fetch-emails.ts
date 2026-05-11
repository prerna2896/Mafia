import { z } from 'zod';
import { fetchEmails } from '../gmail/client.js';
import { getFirstUser } from '../db/index.js';

export const fetchEmailsSchema = z.object({
  count: z.number().min(1).max(50).default(10).describe('Number of emails to fetch (1-50)'),
  labels: z.array(z.string()).default(['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL'])
    .describe('Gmail label IDs to fetch from. Common: CATEGORY_PROMOTIONS, CATEGORY_SOCIAL, INBOX'),
  min_age_days: z.number().default(1)
    .describe('Only fetch emails older than this many days (avoids very recent emails)'),
});

export type FetchEmailsInput = z.infer<typeof fetchEmailsSchema>;

export async function fetchEmailsTool(input: FetchEmailsInput) {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };

  const emails = await fetchEmails(user.id, {
    count: input.count,
    labels: input.labels,
    minAgeDays: input.min_age_days,
  });

  if (emails.length === 0) {
    return {
      message: 'No emails found matching the criteria.',
      emails: [],
      total: 0,
    };
  }

  return {
    message: `Found ${emails.length} emails ready for triage.`,
    emails: emails.map(e => ({
      id: e.id,
      from: e.from,
      fromEmail: e.fromEmail,
      subject: e.subject,
      date: e.date,
      preview: e.snippet.slice(0, 120),
      sizeKB: Math.round(e.sizeEstimate / 1024),
    })),
    total: emails.length,
    hint: 'Use summarize_email to get an AI summary for any email, then act_on_email to decide.',
  };
}
