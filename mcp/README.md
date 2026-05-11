# Mafia — MCP Server (V0)

Ambient inbox cleanup that lives inside your AI workflow. Quarantine + reflog + restore baked in — nothing destructive without a 30-day undo path.

> Part of the [Mafia monorepo](../README.md). Run all commands here from `Mafia/mcp/`.
>
> **V0 status:** quarantine state machine, append-only hash-chained reflog, transactional outbox, restore tool, vault listing, retry/timeout, refresh-token re-auth UX, dual-backend (TS + Rust core via FFI) — all shipped. 98 tests on both backends. See `../docs/LOCAL-TESTING.md` to exercise it on your real Gmail.
>
> **Project tracking:** `../docs/TODO.md`. **PRD:** `../PRD.md`. **Architecture:** `../docs/adr/`.

## Setup (15 minutes)

All commands below run from `mcp/` unless noted.

### 1. Install dependencies

```bash
npm install
```

### 2. Google Cloud setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable **Gmail API**: APIs & Services → Enable APIs → search "Gmail API"
4. Create OAuth credentials: APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorized redirect URIs: `http://localhost:3333/oauth/callback`
5. Copy your **Client ID** and **Client Secret**

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
ANTHROPIC_API_KEY=your_key
```

### 4. Authenticate with Gmail

```bash
npm run auth
```

This opens your browser, asks you to log in with Google, and saves your tokens locally. Run this once — tokens auto-refresh after that.

### 5. Add to Claude Desktop

Edit your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mafia": {
      "command": "node",
      "args": ["/absolute/path/to/Mafia/mcp/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your_client_id",
        "GOOGLE_CLIENT_SECRET": "your_client_secret",
        "ANTHROPIC_API_KEY": "your_key"
      }
    }
  }
}
```

Or use `tsx` for development (no build step needed):
```json
{
  "mcpServers": {
    "mafia": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/Mafia/mcp/src/index.ts"],
      "env": {
        "GOOGLE_CLIENT_ID": "your_client_id",
        "GOOGLE_CLIENT_SECRET": "your_client_secret",
        "ANTHROPIC_API_KEY": "your_key"
      }
    }
  }
}
```

### 6. Restart Claude Desktop

The Mafia tools will now appear in Claude Desktop.

---

## Usage

Once connected, just talk to Claude naturally:

```
"fetch 10 emails for triage"
"summarize email [id]"
"delete that one"
"keep this one"
"commit the session"
"what's my junk score?"
```

### Full cleanup flow

```
You: fetch 15 promotional emails
Claude: [calls fetch_emails] Here are 15 emails...

You: summarize the first one
Claude: [calls summarize_email] Newsletter from Substack — weekly digest, recommend delete

You: delete it, keep going
Claude: [calls act_on_email] Queued for deletion. Next email...

You: [after deciding all emails]
You: commit
Claude: [calls commit_session] ✅ Deleted 11, archived 3, kept 1. ~1.0MB freed.
```

### Quick session (fill-time)

```
You: while that image generates, show me 3 emails to triage
Claude: [fetches + summarizes 3 emails, waits for your decisions]
```

---

## Available Tools

| Tool | What it does |
|---|---|
| `fetch_emails` | Pull emails from Gmail by label/age (read-only) |
| `summarize_email` | AI summary + recommended action (keep/archive/delete) |
| `act_on_email` | Flag one email — written to local state machine, no Gmail call |
| `commit_session` | Apply flagged actions: snapshot + Gmail call + state transition. Items go to **Vault**, recoverable for 30 days |
| `list_vault` | Browse vault items with sender, subject, days-until-purge, action_id |
| `restore` | Pull one or more items out of vault back to inbox |
| `get_session_stats` | Investment metrics: total vaulted, restored, purged; restore rate; reflog entry count |

---

## Project Structure

```
mafia/
├── src/
│   ├── index.ts                         # MCP server entry; reconcile + purge on startup
│   ├── db/
│   │   ├── index.ts                     # SQLite open + user/session/stats helpers
│   │   ├── schema.sql                   # Canonical DDL (mirrored in migration)
│   │   └── migrations/
│   │       └── 001_quarantine_reflog.ts
│   ├── quarantine/
│   │   ├── types.ts                     # State / Intent / Transition types
│   │   ├── state-machine.ts             # Pure transition validation
│   │   ├── reflog.ts                    # Append-only hash-chained writer + verifier
│   │   ├── snapshot.ts                  # Hybrid metadata-vs-blob storage
│   │   ├── outbox.ts                    # Transactional outbox + reconcile
│   │   └── purger.ts                    # 30-day sweep
│   ├── gmail/
│   │   ├── client.ts                    # Gmail OAuth + low-level fetch
│   │   └── adapter.ts                   # Narrow GmailAdapter interface (testable)
│   ├── lib/summarize.ts                 # Claude Haiku summarization
│   ├── tools/                           # MCP tool handlers (one file per tool)
│   └── scripts/auth.ts                  # One-time OAuth setup
├── tests/
│   ├── helpers.ts                       # Test DB + MockGmailAdapter
│   ├── state-machine.test.ts            # 17 tests
│   ├── reflog.test.ts                   # Hash chain + INSERT-only triggers
│   ├── snapshot.test.ts                 # Hybrid storage + dedup
│   ├── outbox.test.ts                   # Flag/commit/restore/purge/reconcile
│   ├── purger.test.ts
│   └── integration.test.ts              # 10-email round-trip end-to-end
├── docs/
│   ├── adr/ADR-0001-quarantine-reflog-state-machine.md
│   ├── migration-phase0.md
│   └── LOCAL-TESTING.md                 # User-facing V0 testing guide
├── PRD.md
├── data/                                # SQLite DB lives here (gitignored)
└── package.json
```

---

## Tests

```bash
npm test               # vitest run
npm run test:watch     # vitest interactive
npm run test:coverage  # full coverage report
npm run typecheck      # tsc --noEmit
```

V0 ships 98 passing tests across 11 files: state machine (with dual TS + Rust backend), reflog chain, INSERT-only enforcement, snapshot storage, outbox crash recovery, idempotence, resilience (retry + timeout), multi-user assertions, cross-language TS↔Rust reflog parity, and an end-to-end 10-email round-trip via mocked Gmail.

```bash
npm run test:matrix    # runs once with TS backend, once with MAFIA_CORE_BACKEND=rust
```

## Evals

Scenario-based input/output framework — declarative tool sequences that log every input/output pair to JSONL for offline review. See `docs/EVALS.md`.

```bash
npm run eval:mock    # safe: mocked Gmail, isolated DB
npm run eval:live    # real Gmail, your real DB (caution)
npm run eval evals/scenarios/01-basic-triage.json   # one scenario
```

Logs land in `evals/runs/<scenario>-<timestamp>.jsonl`. Inspect with `jq`:

```bash
cat evals/runs/*.jsonl | jq 'select(.ok == false)'   # everything that errored
```

## Roadmap

Mafia is now Phase 0 of a larger cross-surface cleanup product. See `PRD.md` §9 for the full roadmap.

- **Phase 0 — Mafia MCP (this repo)** ✅ Quarantine, reflog, restore, vault listing on Gmail.
- **Phase 1 — iOS Photos MVP.** Introduces a Rust core that this repo migrates to (via Node FFI). Mafia keeps shipping as the email surface.
- **Phase 2 — Smart + cross-cloud.** Bandit nudges, NL retrieval, Drive + Dropbox.
- **Phase 3 — Email + documents in mobile app.** Reuses Mafia's hardened Gmail logic.
- **Phase 4 — Restore tier + agent polish.** Time-machine restore, App Intents, family plan.

Reconciliation with the original Mafia M1–M5 milestones is in `PRD.md` §9.
