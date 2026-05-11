# Gmail API reference — what Mafia uses, what it could use

A scratchpad for Gmail endpoints we may want as the app grows. Not exhaustive — only what's plausibly useful for an email-triage / vault product. Full reference: <https://developers.google.com/gmail/api/reference/rest>.

All paths are under `gmail.users.*` on the `googleapis` Node client; `userId` is always `'me'` for OAuth flows.

---

## In use today

| Endpoint | Where | Notes |
|---|---|---|
| `messages.list` | `gmail/client.ts:fetchEmails` | `q` string + `maxResults`. Over-fetch + post-filter on `internalDate` — Gmail's `before:`/`after:` can leak. |
| `messages.get` | `client.ts`, `summarize-email.ts`, `adapter.ts` | `format: 'metadata' \| 'full'`. Metadata is much cheaper if you only need headers. |
| `messages.modify` | `client.ts:executeActions`, `adapter.ts` | `addLabelIds` / `removeLabelIds`. How archive works (`removeLabelIds: ['INBOX']`). |
| `messages.trash` / `untrash` | `client.ts`, `adapter.ts` | Soft-delete (30-day Gmail trash) — what quarantine wraps. |

---

## Likely-next candidates

### Finding the largest emails

Gmail has **no server-side sort by size**. Two usable patterns:

1. **Threshold query** — `q: "larger:10M"` (or `size:10000000` in bytes). Iterate threshold down (`50M → 25M → 10M`) until you get a batch, then `messages.get` each and sort by `sizeEstimate` client-side.
2. **Over-fetch + rank** — same shape as our date-window fix. Cheap if the user just wants "top 20 biggest in inbox."

`sizeEstimate` (bytes) is on every `messages.get` response. Note the word "estimate" — it's close but not exact.

### Labels (Gmail's "groups")

Gmail has labels, not folders. A message can have many labels; nesting is via name (`Receipts/Amazon`).

| Endpoint | Use |
|---|---|
| `labels.list` | Enumerate user + system labels (`INBOX`, `CATEGORY_PROMOTIONS`, custom). |
| `labels.create` | Make a new label. `name: "Receipts/Amazon"` produces a nested label in the UI. |
| `labels.patch` / `update` | Rename, recolor. |
| `labels.delete` | Drop a label (messages keep their other labels). |
| `messages.modify` | Apply/remove labels on one message. Already in use. |
| `messages.batchModify` | Same, but **up to 1000 IDs in one call** — much cheaper for bulk label operations. |

### Incremental sync — `history.list`

Returns label/delete/add events since a `startHistoryId`. Pair with `getProfile.historyId` as the watermark. Way cheaper than re-listing the mailbox for "what changed since last session." Useful when Mafia starts caching mailbox state instead of always re-fetching.

### Threads (whole conversations)

Same shape as `messages.*` but operates atomically on every message in a thread:

- `threads.list`, `threads.get`, `threads.modify`, `threads.trash`, `threads.untrash`
- `threads.modify` applies labels to **every** message in the thread in one call. Useful if Mafia ever decides to triage by conversation rather than by message.

### Server-side filters — `settings.filters.*`

`filters.create` / `list` / `delete` — persistent rules Gmail runs on incoming mail (criteria like `from:`, `subject:`, plus actions like add label / skip inbox / mark read). Candidate for a "remember this decision" feature: instead of asking the user about Substack newsletters every week, write a filter once.

### Push notifications — `watch` / `stop`

`users.watch` registers a Cloud Pub/Sub topic to receive mailbox-change notifications; `users.stop` unregisters. Replaces polling. Heavyweight to set up (Pub/Sub topic, IAM); only worth it if Mafia ever needs near-real-time reactions to inbound mail.

### Attachments — `messages.attachments.get`

Pull attachment bytes by `attachmentId` (which you get from `messages.get` payload parts). Relevant if "largest email" investigations want to show *what's* in the giant email, or if Mafia ever surfaces attachments.

### Profile — `getProfile`

`emailAddress`, `messagesTotal`, `threadsTotal`, `historyId`. Cheap one-shot for "how big is this mailbox" stats and to seed `history.list`.

---

## Gotchas we've already hit (or are likely to)

- **`labelIds` + date operators interact unreliably.** Use OR'd `category:` / `label:` operators inside `q` instead. See `fetchEmails` in `client.ts`.
- **`after:` / `before:` can leak off-window results.** Over-fetch and post-filter on `internalDate` (millis since epoch, authoritative).
- **`sizeEstimate` is an estimate.** Fine for ranking, not for billing.
- **Rate limits are per-user quota units, not per-call.** A `messages.list` costs ~5 units; `messages.get` ~5; `messages.modify` ~5; `batchModify` ~50 regardless of batch size. So bulk-label 1000 messages: one `batchModify` (50 units) ≫ 1000 `modify` calls (5000 units).
- **`q` is the Gmail search syntax**, same as the UI search bar. Operators: <https://support.google.com/mail/answer/7190>.
