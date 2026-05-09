# Mafia — project tracking

Living document. Updates land here as work moves through phases.

> Format: `[x]` = done · `[~]` = in progress · `[ ]` = todo · `[-]` = explicitly deferred / out of scope this phase

---

## V0 — Mafia MCP (Phase 0)

**Goal:** ship a hardened email-pillar MCP that proves the trust loop (quarantine + reflog + restore) and the agent-callable thesis on a single surface (Gmail).

### Done — core data model
- [x] ADR-0001: Quarantine + reflog state machine (Recommendation C / hybrid storage) → `docs/adr/ADR-0001-quarantine-reflog-state-machine.md`
- [x] Schema migration: `email_actions`, `reflog`, `email_snapshots` with INSERT-only triggers on reflog
- [x] Genesis reflog entry written on first migration; idempotent re-runs
- [x] Pure state machine (`src/quarantine/state-machine.ts`) — every legal/illegal transition enumerated
- [x] Append-only hash-chained reflog with verify-chain helper (`src/quarantine/reflog.ts`)
- [x] Hybrid snapshot store — metadata-only for archive, gzipped body for delete (`src/quarantine/snapshot.ts`)
- [x] Transactional outbox + reconcile-on-startup for crashed in-flight rows (`src/quarantine/outbox.ts`)
- [x] 30-day purger sweep (`src/quarantine/purger.ts`)
- [x] CWD-independent `.env` loading

### Done — tools (MCP surface)
- [x] `fetch_emails` — read-only Gmail metadata fetch
- [x] `summarize_email` — Claude Haiku summary + recommended action (opt-in API key)
- [x] `act_on_email` — flag → state-machine row + reflog entry, no Gmail call
- [x] `commit_session` — flagged → quarantining → quarantined; runs reconcile + purger first; supports `dry_run`
- [x] `restore` — quarantined → restoring → restored; single, by email_id, batch
- [x] `list_vault` — vault as a place; sender, subject, days-until-purge per item
- [x] `clear_vault` — force-purge older items pre-30d (preview-by-default)
- [x] `get_session_stats` — investment metrics (vaulted / restored / purged / restore_rate / reflog entries)

### Done — resilience (deferred items now hardened)
- [x] `withRetry` exponential backoff with jitter; 429 + 5xx + network errors retried
- [x] `withTimeout` per-attempt timeout (default 15s)
- [x] `withResilience` composes both; wired into every `GoogleApisGmailAdapter` method
- [x] `ReauthRequiredError` — clean message when refresh token is revoked / invalid_grant
- [x] Multi-user behavior pinned via tests (data layer is already user-scoped; tools are first-user-only by V0 design)

### Done — testing
- [x] **94 unit + integration tests** across 10 files
- [x] State machine — every legal/illegal transition
- [x] Reflog — chain verification, INSERT-only triggers, canonical JSON
- [x] Snapshot — content-addressable id, hybrid storage, gzip round-trip including 5 MB body
- [x] Outbox — flag/commit/restore/purge/reconcile + 4 reconcile scenarios
- [x] Purger — eligibility filter, body-blob drop, chain integrity
- [x] Critical boundaries — migration idempotence, dry-run-as-read-only, terminal-state restore rejection, empty session, cross-session re-flag, large body
- [x] Resilience — withRetry behaviors, withTimeout, withResilience composition, ReauthRequiredError
- [x] Multi-user — data-layer scoping by user_id, reflog records user_id
- [x] Integration — 10-email round-trip + crash-mid-commit recovery
- [x] Vitest config + coverage script

### Done — eval framework
- [x] Scenario JSON schema + types (`evals/types.ts`)
- [x] Mock GmailAdapter shared between tests + evals (`src/testing/mock-gmail.ts`)
- [x] JSONL logger (`src/lib/eval-logger.ts`)
- [x] Scenario runner with mock + live modes, template substitution (`evals/runner.ts`)
- [x] HTML reporter — self-contained page with collapsible JSON, severity colors (`evals/report.ts`)
- [x] 4 starter scenarios: basic-triage, restore-roundtrip, failure-modes, aha-moment-shape
- [~] 10–15 exhaustive scenarios — background agent in flight

### Done — docs
- [x] PRD with all UX-expert findings folded in (`PRD.md`)
- [x] ADR-0001 quarantine + reflog data model
- [x] `docs/migration-phase0.md` — migration plan with rollout sequence
- [x] `docs/LOCAL-TESTING.md` — manual acceptance walkthrough
- [x] `docs/EVALS.md` — eval framework usage
- [x] README updated to reflect V0

### Done — ops
- [x] `Claude.dmg` (316 MB) accidentally committed binary deleted; `.gitignore` updated
- [x] better-sqlite3 upgraded to v12 for Node 25 compat
- [x] OAuth scopes (`gmail.modify` + `gmail.readonly`) verified on saved token
- [x] Mafia registered in Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`)
- [x] Mafia registered in Claude Code (`claude mcp add --scope user`)

### V0 deferred — explicitly out of scope
- [-] `start_fill_session` MCP resource for proactive Claude surfacing — needs Phase 1 thinking on the resource shape
- [-] `daily_brief` MCP resource — see above
- [-] Gmail rate-limit smart retry policy — current `withRetry` is generic; Phase 1+ may need per-endpoint quotas
- [-] Multi-user UX — requires reworking every tool's user resolution; Phase 1 alongside Rust core
- [-] Deep-restore after 30d (via stored body_blob) — Phase 4 paid feature per PRD §12

### V0 acceptance — manual
The 12-item checklist in `docs/LOCAL-TESTING.md` is the human-verifiable gate. Run it once locally before declaring V0 shipped.

---

## V1 — Photos MVP, iOS-first (Phase 1)

**Goal per PRD §9 Phase 1:** Phone Photos + iCloud Photos + Google Photos on iOS, with a Rust core that Mafia (this repo) starts adopting via Node FFI.

### V1 scope (target months 3–9)

> **Architecture decision:** see `docs/adr/ADR-0002-rust-core-and-v1-architecture.md` for repo layout, port order, and the first three concrete commits.
>
> **Design source:** see `docs/DESIGN.md` for the design language, IA, copy library, and PRD↔prototype mapping. Prototype lives in `vault-view/` (gitignored, cloned from `github.com/prerna2896/vault-view`).
>
> **Design status (2026-05-09):** prototype now realizes ~80% of V1 PRD scope. Onboarding ladder, sign-in, sheets, scope manager, paywall/cancel, search, photo viewer, empty/failure/skeleton states, conflict resolution all in. Remaining gaps: notification/widget mockups, allowlist editor, pinch-zoom photo viewer. Design is unblocked for iOS implementation.

#### Architectural
- [ ] **Commit 1** — Scaffold `wonder/mafia-core-rust/` workspace; port `next_state` to Rust + napi-rs binding (per ADR-0002)
- [ ] **Commit 2** — Mafia consumes Rust state machine via `MAFIA_CORE_BACKEND` flag; tests run against both backends
- [ ] **Commit 3** — Port `verify_chain` + `canonical_json` to Rust; cross-language consistency test
- [ ] Port `reflog::append` (first I/O module — uses `rusqlite`)
- [ ] Port `outbox::commit_action` orchestration
- [ ] iOS FFI surface — `cargo lipo` Swift Package
- [ ] CRDT for cross-device prefs sync — defer to V2 if not needed for MVP

#### iOS app
- [ ] Photos surface — PhotoKit integration, asset enumeration
- [ ] iCloud Photos — same PhotoKit; verify sync semantics with cloud
- [ ] Google Photos connector — OAuth + library API, scope = read-only first
- [ ] On-device pHash + Apple Vision feature prints
- [ ] Quarantine UI — "Vault" tab as a first-class surface (per PRD §5.4 must-fix)
- [ ] Onboarding ladder per PRD §5.0 — value before scope ask
- [ ] Aha-moment per PRD §5.0a — burst-of-N collapse, screenshot-worthy
- [ ] Stats dashboard with investment metrics (no streaks)

#### Cross-cutting
- [ ] CASA security audit kickoff (4–6 month process; needs to start month 9 to land V3)
- [ ] App Store submission strategy — "manage / curate" framing, not "speed up phone"

### V1 carryovers from V0 deferred
- [ ] `daily_brief` MCP resource (Mafia keeps shipping in parallel) — agent-proactive surfacing
- [ ] Multi-user contract on tools — every tool accepts `user_id` param

---

## V2 — Smart + cross-cloud (months 9–15)

- [ ] Drive + Dropbox connectors (shared with Mafia where possible)
- [ ] Bandit nudge engine (LinUCB / Thompson) — on-device, learns nudge timing per user
- [ ] NL retrieval — on-device embeddings + semantic search
- [ ] NIMA best-shot picker for burst groups
- [ ] Android launch

---

## V3 — Email + documents in mobile app (months 15–21)

- [ ] Gmail folded into mobile (reuse Mafia logic, by-then 18+ months in production)
- [ ] CASA audit complete
- [ ] OCR + receipt/boarding-pass classifier
- [ ] Cross-surface entity resolution graph promoted to default
- [ ] LLM-authored rules — small on-device model compiles natural language → deterministic rule

---

## V4 — Restore tier + agent polish (months 21–27)

- [ ] Time-machine snapshot restore (cold tier; Phase 4 paid feature)
- [ ] iOS App Intents + Android App Actions native bindings
- [ ] Family plan — 5 seats, shared restore tier
- [ ] Outlook + Microsoft Graph

---

## Open questions / decisions outstanding

- [ ] **Brand / product name** — PRD §13.1; "Vault" is the *feature* name, working title still TBD
- [ ] **Free-tier limits** — exact per-month caps before paywall
- [ ] **iOS vs. Android first** — current bias iOS; revisit before V1 kickoff
- [ ] **Server-side compute boundary** — strict on-device, or opt-in confidential cloud compute?
- [ ] **Initial cohort** — TestFlight, friends-and-family, paid waitlist?

---

## Conventions

- New ADRs go in `docs/adr/ADR-NNNN-<slug>.md` and are linked from this file under their phase.
- Tests are required for any change to quarantine/reflog/state-machine code.
- "Done" = code merged + tests green + docs updated. Anything in `[~]` is a real branch.
- Treat this file as the single source of truth for phase scope; PRD has the why, this has the what-and-when.
