import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getUser, updateTokens } from '../db/index.js';

/**
 * Thrown when the user's stored credentials cannot be used to obtain a fresh
 * access token. Most often: refresh token revoked by the user, app deleted
 * from their Google account, or scope changes invalidated the grant.
 *
 * Callers should treat this as terminal — surface the message to the user
 * (it tells them to run `npm run auth`) rather than retrying the API call.
 */
export class ReauthRequiredError extends Error {
  constructor(public readonly user_id: string, public readonly cause_message: string) {
    super(
      `Mafia needs to re-authorize Google for ${user_id}. ` +
      `Run: npm run auth (and grant all requested scopes). ` +
      `Underlying cause: ${cause_message}`,
    );
    this.name = 'ReauthRequiredError';
  }
}

function looksLikeInvalidGrant(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { message?: string; response?: { data?: { error?: string } } };
  const data = e.response?.data?.error;
  if (data === 'invalid_grant') return true;
  return typeof e.message === 'string' && /invalid_grant/i.test(e.message);
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function createOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI ?? 'http://localhost:3333/oauth/callback'
  );
}

export function getAuthUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // force refresh_token on every auth
  });
}

export async function getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
  const user = getUser(userId);
  if (!user?.access_token) throw new Error(`No credentials found for user ${userId}. Run: npm run auth`);

  const client = createOAuthClient();
  client.setCredentials({
    access_token: user.access_token,
    refresh_token: user.refresh_token ?? undefined,
    expiry_date: user.token_expiry ?? undefined,
  });

  // Auto-refresh if token is expired or expiring within 5 minutes.
  if (user.token_expiry && user.token_expiry < Date.now() + 300_000) {
    if (!user.refresh_token) {
      throw new ReauthRequiredError(userId, 'no refresh token stored — initial auth was incomplete or refresh token expired');
    }
    try {
      const { credentials } = await client.refreshAccessToken();
      if (credentials.access_token) {
        updateTokens(userId, credentials.access_token, credentials.expiry_date ?? 0);
        client.setCredentials(credentials);
      }
    } catch (err) {
      if (looksLikeInvalidGrant(err)) {
        throw new ReauthRequiredError(userId, err instanceof Error ? err.message : String(err));
      }
      throw err; // unrelated failure — let it bubble
    }
  }

  return client;
}

// ── Email fetching ────────────────────────────────────────────────────────────

export interface EmailMetadata {
  id: string;
  threadId: string;
  from: string;
  fromEmail: string;
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
  sizeEstimate: number;
}

export async function fetchEmails(
  userId: string,
  opts: { count?: number; labels?: string[]; minAgeDays?: number } = {}
): Promise<EmailMetadata[]> {
  const client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const { count = 20, labels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL'], minAgeDays = 1 } = opts;

  // Build query
  const ageCutoff = new Date(Date.now() - minAgeDays * 86400000);
  const dateStr = `${ageCutoff.getFullYear()}/${String(ageCutoff.getMonth() + 1).padStart(2, '0')}/${String(ageCutoff.getDate()).padStart(2, '0')}`;
  const q = `before:${dateStr} -is:starred -label:important`;

  // Fetch message IDs
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: labels,
    maxResults: count,
    q,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return [];

  // Fetch metadata for each message (parallel, capped at 10 concurrent)
  const results: EmailMetadata[] = [];
  const chunks = chunkArray(messages, 10);

  for (const chunk of chunks) {
    const fetched = await Promise.all(
      chunk.map(async (msg) => {
        const res = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        const headers = res.data.payload?.headers ?? [];
        const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

        const fromRaw = get('From');
        const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) ?? [];
        const fromName = fromMatch[1]?.trim().replace(/"/g, '') || fromRaw;
        const fromEmail = fromMatch[2] || fromRaw;

        return {
          id: msg.id!,
          threadId: msg.threadId!,
          from: fromName,
          fromEmail,
          subject: get('Subject') || '(no subject)',
          date: get('Date'),
          snippet: res.data.snippet ?? '',
          labels: res.data.labelIds ?? [],
          sizeEstimate: res.data.sizeEstimate ?? 0,
        };
      })
    );
    results.push(...fetched);
  }

  return results;
}

export async function getEmailBody(userId: string, emailId: string): Promise<string> {
  const client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const res = await gmail.users.messages.get({ userId: 'me', id: emailId, format: 'full' });
  const parts = res.data.payload?.parts ?? [];
  const body = parts.find(p => p.mimeType === 'text/plain')?.body?.data
    ?? res.data.payload?.body?.data
    ?? '';

  return Buffer.from(body, 'base64').toString('utf-8').slice(0, 2000);
}

// ── Email actions ─────────────────────────────────────────────────────────────

export interface ActionResult {
  emailId: string;
  action: 'keep' | 'delete' | 'archive';
  success: boolean;
  error?: string;
}

export async function executeActions(
  userId: string,
  actions: { emailId: string; action: 'keep' | 'delete' | 'archive' }[]
): Promise<ActionResult[]> {
  const client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const results: ActionResult[] = [];

  // Execute in parallel, capped at 5 concurrent
  const chunks = chunkArray(actions, 5);
  for (const chunk of chunks) {
    const executed = await Promise.all(
      chunk.map(async ({ emailId, action }) => {
        try {
          if (action === 'delete') {
            await gmail.users.messages.trash({ userId: 'me', id: emailId });
          } else if (action === 'archive') {
            await gmail.users.messages.modify({
              userId: 'me',
              id: emailId,
              requestBody: { removeLabelIds: ['INBOX'] },
            });
          }
          // 'keep' is a no-op
          return { emailId, action, success: true };
        } catch (err) {
          return { emailId, action, success: false, error: String(err) };
        }
      })
    );
    results.push(...executed);
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}
