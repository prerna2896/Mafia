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

export interface GmailAdapter {
  /** Move the message to Gmail trash. Idempotent — calling on already-trashed message is fine. */
  trash(email_id: string): Promise<void>;
  /** Restore the message from Gmail trash. Throws on already-purged. */
  untrash(email_id: string): Promise<void>;
  /** Remove INBOX label. Idempotent. */
  archive(email_id: string): Promise<void>;
  /** Re-add INBOX label. Idempotent. */
  unarchive(email_id: string): Promise<void>;
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
    });
  }

  async untrash(email_id: string): Promise<void> {
    await withResilience(async () => {
      const gmail = await this.client();
      await gmail.users.messages.untrash({ userId: 'me', id: email_id });
    });
  }

  async archive(email_id: string): Promise<void> {
    await withResilience(async () => {
      const gmail = await this.client();
      await gmail.users.messages.modify({
        userId: 'me',
        id: email_id,
        requestBody: { removeLabelIds: ['INBOX'] },
      });
    });
  }

  async unarchive(email_id: string): Promise<void> {
    await withResilience(async () => {
      const gmail = await this.client();
      await gmail.users.messages.modify({
        userId: 'me',
        id: email_id,
        requestBody: { addLabelIds: ['INBOX'] },
      });
    });
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
    });
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
    });
  }
}
