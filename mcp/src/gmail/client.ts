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
  opts: { count?: number; labels?: string[]; minAgeDays?: number; maxAgeDays?: number } = {}
): Promise<EmailMetadata[]> {
  const client = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: client });

  const { count = 20, labels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL'], minAgeDays = 1, maxAgeDays } = opts;

  const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const beforeMs = Date.now() - minAgeDays * 86400000;
  const afterMs = maxAgeDays !== undefined ? Date.now() - maxAgeDays * 86400000 : undefined;

  // Translate labels into query operators (OR'd) instead of using labelIds.
  // Gmail's labelIds is an AND filter and has been observed to interact
  // unreliably with date operators like after:/before: — putting labels in
  // the q string with proper operators ({...} = OR) avoids both issues.
  const labelClauses = labels.map(toLabelQuery);
  const labelExpr = labelClauses.length === 0
    ? ''
    : labelClauses.length === 1 ? labelClauses[0] : `{${labelClauses.join(' ')}}`;

  const parts = [labelExpr, `before:${fmt(new Date(beforeMs))}`, '-is:starred', '-label:important'].filter(Boolean);
  if (afterMs !== undefined) {
    parts.splice(1, 0, `after:${fmt(new Date(afterMs))}`);
  }
  const q = parts.join(' ');

  // Over-fetch from Gmail because its date operators can be loose (Gmail's docs
  // explicitly note `after:`/`before:` may include off-window results). We
  // post-filter on internalDate below, so ask for more than we'll return.
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: Math.min(100, Math.max(count * 3, count)),
    q,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return [];

  // Fetch metadata for each message (parallel, capped at 10 concurrent)
  type WithInternalDate = EmailMetadata & { internalDate: number };
  const results: WithInternalDate[] = [];
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
          internalDate: Number(res.data.internalDate ?? 0),
        };
      })
    );
    results.push(...fetched);
  }

  // Post-filter on internalDate (authoritative) — Gmail's after:/before: can leak.
  const filtered = results.filter(r => {
    if (r.internalDate >= beforeMs) return false;
    if (afterMs !== undefined && r.internalDate < afterMs) return false;
    return true;
  });
  filtered.sort((a, b) => b.internalDate - a.internalDate);
  return filtered.slice(0, count).map(({ internalDate: _omit, ...rest }) => rest);
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

function toLabelQuery(label: string): string {
  const cat = label.match(/^CATEGORY_(.+)$/);
  if (cat) {
    const c = cat[1].toLowerCase();
    return c === 'personal' ? 'category:primary' : `category:${c}`;
  }
  return `label:${label.toLowerCase()}`;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ── Sender aggregation (top_senders tool) ─────────────────────────────────────

export interface SenderAggregate {
  /** Display string ("Acme <hi@acme.com>" or the raw From if no display name). */
  from: string;
  /** Lowercased email address — the aggregation key. */
  fromEmail: string;
  count: number;
  percentOfScanned: number;
  estimatedKB: number;
  /** Up to 3 representative subject lines for the sender. */
  sampleSubjects: string[];
}

export interface TopSendersResult {
  totalScanned: number;
  totalSendersFound: number;
  topSenders: SenderAggregate[];
  /** Coverage of the top-N over the scanned window (e.g. "top 18 = 73% of scanned"). */
  coverage: { topN_count: number; topN_percent: number };
}

export interface TopSendersOpts {
  topN?: number;
  labels?: string[];
  minAgeDays?: number;
  maxAgeDays?: number;
  /** How many recent messages to scan before aggregating (paged across list calls). */
  sampleSize?: number;
}

/**
 * Narrow surface of the Gmail `users.messages` resource that topSenders needs.
 * Extracted so tests can inject a fake without going through googleapis.
 */
export interface GmailMessagesApi {
  list: (params: {
    userId: string;
    maxResults?: number;
    q?: string;
    pageToken?: string;
  }) => Promise<{ data: { messages?: { id?: string | null; threadId?: string | null }[] | null; nextPageToken?: string | null } }>;
  get: (params: {
    userId: string;
    id: string;
    format?: string;
    metadataHeaders?: string[];
  }) => Promise<{ data: { payload?: { headers?: { name?: string | null; value?: string | null }[] | null } | null; sizeEstimate?: number | null } }>;
}

/**
 * Scan up to `sampleSize` recent messages matching the given label/date window,
 * aggregate by normalized sender email, and return the top-N senders by count.
 *
 * The aha-moment query the PRD calls out (§5.0a): "18 senders are responsible
 * for 73% of unread junk." This tool exists so Claude can surface that
 * concentration in one call — `fetchEmails` returns per-message metadata only.
 *
 * Self-contained on purpose: uses its own list/get loop instead of building on
 * fetchEmails so post-filter semantics, paging, and parallel chunking are
 * tuned for aggregation (we don't need order, we need volume + breadth).
 *
 * Tests can pass `__messagesApi` to bypass OAuth + googleapis entirely.
 */
export async function topSenders(
  userId: string,
  opts: TopSendersOpts = {},
  __messagesApi?: GmailMessagesApi,
): Promise<TopSendersResult> {
  const messages: GmailMessagesApi = __messagesApi ?? await (async () => {
    const client = await getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: client });
    return gmail.users.messages as unknown as GmailMessagesApi;
  })();

  const {
    topN = 10,
    labels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES'],
    minAgeDays = 0,
    maxAgeDays = 365,
    sampleSize = 500,
  } = opts;

  const cappedSampleSize = Math.min(sampleSize, 2000);

  const fmt = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  const beforeMs = Date.now() - minAgeDays * 86400000;
  const afterMs = Date.now() - maxAgeDays * 86400000;

  // Same labelIds-as-query-operators trick fetchEmails uses (see comment there).
  const labelClauses = labels.map(toLabelQuery);
  const labelExpr = labelClauses.length === 0
    ? ''
    : labelClauses.length === 1 ? labelClauses[0] : `{${labelClauses.join(' ')}}`;

  const parts = [
    labelExpr,
    `after:${fmt(new Date(afterMs))}`,
    `before:${fmt(new Date(beforeMs))}`,
    '-is:starred',
    '-label:important',
  ].filter(Boolean);
  const q = parts.join(' ');

  // Page through list until we have `cappedSampleSize` ids or Gmail runs out.
  const ids: { id: string; threadId?: string | null }[] = [];
  let pageToken: string | undefined;
  while (ids.length < cappedSampleSize) {
    const remaining = cappedSampleSize - ids.length;
    const res = await messages.list({
      userId: 'me',
      // Gmail caps maxResults at 500 per page; ask for at most what we still need.
      maxResults: Math.min(500, remaining),
      q,
      pageToken,
    });
    const batch = res.data.messages ?? [];
    for (const m of batch) if (m.id) ids.push({ id: m.id, threadId: m.threadId });
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken || batch.length === 0) break;
  }

  if (ids.length === 0) {
    return {
      totalScanned: 0,
      totalSendersFound: 0,
      topSenders: [],
      coverage: { topN_count: 0, topN_percent: 0 },
    };
  }

  // Metadata-only get per id, parallel chunks of 10. We don't need bodies.
  type MsgMeta = { fromName: string; fromEmail: string; subject: string; size: number };
  const metas: MsgMeta[] = [];
  const chunks = chunkArray(ids, 10);
  for (const chunk of chunks) {
    const fetched = await Promise.all(
      chunk.map(async ({ id }) => {
        try {
          const res = await messages.get({
            userId: 'me',
            id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date'],
          });
          const headers = res.data.payload?.headers ?? [];
          const get = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
          const fromRaw = get('From');
          const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) ?? [];
          const fromName = fromMatch[1]?.trim().replace(/"/g, '') || fromRaw;
          const fromEmail = (fromMatch[2] || fromRaw).toLowerCase();
          return {
            fromName,
            fromEmail,
            subject: get('Subject') || '(no subject)',
            size: res.data.sizeEstimate ?? 0,
          } as MsgMeta;
        } catch {
          // Skip individual message fetch failures — partial aggregation is
          // still useful and one bad message shouldn't tank the whole scan.
          return null;
        }
      }),
    );
    for (const m of fetched) if (m) metas.push(m);
  }

  // Aggregate by lowercased email.
  interface Acc {
    fromName: string;
    fromEmail: string;
    count: number;
    sizeBytes: number;
    subjects: string[];
  }
  const buckets = new Map<string, Acc>();
  for (const m of metas) {
    if (!m.fromEmail) continue;
    const cur = buckets.get(m.fromEmail);
    if (cur) {
      cur.count += 1;
      cur.sizeBytes += m.size;
      if (cur.subjects.length < 3 && !cur.subjects.includes(m.subject)) {
        cur.subjects.push(m.subject);
      }
    } else {
      buckets.set(m.fromEmail, {
        fromName: m.fromName,
        fromEmail: m.fromEmail,
        count: 1,
        sizeBytes: m.size,
        subjects: [m.subject],
      });
    }
  }

  const totalScanned = metas.length;
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, topN);

  const topNCount = top.reduce((acc, s) => acc + s.count, 0);
  const topNPercent = totalScanned > 0
    ? Math.round((topNCount / totalScanned) * 1000) / 10
    : 0;

  return {
    totalScanned,
    totalSendersFound: buckets.size,
    topSenders: top.map((s) => ({
      from: s.fromName && s.fromName !== s.fromEmail
        ? `${s.fromName} <${s.fromEmail}>`
        : s.fromEmail,
      fromEmail: s.fromEmail,
      count: s.count,
      percentOfScanned: totalScanned > 0
        ? Math.round((s.count / totalScanned) * 1000) / 10
        : 0,
      estimatedKB: Math.round(s.sizeBytes / 1024),
      sampleSubjects: s.subjects.slice(0, 3),
    })),
    coverage: { topN_count: topNCount, topN_percent: topNPercent },
  };
}
