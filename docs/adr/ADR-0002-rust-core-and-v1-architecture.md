# ADR-0002: Rust core + V1 (Photos MVP) architecture

## Status
Proposed

## Context

V0 is feature-complete and hardened. PRD §9 Phase 1 calls for an iOS-first Photos MVP. The trust primitives (state machine, reflog, snapshot store, content-addressable IDs) need to run on iOS *and* keep working in Mafia (Node) without us maintaining two parallel implementations.

PRD §7.1 already commits to a Rust core compiled to multiple platforms via FFI. This ADR locks the *concrete* plan: where the code lives, what gets ported first, how Mafia continues to work during the migration.

## Decision

### Repository layout

A new repo `wonder/mafia-core-rust/` (sibling to `wonder/Mafia/`), structured as a Cargo workspace:

```
wonder/
├── Mafia/                          # this repo — Node MCP, V0 + V1 email
└── mafia-core-rust/                # NEW — Rust core
    ├── Cargo.toml                  # workspace root
    ├── core/                       # pure Rust: state machine, reflog, snapshot
    │   ├── src/lib.rs
    │   └── tests/
    ├── ffi-node/                   # napi-rs binding for Mafia
    │   ├── Cargo.toml
    │   ├── package.json            # publishes as @mafia/core-node
    │   └── src/lib.rs
    └── ffi-ios/                    # cargo-lipo / Swift Package binding
        ├── Cargo.toml
        └── src/lib.rs
```

Rationale: separate from Mafia so the iOS app and any future surface (web/extension via WASM) can consume it without dragging in Mafia's deps.

### What gets ported, in order

| # | Module | Why this order | Validation |
|---|---|---|---|
| 1 | `state-machine` (pure functions, no I/O) | Smallest possible thing; proves the FFI loop. | Run TS tests + identical Rust tests; both pass on the same fixtures. |
| 2 | `reflog::canonical_json` + `verify_chain` | Pure; no DB. Lets us cross-check chain integrity between TS-written and Rust-verified reflogs. | Mafia writes reflog (TS); Rust verifies it (FFI). |
| 3 | `snapshot::content_id` (sha256 of email_id|internal_date) | Pure; deterministic. | Identical IDs from TS + Rust on the same inputs. |
| 4 | `reflog::append` (writes to SQLite) | First module that touches I/O. SQLite has Rust bindings (`rusqlite`). | Migration step: a Mafia commit writes via Rust, an existing Mafia restore reads via TS — round-trip works. |
| 5 | `outbox::commit_action` etc. | The hard one: orchestration + transactions. | Full Mafia integration tests pass with outbox-via-FFI. |

### Mafia stays working throughout

Mafia keeps its TS implementation. Each Rust port is opt-in via a feature flag (`MAFIA_CORE_BACKEND=rust|typescript`, default `typescript` until Rust is proven). When `rust`, the TS implementation delegates to the FFI binding. Tests run against both backends.

### iOS app starts after step 3

iOS doesn't need step 4–5 to start — it can use the same SQLite schema and write its own reflog using Rust primitives (steps 1–3 are enough to share the *shapes*). Steps 4–5 mostly benefit Mafia's TS migration, not iOS.

## Consequences

### Positive
- Single source of truth for trust primitives across Mafia (Node) and iOS app.
- Mafia continues to ship and gain features during the migration; no big-bang rewrite.
- Each commit is independently mergeable + reversible.
- iOS app and Mafia diverge only in their UI / connector layers — the security-critical core is shared.

### Negative
- Two languages in the project. Rust learning curve for anyone who only knows TS.
- napi-rs adds a build-time native compilation step (similar pain to better-sqlite3, which we already have).
- FFI ABI changes are breaking; need a versioning + compat strategy from day 1.

### Neutral
- Will grow to a third FFI target (WASM) for web extension or claude.ai connector — that's just another `ffi-*` crate.

## Alternatives considered

| Approach | Why rejected |
|---|---|
| **Rewrite Mafia in Rust + ship iOS as Swift wrapping native Rust.** | Big bang; Mafia stops shipping; loses the existing TS test surface. |
| **Reimplement everything in Swift for iOS, leave Mafia in TS, sync via shared DB schema only.** | Duplicate logic = guaranteed drift in trust-critical code. Defeats §3.2 "trust through reversibility" — two impls would diverge. |
| **WebAssembly compiled from TS (e.g. AssemblyScript / Porffor).** | Tooling immature for SQLite + heavy I/O; iOS WASM runtime is poor; loses the perf reason for Rust. |
| **Embed Mafia (Node) inside iOS via JavaScriptCore.** | Heavy; Apple App Store dim view of bundled JS engines; battery hit. |

## V1 commit sequence — first three concrete moves

These are the first PRs after ADR-0002 is accepted. Each is small, reviewable, and reversible.

### Commit 1 — Scaffold `mafia-core-rust` repo

- Create `wonder/mafia-core-rust/` with Cargo workspace root
- `core/` crate with a single function: `pub fn next_state(from: Option<State>, t: Transition) -> Result<State, Error>` mirroring `src/quarantine/state-machine.ts`
- Identical fixture tests in Rust (one per legal/illegal transition)
- `ffi-node/` crate with napi-rs export `nextState(from?: string, t: string): string`
- CI: `cargo test`, `cargo fmt --check`, `cargo clippy`

Success criteria: `cargo test` passes; `npm test` from `ffi-node/` returns same outputs as Rust unit tests.

### Commit 2 — Mafia consumes Rust state machine via feature flag

- Mafia adds `@mafia/core-node` as a dev dependency (local path during dev)
- `src/quarantine/state-machine.ts` gets a `nextState` function that delegates to Rust when `process.env.MAFIA_CORE_BACKEND === 'rust'`
- All 94 existing tests run twice — once with TS backend, once with Rust backend (vitest matrix or env-driven)
- HTML eval report adds a column showing which backend each scenario ran with

Success criteria: 94 × 2 = 188 tests green.

### Commit 3 — Port reflog::verify_chain to Rust

- `core/reflog.rs` — `canonical_json` + `verify_chain` (reads JSONL of entries, returns Ok or BrokenAt)
- `ffi-node/` adds `verifyChain(jsonlPath: string): VerifyResult`
- A new test in Mafia: write 1000 reflog entries via TS, verify with Rust, confirm match
- Performance baseline: Rust verifier should be ≥10× faster than TS for 100k entries

Success criteria: cross-language consistency test passes; perf gain measurable.

After commit 3, the iOS app can start (it has the trust primitives it needs).

## References

- PRD §7.1 Cross-Platform Core
- PRD §9 Phase 1 Roadmap
- ADR-0001 (the data model that's being ported)
- napi-rs — https://napi.rs
- rusqlite — https://docs.rs/rusqlite
- cargo-lipo — https://github.com/TimNN/cargo-lipo

## Open questions for V1 kickoff

1. **Repo: separate (`wonder/mafia-core-rust/`) or workspace member of Mafia?** Separate is cleaner long-term but adds ceremony today.
2. **napi-rs version + Node target.** Need to support Node 22+ for Mafia's MCP host.
3. **iOS team.** Are you building iOS yourself, or hiring? Affects timeline materially.
4. **CASA audit.** Email scope for Phase 3 needs an annual security review (~$15–75k, 4–6 month process). Lock budget + auditor by month 9 if Phase 3 is to ship on schedule.
5. **Naming.** PRD §13.1 — still TBD. "Vault" is the *feature*; the brand isn't decided.
