// GmailAdapter abstraction. Hides googleapis behind a narrow interface so the
// outbox/quarantine code is testable without touching real Gmail.
//
// Real implementation wraps the existing client. Tests substitute a stub.

import { google } from 'googleapis';
import { getAuthenticatedClient } from './client.js';
import { withResilience } from './resilience.js';

export interface GmailMessageDetail {
  email_id: string;
  thread_id: string | null;
  internal_date: number;
  label_ids: string[];
  headers: Record<string, string>;
  raw_body?: string; // base64-encoded full RFC822, only when format='raw'
}

export interface ArchiveBatchResult {
  ok: string[];
  failed: { email_id: string; error: string }[];
}

export interface GmailAdapter {
  /** Move the message to Gmail trash. Idempotent — calling on already-trashed message is fine. */
  trash(email_id: string): Promise<void>;
  /** Restore the message from Gmail trash. Throws on already-purged. */
  untrash(email_id: string): Promise<void>;
  /** Remove INBOX label. Idempotent. */
  archive(email_id: string): Promise<void>;
  /** Re-add INBOX label. Idempotent. */
  unarchive(email_id: string): Promise<void>;
  /** Batch archive (remove INBOX label) for up to 1000 ids. Returns per-id outcome. */
  archiveBatch(email_ids: string[]): Promise<ArchiveBatchResult>;
  /** Fetch metadata (and optionally raw body) for snapshot purposes. */
  fetchDetail(email_id: string, includeBody: boolean): Promise<GmailMessageDetail>;
  /** Fetch the current label set; used by the reconciler. */
  fetchLabels(email_id: string): Promise<string[]>;
}

// Factory pattern lets tests / evals inject a mock adapter without touching
// every call site. Default factory returns the real GoogleApisGmailAdapter.
let _factory: (user_id: string) => GmailAdapter = (id) => new GoogleApisGmailAdapter(id);

export function setGmailAdapterFactory(f: (user_id: string) => GmailAdapter) {
  _factory = f;
}

export function resetGmailAdapterFactory() {
  _factory = (id) => new GoogleApisGmailAdapter(id);
}

export function makeGmailAdapter(user_id: string): GmailAdapter {
  return _factory(user_id);
}

export class GoogleApisGmailAdapter implements GmailAdapter {
  constructor(private readonly user_id: string) {}

  private async client() {
    const auth = await getAuthenticatedClient(this.user_id);
    return google.gmail({ version: 'v1', auth });
  }

  // Every Gmail call is wrapped in withResilience: per-attempt timeout +
  // exponential backoff on 429/5xx/network errors. Permanent failures (401
  // unauth, 403 insufficient scope, 404 missing message) bubble up on first
  // attempt for the outbox to record as failed.

  async trash(email_id: string): Promise<void> {
    await withResilience(async () => {
      const gmail = await this.client();
      await gmail.users.messages.trash({ userId: 'me', id: email_id });
    }, { cost: 5 });
  }

  async untrash(email_id: string): Promise<void> {
    await withResilience(async () => {
      const gmail = await this.client();
      await gmail.users.messages.untrash({ userId: 'me', id: email_id });
    }, { cost: 5 });
  }

  async archive(email_id: string): Promise<void> {
    await withResilience(async () => {
      const gmail = await this.client();
      await gmail.users.messages.modify({
        userId: 'me',
        id: email_id,
        requestBody: { removeLabelIds: ['INBOX'] },
      });
    }, { cost: 5 });
  }

  async unarchive(email_id: string): Promise<void> {
    await withResilience(async () => {
      const gmail = await this.client();
      await gmail.users.messages.modify({
        userId: 'me',
        id: email_id,
        requestBody: { addLabelIds: ['INBOX'] },
      });
    }, { cost: 5 });
  }

  async archiveBatch(email_ids: string[]): Promise<ArchiveBatchResult> {
    if (email_ids.length === 0) return { ok: [], failed: [] };
    // Gmail caps batchModify at 1000 ids per call. Chunking above that is the
    // caller's responsibility; we surface the limit by failing fast.
    if (email_ids.length > 1000) {
      throw new Error(`archiveBatch: cap is 1000 ids per call, got ${email_ids.length}`);
    }
    // Quota cost: same scaling the legacy executeActions path used (5 per
    // write). Per Gmail's quota docs batchModify charges per-id, so the cost
    // grows linearly with the batch size.
    const cost = 5 + 5 * email_ids.length;
    try {
      await withResilience(async () => {
        const gmail = await this.client();
        // batchModify returns 204 No Content on success — no per-id payload.
        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: { ids: email_ids, removeLabelIds: ['INBOX'] },
        });
      }, { cost });
      return { ok: [...email_ids], failed: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: [],
        failed: email_ids.map((id) => ({ email_id: id, error: msg })),
      };
    }
  }

  async fetchDetail(email_id: string, includeBody: boolean): Promise<GmailMessageDetail> {
    return withResilience(async () => {
      const gmail = await this.client();
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: email_id,
        format: includeBody ? 'raw' : 'metadata',
        metadataHeaders: includeBody ? undefined : ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-Id', 'References'],
      });

      const headers: Record<string, string> = {};
      for (const h of res.data.payload?.headers ?? []) {
        if (h.name && h.value) headers[h.name] = h.value;
      }

      return {
        email_id,
        thread_id: res.data.threadId ?? null,
        internal_date: Number(res.data.internalDate ?? 0),
        label_ids: res.data.labelIds ?? [],
        headers,
        raw_body: includeBody ? res.data.raw ?? undefined : undefined,
      };
    }, { cost: 1 });
  }

  async fetchLabels(email_id: string): Promise<string[]> {
    return withResilience(async () => {
      const gmail = await this.client();
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: email_id,
        format: 'minimal',
      });
      return res.data.labelIds ?? [];
    }, { cost: 1 });
  }
}
