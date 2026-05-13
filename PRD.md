# Product Requirements Document
**Working title:** [TBD — see §13]
**Category:** Cross-surface personal data cleanup, organization, and restore
**Version:** 0.2 (post-discovery refresh)
**Date:** May 2026
**Status:** Draft for review

> Note: this version is a fresh write derived from product-strategy discussion. The prior PRD (Google Doc) was not accessible from this environment — items from it should be merged into §5–§13 as appropriate.

---

## 1. Problem Statement

Personal data is fragmented across phone storage, iCloud Photos, Google Photos, Google Drive, Dropbox, OneDrive, Gmail/Outlook, and chat-app media folders. Existing solutions are:

- **Siloed by surface** — photo cleaners don't see email, email cleaners don't see photos, cloud cleaners don't see local.
- **Shallow** — most catch only byte-identical duplicates and miss near-duplicates, semantic groups, and cross-surface copies.
- **Untrusted** — destructive actions are typically unrecoverable; reviews of category leaders are dominated by accidental-deletion complaints and aggressive billing.
- **Static** — fixed thresholds, no learning from user behavior, intrusive notifications.

There is no consumer product that unifies cleanup across surfaces, makes every action recoverable, and integrates with the agent ecosystem users are starting to live inside.

---

## 2. Vision

A cleanup-and-organization tool that treats the user's data as **one entity graph spanning all their surfaces**, where every action is **reversible**, the system **learns when and how to help**, and capability is exposed both as an app and as a **callable tool for AI agents**.

---

## 3. The Three Pillars

### 3.1 Cross-Surface Identity & Transparency
The same photo on the phone, in iCloud, in Drive, and in a WhatsApp send is treated as **one entity** with multiple representations. Dedup is one outcome; the deeper outcome is *coherence* — single source of truth, consolidated view, and propagation-aware deletion that doesn't trigger re-sync from another surface.

### 3.2 Trust through Reversibility & Pattern Learning
- Three-stage destruction model: **flagged → quarantined → purged** (never direct delete).
- Append-only reflog of every action, restorable for ≥30 days by default.
- Behavioral learning: aggressiveness, nudge timing, and exception handling all adapt to the user via implicit feedback (restored / dismissed / accepted).
- Natural-language onboarding: user can describe what they want preserved or located ("find all transaction screenshots", "keep all photos from my Goa trip"). Retrieval before destruction builds trust.

### 3.3 Flexible Invocation
- Standalone app (iOS, Android, macOS).
- Callable by AI agents via **MCP server** + **iOS App Intents** + **Android App Actions**.
- Ambient invitations (Live Activity, widget, Focus Filter, charging-idle nudge) — never cross-app interruptions.
- Shortcuts / Tasker automation for power users.

---

## 4. Target Users

| Tier | Profile | Why they buy |
|---|---|---|
| Primary | Consumer mobile user paying for iCloud/Drive overage; "Storage Full" notifications; 10k+ photo libraries | Recover paid cloud spend; reduce anxiety about losing things |
| Secondary | Power user with multi-cloud setup, cross-device life | Cross-surface coherence is unique to this product |
| V3+ | Family / prosumer / SMB | Multi-seat, shared restore tier |

---

## 5. Functional Requirements

### 5.0 Onboarding flow (read-only-first ladder)

The onboarding ladder is a hard sequence — each rung earns the next. No write/delete scope is requested until the user has felt the read-only world and seen a specific finding about their own data.

```
1 Welcome + value prop (no permission ask)
2 Pick a surface to start with
3 Pre-prompt screen (in-app priming, NOT system dialog yet)
4 OS permission for read-only / limited scope
5 Scan runs, user reviews findings (read-only world)
6 AHA — show specific finding (see §5.0a)
7 Only NOW request write/delete scope, scoped to the action chosen
```

This sequence also de-risks Apple Guideline 2.3.1 review: every permission ask is justified by an action the user has explicitly chosen.

### 5.0a Aha moment per phase

Outcomes (§9) are not the same as the moment-of-value. Each phase has one named aha:

- **Phase 0 aha (Mafia MCP):** Agent surfaces 18 senders responsible for 73% of unread junk in <60s. First quarantine returns a percentage ("82% noise removed").
- **Phase 1 aha (Photos):** Visual proof — side-by-side of a burst of 11 nearly identical shots collapsed to one best-shot. The user feels "you saw something I'd have spent 10 minutes finding." Storage GB recovered is secondary, not the headline.

### 5.1 Connect (Sources)
| Surface | V1 | V2 | V3 | Notes |
|---|---|---|---|---|
| iOS Photos / iCloud Photos | ✅ | | | PhotoKit |
| Android Photos / MediaStore | ✅ | | | Scoped Storage compliant |
| Google Photos | ✅ | | | OAuth, library API |
| Google Drive | | ✅ | | OAuth, sensitive scope → CASA audit by V3 |
| Dropbox / OneDrive | | ✅ | | |
| Gmail | | | ✅ | Restricted scope, CASA audit |
| Outlook / Microsoft Graph | | | ✅ | |
| iCloud Drive | | | ⚠️ | No third-party API; Files-app picker fallback only |
| WhatsApp / chat media | | | ⚠️ | Sandboxed; only via system file picker |

Read-only by default; write/delete scope is opt-in per surface.

### 5.2 Discover
- **Exact duplicates** — cryptographic hash (cheap first pass).
- **Near-duplicates** — perceptual hash (pHash/dHash) with Hamming distance threshold.
- **Semantic groups** — embedding-based clustering (MobileCLIP / Apple Vision feature prints) for "same scene, different angle," "all receipts," "all sunsets."
- **Best-shot selection** — NIMA-style aesthetic scoring within burst/similar groups.
- **Junk classification** — blurry detection, screenshot recognition, expired-coupon / boarding-pass detection via OCR + classifier.
- **Natural-language retrieval** — on-device vector search over personal data: "find all transaction screenshots from last 6 months."
- **Cross-surface entity resolution** — probabilistic record linkage (Fellegi-Sunter–style) to merge representations across surfaces with confidence scores.

### 5.3 Decide (Rules)
- **Declarative rule engine**: predicates (mime type, age, size, sender, location, similarity score, embedding distance) → actions (preview, archive, quarantine).
- **LLM-authored rules**: small on-device LLM compiles natural language → deterministic rule with dry-run preview. ("Delete promotional emails older than 6 months unless from Amazon.")
- **Survivorship rules**: when duplicates resolved, declarative "keep highest resolution / most recent / has faces / starred."
- **Aggressiveness slider** mapped to thresholds, *plus* learned personalization layer on top.
- **Allowlists with stated reasons** — "/WeddingPhotos: never touch, reason: irreplaceable."
- **First-false-positive interaction**: when a user un-checks a suggestion, capture an optional reason chip ("Has someone important / I edited this / Just prefer it") as an allowlist signal. Surface the learning in next session's recap ("We learned you like keeping group shots"). This converts a near-miss into trust, and into training data.

### 5.4 Act (Vault, not Delete)

**Vault-first framing.** The user-facing word is **Vault**, not "delete," "trash," or "quarantine." Loss-aversion (Kahneman/Tversky) means destructive copy is processed as 2× loss; vault-framing is processed as relocation. Establish "you cannot lose anything from this app" *before* the first destructive-looking action.

**Copy rules (apply throughout app and notifications):**
- "Delete N items" → "Move N to Vault"
- "This cannot be undone" → "Recoverable for 30 days"

**Vault as a top-level surface.** Vault is a first-class tab/screen in the app, not a buried recovery flow. Users can browse, search, restore, and pre-emptively rescue items from it directly. Weekly notification: "Vault contents purging in 3 days — anything to keep?" (positive trigger, not guilt).

**Mechanics:**
- Three-stage lifecycle (internal terms): **flagged → vaulted → purged** (default purge horizon: 30 days).
- Provider trash used where available; app-managed vault where not. **Mafia's reflog/vault is the source of truth; provider trash is a backup mirror.**
- Pre-action snapshot: hash + thumbnail + metadata + source-surface pointers retained for restore.
- Sync-aware vaulting: when an entity exists on multiple surfaces, user chooses propagation per-surface to prevent restore-loops.
- **Time-machine restore**: snapshot semantics; "restore my photo library to last Tuesday" as one action.

#### Partial-failure recovery

The claim "Mafia's reflog/vault is the source of truth" only holds if the app can recover from the provider failing or diverging. The matrix below defines what recovery looks like in each case.

| Failure case | `restore` return | User-visible message | Local `body_blob` role |
|---|---|---|---|
| **Gmail trash purges before 30d** (Gmail auto-purge or quota trim) | Success — restore from local `body_blob` via `messages.insert` | "Restored from local copy (not from Gmail trash)" | Essential: this is the only copy. `body_blob` must be non-NULL for delete-intent actions. |
| **User empties Gmail trash manually mid-window** | Success — same path as above via `body_blob` | "Restored from local copy" | Essential. |
| **`messages.untrash` returns 404** (message no longer exists upstream) | Success if `body_blob` present; error if archive-intent (no blob) | "Restored from local copy" or "Cannot restore — no local body stored for archive actions" | Not stored for archive intent (ADR-0001 design); archive-intent restore fails gracefully with an honest error. |
| **`messages.insert` (re-upload) fails** (network error, quota exceeded) | Retriable error; action stays in `restoring` state for retry | "Restore failed — will retry. Your data is safe locally." | Safe: blob still present; outbox will retry on next startup. |
| **Clock skew between provider and Mafia** (provider reports purge before local 30d window) | No impact on restore path — Mafia's local `purge_after` timestamp governs; provider state is advisory | N/A | N/A — clock skew does not affect blob retention. |

**Reconciliation when Mafia and Gmail disagree:**

1. Mafia's local snapshot is authoritative for restore. Provider trash state is a performance optimization (fast path when the message still exists upstream), not a dependency.
2. When the fast path fails, the slow path is: read `body_blob` from `email_snapshots`, decompress, re-upload via `messages.insert` with `internalDateSource=dateHeader` to preserve original timestamps.
3. Re-uploaded messages receive a **new Gmail message ID** — the old ID is gone. The reflog records the new ID on the `restored` transition so the action chain stays coherent.
4. If re-upload is the only available path and the user wants the message back in a specific label/folder, labels are re-applied via `batchModify` after insert.
5. For archive-intent actions: no `body_blob` was stored (body is recoverable from `[Gmail]/All Mail`). If `All Mail` also no longer contains the message (account deletion, Workspace admin purge), restore is not possible. This is documented as an explicit limitation; the user is told "this message is no longer recoverable" and offered to remove it from the Vault view.

**What is not recoverable:** archive-intent actions where Gmail has permanently deleted the message from `All Mail` (e.g., admin force-purge, account closure). The snapshot contains headers and label state but not body. Users who want deep-restore on archive-intent items must explicitly opt into `store_body_for_archives` (a future paid-tier setting, Phase 4).

### 5.5 Reflect (Investment & Variable Reward)

Streaks are wrong for cleanup — cleanup is not a daily activity, and a broken streak punishes the user for the product working well. Replace streak mechanics with **investment** (sunk-cost hooks the user has built into the product) and **variable reward** (unpredictable surprise on each session).

**Investment surfaces:**
- Allowlist reasons accrued: "you've protected 1,847 photos with reasons."
- Cumulative reflog as portfolio: "you've recovered 47 GB across 6 months — see timeline."
- Cross-surface coherence score: "Photos and Drive are 94% deduped relative to each other."

**Variable reward surfaces:**
- Time-capsule surfacing: 1–2 photos not seen in >2 years rated aesthetically interesting, surfaced per scan.
- NL retrieval as discovery, not just utility.
- Junk-of-the-week: "47 expired boarding passes from 2019–24, vault them all?"

**Always-on stats:**
- Storage gauge per surface.
- Bytes recovered (cumulative, monthly, by category).
- Cleanup history with restore links.
- **Weekly recap** stays, but reframed insight-first, not streak-first ("here's what we learned about your library this week," not "you're on a 4-week streak").
- Quarterly transparency report — reframed as a personal stat report, Wrapped-style (see §13 NH-4).

### 5.6 Nudge (Ambient, not Intrusive)
- **Allowed signals only**: device charging + Wi-Fi + idle, "Storage Full" warnings, Focus Mode (Personal/Wind Down), explicit user-initiated session.
- **Contextual bandit** (LinUCB / Thompson sampling) learns per-user nudge timing.
- Implicit feedback: dismissed = negative, accepted = positive, restored-after-accept = strong negative.
- iOS surfaces: Live Activity, Dynamic Island, widget, Focus Filter, notification.
- Android surfaces: notification, foreground-service tile when charging, widget.
- **Hard non-goals**: cross-app foreground monitoring, accessibility-service abuse, system-alert popups over other apps.

**Nudge content archetypes.** Channel discipline is necessary but not sufficient — copy must match the user's motivational state at the moment of the trigger. Three archetypes:

| Context | Archetype | Sample copy | Why |
|---|---|---|---|
| Low-motivation (charging idle, evening) | **Spark** | "Want to see the 6 best shots from your Goa trip?" | Curiosity, not chore; opens the app on a positive surface |
| High-motivation (storage full, payment screen seen) | **Facilitator** | "Free 4 GB right now. One tap, vault keeps a copy." | Removes friction at the moment intent is highest |
| Just-in-time (post-burst-shoot detected) | **Just-in-time** | "Pick your favorite from the last burst?" | Highest accept rate; meets user inside the activity |

The bandit selects archetype + copy variant, not just timing.

### 5.7 Agent Surface
- **MCP server** exposing: `discover(filter)`, `quarantine(batch)`, `restore(batch_id)`, `stats(window)`, `find(natural_language_query)`.
- **iOS App Intents** + **Android App Actions** for native voice/Shortcut invocation.
- Scoped tokens — agents get the same read-only-by-default treatment as the app itself.

---

## 6. Non-Functional Requirements

### 6.1 Privacy
- On-device-by-default. Explicit, per-feature opt-in for any server-side compute.
- Where server compute is unavoidable (e.g. provider-side scanning), use **attested confidential compute** with no retention (Apple Private Cloud Compute–style).
- Local differential privacy for any cohort/learning signal that leaves the device.
- No advertising, no third-party data sharing, no content retention server-side.

### 6.2 Compliance
- GDPR, India DPDP, CCPA.
- **CASA audit** for Gmail/Drive sensitive scopes — budget and timeline locked at V3 kickoff.
- App Store + Play Store Data Safety declarations.
- SOC 2 Type II if/when server infra grows.
- Data export at any time.

### 6.3 Performance
- 12,000-photo scan in <5 min on mid-range phone (target).
- <2% battery per full background scan.
- Background work only when charging + Wi-Fi.
- Incremental scans (Merkle-diff) after the first full pass.

### 6.4 Reliability
- ≥99.9% restore success within retention window.
- Append-only reflog with hash chain — provable history.
- Network operations resumable; failover queue.

---

## 7. Technical Architecture

### 7.1 Cross-Platform Core
- **Target architecture (Phase 1+):** **Rust core engine** for hashing, dedup, rule evaluation, entity graph, reflog. Compile targets: iOS (via FFI), Android (JNI), macOS, Windows, WASM (for web/extension). One implementation of the hard parts; thin native UI layers per platform.
- **Phase 0 (current):** TypeScript + Node + `better-sqlite3` scaffold inside the existing `Mafia/` MCP server. Reflog and quarantine primitives are built here first; they migrate to the Rust core during Phase 1, after which Mafia consumes the same core via Node FFI. No throwaway code — the MCP becomes the agent surface of the bigger product.

### 7.2 On-Device ML Stack
| Component | Model class | Purpose |
|---|---|---|
| Cheap dedup | MD5 / SHA-256 | Byte-identical |
| Near-dup | pHash, dHash | Pixel similarity, robust to resize/recompression |
| Semantic | MobileCLIP / Apple Vision feature prints | "Same scene," cross-surface match, retrieval |
| Aesthetics | NIMA-style scorer | Best-shot picker |
| Doc/junk | OCR (Vision/MLKit) + small classifier | Receipts, boarding passes, OTPs, screenshots |
| NL rules / retrieval | Apple Foundation Models / Gemma 2B / Phi-3-mini | Compile natural language to rules; semantic search |
| Runtime | ONNX Runtime + Core ML / NNAPI delegates | Same model files everywhere |

### 7.3 Identity Graph & Storage
- **Content-addressable store**: blob hash is the entity ID.
- **Merkle tree per surface** for efficient delta scans.
- **Entity resolution layer**: probabilistic record linkage with confidence scores; survivorship rules pick canonical record.
- **Reflog**: append-only, hash-chained log of every action; powers restore and transparency.
- **Cold tier** for quarantined items beyond 30 days (cheap storage, optional).

### 7.4 Cloud Connectors
- OAuth 2.0; read-only scope by default, write opt-in per surface.
- Use provider-supplied hashes (Drive `md5Checksum`, Dropbox `content_hash`) when available — avoids re-download.
- Streaming chunk-hash fallback otherwise.
- Connection health dashboard: which surfaces connected, last sync, scopes granted, ability to revoke per-surface.

### 7.5 Nudge Engine
- Contextual bandit on-device (LinUCB / Thompson sampling).
- Feature vector: time-of-day, battery state, charging, network, days since last cleanup, current storage pressure, focus mode.
- Implicit-feedback rewards.
- Cold-start cohort priors (new user defaults; personalization overlays).

### 7.6 Agent Surface
- **MCP server** runs locally; agent talks to it over stdio or HTTP-over-loopback.
- **iOS App Intents** declared in app bundle; surfaces in Spotlight, Siri, Shortcuts.
- **Android App Actions** via `actions.xml` + `built-in intents`.
- Tool schema mirrors internal API; same permission model.

---

## 8. Key Optimizations (Edge Sources)

| Source domain | Technique adopted | Pillar served |
|---|---|---|
| Git / VCS | Content-addressable storage, Merkle diff, reflog | Cross-surface, Trust |
| MDM / CRM dedup | Probabilistic record linkage, survivorship rules, golden record | Cross-surface |
| Backup (restic, Time Machine) | Content-defined chunking, snapshot restore, cold tier | Trust |
| Photo ML | NIMA aesthetics, MobileCLIP semantic embedding, face/scene clustering | Discovery quality |
| Recommender systems | Contextual bandits, implicit feedback, cohort priors | Pattern learning |
| Antivirus / security | Quarantine model, allowlists with reasons, signed batches | Trust UX |
| Open banking | Aggregator pattern, connection health, read-only-first | Onboarding trust |
| LLM / agent ecosystems | MCP, App Intents, NL rule authoring, RAG-on-device | Flexibility |
| Distributed systems | Rust core, ONNX Runtime, Bloom filters, CRDTs for cross-device prefs | Cross-platform |
| Privacy-tech | On-device ML, local DP, reproducible builds, transparency report | Trust + compliance |

---

## 9. Roadmap

The roadmap is staged so **nothing built early is throwaway**. The existing Mafia MCP scaffold becomes the email pillar and the agent surface of the larger product.

### Phase 0 — V0 / Mafia MCP hardening (Months 0–3)
**Status:** scaffold exists at `/Mafia/` — TypeScript + Node + `better-sqlite3` + Gmail OAuth + Claude Haiku summarization. Tools shipped: `fetch_emails`, `summarize_email`, `act_on_email`, `commit_session`, `get_stats`.

**Bridge work to align with PRD pillars:**
- Replace destructive `commit_session` with **vault model** (flagged → vaulted → purged at 30d). User-facing copy uses "Vault," internal terms can stay.
- Add **append-only reflog** + `restore` tool — the first instance of the trust pillar; same data model that Phase 1 will port to Rust.
- Ship `start_fill_session` with duration hints (originally Mafia M2) — proves "ambient invitation" pattern.
- **Investment + variable-reward surfaces** (junk-of-the-week, allowlist-reasons counter, insight-first weekly recap; originally Mafia M4 framed as streak-based — now reframed per §5.5).
- Make Anthropic summarization **opt-in**; add a deterministic-rule fallback so the privacy story works even with cloud LLM disabled.
- Clean up: remove accidentally committed `src/lib/Claude.dmg`.

**Phase 0 retention loop (MCP-only product).** A pure MCP product has no native trigger surface — no notifications, no widget, no Focus filter. To make D30 retention measurable Phase 0 must ship:
- A `daily_brief` MCP resource Claude can pull into morning prompts ("here's what Mafia found overnight").
- Tool descriptions that invite the agent to surface Mafia proactively when the user mentions storage, inbox, "too many emails," or related triggers in conversation.

Without these, Phase 0 retention is invisible because the user has no reason to come back unprompted.

**Outcome:** a defensible, shippable MCP product that validates the trust loop, queue-commit-restore pattern, and agent-callable thesis on a single surface (Gmail). D30 retention measurable on power users in Claude Desktop / Claude Code.

### Phase 1 — V1 / Photos MVP, iOS-first (Months 3–9)
**Architectural pivot:** introduce the **Rust core** (hashing, dedup, entity graph, reflog). Mafia migrates its reflog/quarantine primitives to the Rust core via Node FFI; the mobile app consumes the same core via iOS FFI. From this point, the dedup/identity/restore engine is one codebase.

**Surfaces:** Phone Photos, iCloud Photos, Google Photos.
**ML (on-device):** pHash + Apple Vision feature prints; conservative similarity defaults.
**Trust:** quarantine + 30-day restore (powered by the same reflog Mafia is using).
**UX:** stats dashboard + weekly recap (mobile-native, patterns proven in Mafia).
**Goal:** D30 retention >40%; restore rate <5%.

### Phase 2 — V2 / Smart + Cross-Cloud (Months 9–15)
- Connectors: Drive + Dropbox (mobile and Mafia share connector layer).
- **Bandit nudge engine** (LinUCB / Thompson sampling), on-device.
- **NL retrieval** ("find transaction screenshots") — on-device embeddings + semantic search.
- **NIMA best-shot picker** for burst/similar groups.
- Android launch.

### Phase 3 — V3 / Email + Documents in Mobile App (Months 15–21)
- Gmail folded into mobile app — **reusing Mafia's hardened Gmail logic** (now ~18 months in production).
- CASA audit complete (started month 9 of Phase 2).
- Document / receipt OCR + classifier.
- **Cross-surface entity resolution** graph promoted to default.
- LLM-authored rules (small on-device LLM compiles natural language → deterministic rule + dry-run).

### Phase 4 — V4 / Restore Tier + Agent Polish (Months 21–27)
- **Time-machine snapshot restore** (cold tier).
- iOS App Intents + Android App Actions native bindings.
- Family plan (5 seats, shared restore tier).
- Outlook + Microsoft Graph.

### Reconciliation with the original Mafia README roadmap
| Original Mafia milestone | New plan |
|---|---|
| M1 — Core MCP tools, Gmail OAuth, manual triage ✅ | Kept as Phase 0 baseline |
| M2 — `start_fill_session` + duration hints | Absorbed into Phase 0 |
| M3 — Web app with card UI | De-prioritized; mobile app supersedes it |
| M4 — Full gamification layer | Absorbed into Phase 0 (junk score / streak / recap) |
| M5 — Voice commands | Superseded by App Intents in Phase 4 |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| App Store rejection (misleading "cleaner" framing) | Med | High | Position as "manage" / "curate," not "speed up phone"; honest scope copy; explicit on what we cannot do |
| Play Store rejection of accessibility/usage-stats abuse | High if misused | High | Don't use accessibility services; rely on allowed signals only |
| CASA audit cost ($15k–$75k/yr) and 4–6mo lead time | Certain at V3 | Med | Plan from V3 kickoff; budget; choose auditor early |
| iCloud Drive has no third-party API | Certain | Med | Limit iCloud surface to Photos in V1–V3; Files-picker fallback only |
| User trust loss from a single bad delete | Med | Catastrophic | Quarantine-by-default; reflog; conservative ML thresholds; per-surface confirmations on first use |
| Cleaner-app market crowding | Certain | Med | Differentiate on cross-surface + reflog + agent integration; do not compete on "junk file" framing |
| ML bias on edge photo content (kids, IDs, art) | Med | High | Conservative defaults; "review needed" tier for low-confidence; never auto-purge below threshold |
| OAuth scope creep scaring users | Med | Med | Read-only-first; per-feature scope expansion with clear UI |

---

## 11. Success Metrics

| Metric | Target (V1) | Target (V2) |
|---|---|---|
| D30 retention | 40% | 50% |
| GB recovered / active user / month | 3 | 6 |
| Restore rate (lower = better calibration) | <5% | <3% |
| Nudge accept rate | n/a | >30% |
| NPS | >40 | >50 |
| Free → paid conversion | 5% | 8% |

---

## 12. Monetization (Working Hypothesis)

- **Free tier:** N cleanups/month, single surface, 7-day Vault retention.
- **Paid ($4.99/mo or $39/yr):** unlimited cleanups, all surfaces, 30-day Vault retention.
- **Family ($9.99/mo, 5 seats):** shared Vault tier, per-member privacy.
- **Future B2B:** SMB plan for shared drives — not before V4.

User-facing copy follows §5.4 Vault rules ("Move N to Vault," "Recoverable for 30 days").

**Anti-pattern commitments (testable, not aspirational).** Competitor reviews are dominated by day-1 charges on "free trials," denied refunds, and hard-to-cancel auto-renewals. We commit to the following — each is QA-verifiable and should be checked at every release:

- **"Cancel" is top-level Settings**, ≤2 taps from app root. Not nested under "Account" or "Subscription management."
- **Day-of-charge email** with one-tap refund link if the user is charged within 7 days of trial end.
- **No trial→paid auto-conversion** without a 24-hour-prior in-app notification.
- **Pre-charge in-app banner** the day before any renewal (monthly or annual).

Cancel-from-app, transparent pricing, prorated refunds.

---

## 13. Open Questions

1. **Brand / name** — "clean," "organize," "curate," "tidy," other?
2. **Free-tier limits** — exact caps before paywall.
3. **iOS vs Android first** — current bias is iOS (better photo APIs, cleaner privacy story, more iCloud-overage payers); revisit.
4. **CASA audit funding & timing** — must lock by month 9.
5. **Server-side compute boundary** — strict on-device, or allow opt-in confidential cloud compute for heavy tasks?
6. **Initial cohort** — closed beta channel: TestFlight, family/friends, paid waitlist?
7. **Existing PRD merge** — items from prior PRD doc to reconcile into §5–§13.

**TODOs (from UX review, nice-to-have):**
- **TODO NH-1:** Brand naming — "Vault" should be the *feature* name regardless of what the parent brand becomes. Lock this before any marketing copy ships.
- **TODO NH-2:** Make NL retrieval a literal step in the destruction flow — "Want to retrieve before we vault?" prompt before purge or before large vault batches.
- **TODO NH-3:** App Intents as identity hooks — ship at least one App Intent in Phase 1 (not Phase 4) so the product is callable from Siri/Shortcuts at MVP.
- **TODO NH-4:** Quarterly transparency report → reframe as a personal stat report, Wrapped-style. Spec the visual format and what stats matter.
- **NH-5 (resolved):** Partial-failure recovery spec moved to §5.4 "Partial-failure recovery."
- **TODO NH-6:** Family plan shared restore needs a consent UX — when one family member restores from a shared vault, what does the originating member see / approve?

---

## 14. Current State / Codebase

A working V0 exists at `/Users/prernaagarwal/wonder/Mafia/`.

| | |
|---|---|
| Form factor | MCP server (stdio) for Claude Desktop |
| Stack | TypeScript, Node, `@modelcontextprotocol/sdk`, `better-sqlite3`, `googleapis`, `@anthropic-ai/sdk` |
| Surface | Gmail (read + write) |
| AI | Claude Haiku summarization (server-side via Anthropic SDK) |
| Tools shipped | `fetch_emails`, `summarize_email`, `act_on_email`, `commit_session`, `get_stats` |
| Auth | One-shot OAuth via `npm run auth`; refresh tokens stored locally |
| State | SQLite under `data/` (gitignored) |

**Gaps vs. PRD endgame** (closed in Phase 0–1):
- No quarantine model — `commit_session` is destructive.
- No reflog or restore.
- Server-side LLM summarization conflicts with on-device privacy story (must become opt-in).
- Single surface; runs only inside Claude Desktop (not Claude Code, not mobile).
- TypeScript/Node — the dedup/reflog/entity-graph primitives that need to travel cross-platform belong in the Rust core introduced in Phase 1.
- Stray `src/lib/Claude.dmg` accidentally committed.

**Why this is a stepping stone, not a detour:**
Phase 0 work hardens Mafia into a real product (quarantine + restore + ambient sessions). Phase 1 introduces the Rust core; from then on, new dedup/reflog/identity-graph code lives there once and is consumed by both Mafia (via Node FFI) and the mobile app (via iOS/Android FFI). Mafia's Gmail logic is reused when Phase 3 adds email to the mobile app — by which point it's been hardened in production for ~18 months.

---

## 15. One-Line Synthesis

> Build a Git-style content-addressable graph across the user's data surfaces, expose cleanup as quarantine with full restore, learn nudge timing with a bandit, and ship as an MCP-callable tool — and skip past the crowded "duplicate finder" category into a different product nobody is currently building.
