import { z } from 'zod';
import { fetchEmails, getEmailBody } from '../gmail/client.js';
import { summarizeEmail } from '../lib/summarize.js';
import { getFirstUser } from '../db/index.js';

export const summarizeEmailSchema = z.object({
  email_id: z.string().describe('Gmail message ID to summarize'),
  include_body: z.boolean().default(false)
    .describe('Whether to fetch and include email body for better summary (slower)'),
});

export type SummarizeEmailInput = z.infer<typeof summarizeEmailSchema>;

export async function summarizeEmailTool(input: SummarizeEmailInput) {
  const user = getFirstUser();
  if (!user) return { error: 'Not authenticated. Run: npm run auth' };

  // Re-fetch single email metadata
  const emails = await fetchEmails(user.id, { count: 1, labels: ['INBOX', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES'] });
  // Try to find the email in a broader fetch — in production this would be a direct get by ID
  // For now fetch by ID directly via the gmail client
  const { google } = await import('googleapis');
  const { getAuthenticatedClient } = await import('../gmail/client.js');
  const client = await getAuthenticatedClient(user.id);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const res = await gmail.users.messages.get({
    userId: 'me',
    id: input.email_id,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Date'],
  });

  const headers = res.data.payload?.headers ?? [];
  const get = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
  const fromRaw = get('From');
  const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) ?? [];

  const email = {
    id: input.email_id,
    threadId: res.data.threadId ?? '',
    from: fromMatch[1]?.trim().replace(/"/g, '') || fromRaw,
    fromEmail: fromMatch[2] || fromRaw,
    subject: get('Subject') || '(no subject)',
    date: get('Date'),
    snippet: res.data.snippet ?? '',
    labels: res.data.labelIds ?? [],
    sizeEstimate: res.data.sizeEstimate ?? 0,
  };

  let body: string | undefined;
  if (input.include_body) {
    body = await getEmailBody(user.id, input.email_id);
  }

  const summary = await summarizeEmail(email, body);

  return {
    emailId: summary.emailId,
    from: summary.from,
    subject: summary.subject,
    summary: summary.oneLiner,
    recommendation: summary.recommendedAction,
    reasoning: summary.reasoning,
    sizeKB: Math.round(email.sizeEstimate / 1024),
    backend: summary.backend,
    hint: `Suggested action: ${summary.recommendedAction.toUpperCase()}. Use act_on_email to execute.`,
  };
}
