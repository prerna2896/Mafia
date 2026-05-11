# internalDate stability investigation

Answers ADR-0001 open question 3: "Is `internalDate` stable enough to use as part of the snapshot's content-addressable id?"

Relevant code: `mcp/src/quarantine/snapshot.ts:27` — `snapshotId` computes `sha256(email_id|internal_date)`.

---

## TL;DR

`internalDate` is **stable for the common case** (ordinary received mail that stays in the same account) but **is not stable across re-insertion**. When a message is re-uploaded via `users.messages.insert` or `users.messages.import`, Gmail assigns a new `id` and sets `internalDate` according to the `internalDateSource` parameter — the result may differ from the original. Because Mafia's restore-via-re-upload path (§5.4 partial-failure recovery) necessarily creates a new message, the snapshot id of the restored message will differ from the original snapshot id. This is expected and handled correctly: the reflog records the new Gmail `id` on the `restored` transition.

The current `sha256(email_id|internal_date)` scheme is sound **before** any re-upload. Augmenting with the RFC 2822 `Message-ID` header provides a cross-surface stable identifier that survives re-uploads.

---

## Findings

### 1. Is `internalDate` stable for messages that stay in the account?

**Yes, for ordinary mail.** The Gmail API describes `internalDate` as "the internal message creation timestamp (epoch ms), which determines ordering in the inbox." Google's API treats it as read-only on existing messages — there is no method to update `internalDate` after the message is created. `messages.trash`, `messages.untrash`, `messages.modify` (label changes), and `batchModify` do not alter `internalDate`. The value observed when a message is first fetched will be the same when it is fetched again later, as long as it has not been deleted and re-created.

Sources:
- [REST Resource: users.messages — Gmail API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
- [Gmail Node.js SDK schema — Schema$Message.internalDate](https://googleapis.dev/nodejs/googleapis/latest/gmail/interfaces/Schema$Message.html)

### 2. Is `internalDate` stable across IMAP re-import?

**Partially.** Gmail assigns `internalDate` at message creation via the Gmail backend, not from the IMAP session. For IMAP APPEND operations, Gmail sets `internalDate` to the current server time (analogous to `receivedTime`). The IMAP UID is per-folder and auto-increments; it is not the Gmail API `id` and is irrelevant to Mafia's scheme.

The Gmail API `id` (the immutable hex identifier) is assigned at creation and cannot be preserved across a delete-and-re-import. A message that is deleted and re-uploaded via IMAP APPEND or `messages.insert` gets a new `id` and a new `internalDate`.

Sources:
- [EmailEngine — Message IDs Explained](https://docs.emailengine.app/ids-explained/)
- [Limilabs — Get Gmail message id](https://www.limilabs.com/blog/get-gmail-message-id)

### 3. Is `internalDate` stable across Google Workspace account-to-account transfer (migration / Vault import)?

**Depends on the tool and parameter.** Google's migration services use `messages.import` under the hood. The `internalDateSource` parameter controls what is used:

- `dateHeader` (default for `messages.import`): sets `internalDate` from the RFC 2822 `Date:` header. This will match the original `internalDate` if the original was also derived from the `Date:` header — but not if the original was `receivedTime`.
- `receivedTime` (default for `messages.insert`): sets `internalDate` to the current wall-clock time of the import. This will never match the original unless the import happens within the same second.

Practically: a Workspace-to-Workspace migration using `dateHeader` will produce messages whose `internalDate` matches their `Date:` header, which may or may not match the original `internalDate`. Google's own Data Migration Service does not document whether it preserves `internalDate` precisely.

Sources:
- [InternalDateSource — Gmail API Reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/InternalDateSource)
- [Method: users.messages.insert — Gmail API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/insert)
- [Gmail API Email Import Shows Current Date Instead of Historical Date](https://community.latenode.com/t/gmail-api-email-import-shows-current-date-instead-of-historical-date-in-interface/24298)

### 4. What happens to `internalDate` when a message is re-uploaded via `users.messages.insert`?

`messages.insert` directly inserts a message "similar to IMAP APPEND, bypassing most scanning and classification." When called without `internalDateSource`, it defaults to `receivedTime` — i.e., current wall-clock time. The returned message has a **new Gmail `id`** and an `internalDate` set to the time of insertion, not the original message's time.

If `internalDateSource=dateHeader` is specified, `internalDate` is set from the `Date:` header of the uploaded RFC 2822 body. This is how Mafia's restore-via-re-upload path should call the API (§5.4).

**Bottom line:** re-upload always creates a new `(email_id, internal_date)` pair. The snapshot id of the re-uploaded message will differ from the original. This is not a bug in Mafia's scheme — the snapshot was taken before the action, and the restored message is a new entity in Gmail.

Sources:
- [Method: users.messages.insert — Gmail API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/insert)
- [InternalDateSource — Gmail API Reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/InternalDateSource)

### 5. Is the Gmail message `id` itself stable?

**Yes, for messages that exist and are not re-created.** The Gmail API consistently describes `id` as "the immutable ID of the message." It does not change on label changes, trash, untrash, or move. It changes only if the message is deleted and re-inserted (new `id` assigned by Gmail backend).

One edge case: **drafts**. Draft message IDs change every time a draft is replaced. The Drafts resource provides a stable `draft.id` wrapper. Mafia does not manage drafts, but the re-upload restore path creates a message via `messages.insert` (not as a draft), so the resulting message gets a stable, permanent `id`.

Sources:
- [REST Resource: users.messages — Gmail API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
- [Method: users.messages.get — Gmail API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get)

### 6. RFC 2822 `Message-ID` header stability

The RFC 2822 `Message-ID:` header is set by the originating MUA and is not modified by any Gmail operation (trash, label, move, or even re-upload via `messages.insert` — Gmail inserts the message with the header it received). It is the same value the sender and recipient both see, and it survives IMAP re-import with `dateHeader` mode. Gmail does warn against collision (duplicate Message-ID can cause threading issues) but does not alter the header value.

`Message-ID` is not present for all messages (some senders omit it), but it is present for virtually all legitimate email Mafia would act on.

Sources:
- [RFC 2822 — Internet Message Format](https://www.rfc-editor.org/rfc/rfc2822.html)
- [Message-ID — Wikipedia](https://en.wikipedia.org/wiki/Message-ID)

---

## Recommendation

**Keep the current `sha256(email_id|internal_date)` scheme for snapshot ids** — it correctly identifies the email as it exists in the account at action time. No change needed for the pre-action snapshot use case.

**Augment with `Message-ID` header storage, not as part of the content-addressable id.** Store the RFC 2822 `Message-ID` value in `email_snapshots.headers_json` (it is already included per ADR-0001 schema: `headers_json` stores "from, to, cc, subject, date, message-id, references"). Use it as a cross-reference for two purposes:

1. **Detecting accidental duplicate snapshots:** if two `email_snapshots` rows have the same RFC 2822 `Message-ID` but different `email_id` values, that indicates the same email was re-inserted into Gmail (new Gmail ID assigned). A dedup check on `Message-ID` during restore can surface this.
2. **Post-restore linkage:** when the restore path re-uploads a message and gets a new Gmail `id`, record `old_email_id → new_email_id` on the `restored` transition's payload along with the `Message-ID` header value. This allows a future audit to confirm the restored message is the same logical email even though the Gmail ID changed.

**Do not use `sha256(headers_canonical_json)` as the snapshot id.** Header canonicalization is fragile (encoding differences, folded headers, optional fields varying by MUA). The current `sha256(email_id|internal_date)` is simpler, more stable for the use case, and easier to reproduce cross-language.

---

## Test cases to add to `mcp/tests/snapshot.test.ts`

These validate the assumptions above and would catch drift if Google changes behavior:

1. **Stable id for unchanged message.** Create a snapshot for `{email_id: "abc", internal_date: 1000}`. Simulate fetching the same message again (same values). Assert `snapshotId("abc", 1000) === snapshotId("abc", 1000)` (trivially true but documents intent).

2. **Re-insert produces different snapshot id.** Simulate re-upload: `email_id` changes to "xyz", `internal_date` changes to current time. Assert `snapshotId("xyz", new_ts) !== snapshotId("abc", 1000)`. Assert that `writeSnapshot` with `INSERT OR IGNORE` does not clobber the original row; the original snapshot is preserved under its original id.

3. **Snapshot survives Gmail id change.** After re-upload, the reflog `restored` transition payload contains `{ old_email_id: "abc", new_email_id: "xyz" }`. Assert that reading the snapshot by original id still works (row still present).

4. **`internalDateSource=dateHeader` round-trip.** Construct a fake RFC 2822 message with a `Date:` header set to a specific epoch. Record the snapshot with `internal_date` = that epoch. Assert that the same `snapshotId` would be computed if the message were re-imported with `dateHeader`. (This is a documentation test — it asserts the expected behavior if Google honors `dateHeader` correctly, flagging the risk if they do not.)

5. **`Message-ID` header present in stored headers.** Assert that `writeSnapshot` preserves the `message-id` key in `headers_json`. Assert that `readSnapshot` returns it. (Guards against accidental field omission in the headers mapping layer.)

---

## Unresolved / needs live account testing

- **Google Workspace admin purge behavior:** whether `internalDate` is preserved when a Workspace admin uses the Google Vault export-and-reimport path is not documented. Would need a test Workspace account with admin access to verify.
- **`messages.import` with `dateHeader` on messages whose original `internalDate` was `receivedTime`:** if the original message's `internalDate` differs from its `Date:` header (which is common — the `Date:` header is set by the sending MUA, not by Google's receiving time), then `dateHeader` import will produce a different `internalDate` than the original. Magnitude of drift depends on mail server latency. No Google documentation confirms whether `messages.import` with `dateHeader` is byte-identical to `receivedTime`-stamped originals.
- **Behavior when `Date:` header is absent or malformed:** RFC 2822 does not require the `Date:` header (though it recommends it). If absent, `internalDateSource=dateHeader` behavior is undocumented.
