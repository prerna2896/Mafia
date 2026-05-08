# Mafia V0 — local testing guide

This walks you through running V0 against your real Gmail in Claude Desktop and exercising the V0 acceptance checklist.

> **Use a non-critical Gmail.** This is V0. Despite the reflog and quarantine, you should not point this at your primary inbox until you've shaken it out. Gmail has its own 30-day trash recovery as a backstop, but treat this as testing, not production.

---

## 1. One-time setup

If this is your first time running Mafia:

```bash
cd /Users/prernaagarwal/wonder/Mafia
npm install
cp .env.example .env
# edit .env — fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ANTHROPIC_API_KEY
npm run auth
```

`npm run auth` opens a browser → grant Gmail read + modify scopes → token saved locally.

If you've used Mafia before, V0 has migrated the schema. The `data/mafia.db` will gain three new tables (`email_actions`, `reflog`, `email_snapshots`) on first run and drop any leftover rows from the old `action_queue` table. No data loss for users or sessions.

## 2. Wire into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mafia": {
      "command": "npx",
      "args": ["tsx", "/Users/prernaagarwal/wonder/Mafia/src/index.ts"],
      "env": {
        "GOOGLE_CLIENT_ID": "<your id>",
        "GOOGLE_CLIENT_SECRET": "<your secret>",
        "ANTHROPIC_API_KEY": "<your key>"
      }
    }
  }
}
```

Restart Claude Desktop. You should see seven Mafia tools in the tool list:
`fetch_emails`, `summarize_email`, `act_on_email`, `commit_session`, `list_vault`, `restore`, `get_session_stats`.

## 3. The aha-moment test (PRD §5.0a)

This is the main user-experience gate. Open Claude Desktop and try a single prompt without any preamble:

> "What's cluttering my Gmail right now?"

Claude should call `fetch_emails`, possibly `summarize_email` on a few of them, and produce something like:

> *"I looked at 15 of your promotional / social emails. The top 4 senders account for ~70% of unread junk: Substack, Notion, Indeed, LinkedIn. Want me to vault them?"*

**Pass criteria:** under ~60 seconds wall-clock, you see a sender breakdown that feels insightful (not just "here are 15 emails"). If Claude only lists raw emails without aggregating, the aha moment isn't landing — that's a feedback signal for prompt design, not a code bug.

## 4. The vault round-trip test

Pick three emails you don't care about losing for a day. Use Claude:

> "Vault these three: <email-1>, <email-2>, <email-3>. Two as archive, one as delete."

Claude should:
1. Call `act_on_email` three times → all flagged.
2. Call `commit_session` → quarantines them.

Verify in Gmail UI:
- The two archives should be out of inbox but still in `[Gmail]/All Mail` (search by subject — they're there).
- The one delete should be in `[Gmail]/Trash` with the standard "30 days" countdown.

Then ask Claude:

> "Show me my vault."

Claude calls `list_vault` and should return all three with sender, subject, intent, days-until-purge, and `action_id`.

Then:

> "Restore the deleted one."

Claude calls `restore`. Verify in Gmail:
- The previously-trashed email is back in INBOX.
- `[Gmail]/Trash` no longer contains it.

## 5. The reflog audit test

Inspect the reflog directly:

```bash
sqlite3 /Users/prernaagarwal/wonder/Mafia/data/mafia.db <<'SQL'
.headers on
.mode column
SELECT seq, ts, transition, action_id, substr(payload_json, 1, 60) AS payload
FROM reflog ORDER BY seq;
SQL
```

You should see one row per state transition you triggered. The `payload` column is a canonical JSON of the transition's metadata.

Verify the chain integrity from inside Node:

```bash
npx tsx -e "
import { getDb } from './src/db/index.js';
import { verifyChain } from './src/quarantine/reflog.js';
console.log(verifyChain(getDb()));
"
```

Expect: `{ ok: true }`. If you ever see `ok: false`, something has tampered with the reflog — that's a real-world bug worth investigating.

## 6. The crash-recovery test

Quit Claude Desktop mid-commit:

1. Flag 5 emails with `act_on_email`.
2. Start `commit_session`.
3. Force-kill Claude Desktop while it's running (or kill the `node` / `tsx` process backing the MCP server) before commit returns.

Restart Claude Desktop. The Mafia server runs `reconcileInFlight` on startup. Look at `console.error` output (Claude Desktop's MCP logs at `~/Library/Logs/Claude/mcp*.log`) for a line like:

```
Mafia startup: reconciled N, failed 0, purged 0.
```

Then ask Claude:

> "Show me my vault."

The N items should appear as `quarantined` — reconcile converged them.

## 7. The append-only test

Try to UPDATE or DELETE the reflog directly:

```bash
sqlite3 /Users/prernaagarwal/wonder/Mafia/data/mafia.db <<'SQL'
UPDATE reflog SET payload_json = '{"hacked":true}' WHERE seq = 1;
SQL
```

Expect: `Runtime error: reflog is append-only`. The trigger fires.

```bash
sqlite3 /Users/prernaagarwal/wonder/Mafia/data/mafia.db <<'SQL'
DELETE FROM reflog WHERE seq = 1;
SQL
```

Same error. The reflog cannot be tampered with via the storage layer.

## 8. The 30-day purge test (simulated)

You don't want to wait 30 days. Simulate:

```bash
sqlite3 /Users/prernaagarwal/wonder/Mafia/data/mafia.db <<'SQL'
-- Pick a quarantined item, force its purge_after into the past.
UPDATE email_actions SET purge_after = 1
WHERE state = 'quarantined' LIMIT 1;
SQL
```

Then in Claude:

> "Commit this empty session."

(Or any tool call that triggers the startup/post-commit purger sweep.)

Re-check the vault — that one row should now show `purged`. The body blob is dropped, but the audit row and headers remain.

## 9. The "did anything escape to the wrong place" check

Spot-check Gmail directly:

- Search `in:inbox` — items you flagged as archive or delete should not be here.
- Search `in:trash` — items you flagged as delete should be here, items you flagged as archive should not.
- Search a specific subject from a vaulted email — it should show up under `[Gmail]/All Mail` if archived, `[Gmail]/Trash` if deleted.

If anything is in the wrong place, capture the `action_id` (from `list_vault` output) and check the reflog for that action — it tells you the exact transition history.

---

## V0 acceptance checklist

Tick these off after running through the above:

- [ ] `npm run typecheck` passes silently.
- [ ] `npm test` shows 48 passing, 0 failing.
- [ ] All seven Mafia tools appear in Claude Desktop after restart.
- [ ] Aha moment lands in <60s on a real Gmail.
- [ ] Quarantining N emails moves them in Gmail (TRASH or no-INBOX) AND writes N reflog entries.
- [ ] `list_vault` shows them with countdown to purge.
- [ ] Restoring round-trips correctly (Gmail label state matches request).
- [ ] After 30d (or simulated), items move to `purged`; reflog still has their record.
- [ ] Killing the process mid-commit and restarting reconciles cleanly — no rows stuck in `*-ing` states after restart.
- [ ] Reflog hash chain validates end-to-end.
- [ ] Calling `trash` / `untrash` twice on the same email is a no-op (idempotent).
- [ ] Restoring an item Gmail already permanently deleted returns a friendly error, not a crash.
- [ ] Direct `UPDATE` / `DELETE` on `reflog` raises `reflog is append-only`.

When all of these are true, V0 is done and ready to use as the email pillar of the larger product.

---

## Known limitations of V0

- **Single user.** The MCP picks the first user in the DB. Multi-user is Phase 1+.
- **Single surface.** Gmail only. Photos / Drive / Dropbox arrive in Phase 1+.
- **No deep restore.** If you wait past Gmail's 30-day trash auto-purge, the email is permanently gone from Gmail. Mafia keeps the body blob locally for delete-intent items, but the V0 `restore` tool doesn't yet re-import them — that's a paid Phase 4 feature per PRD §12.
- **No mobile app, no nudges, no widgets.** All of those are Phase 1+ surfaces. V0 retention rides on Claude calling Mafia proactively when you mention storage / inbox / "too many emails."
- **`daily_brief` MCP resource not yet wired.** The PRD calls for one to power proactive surfacing in Claude. V0 has the data underneath; the resource exposure ships next.
