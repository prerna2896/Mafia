# Mafia — monorepo

Mafia is a cross-surface personal data cleanup product. This is the monorepo: everything Mafia-related ships from here.

## Layout

```
Mafia/
├── mcp/                  Node MCP server — the V0 email pillar (Gmail-only)
├── core-rust/            Shared Rust core — state machine, reflog, snapshot
│   ├── core/             Pure library
│   └── ffi-node/         napi-rs Node binding (consumed by mcp/ via file:)
├── ios/                  Swift Package skeleton — V1 mobile app foundation
├── docs/                 Product docs — PRD, ADRs, DESIGN, TODO, EVALS
├── vault-view/           Lovable design prototype (gitignored — clone from
│                         github.com/prerna2896/vault-view for design ref)
└── PRD.md                Product Requirements Document (single source of truth
                          for the why)
```

## What lives where

| Layer | Subdir | Status | Tests |
|---|---|---|---|
| Node MCP server (V0) | `mcp/` | shipped | 98 ✅ on both backends |
| Rust core trust primitives (V1) | `core-rust/core/` | state machine + reflog ported | 32 ✅ |
| Node FFI binding (V1) | `core-rust/ffi-node/` | napi-rs cdylib | tested via mcp's matrix |
| iOS app scaffold (V1) | `ios/` | Swift Package skeleton, design system + tab shell + onboarding stub | 5 ✅ |
| Design prototype | `vault-view/` | gitignored | n/a |

## Quick start by sub-project

```bash
# MCP server (V0 — running today)
cd mcp && npm install && npm run auth && npm test

# Rust core (V1 — both natively + via Node binding)
cd core-rust && cargo test

# iOS skeleton (V1 — Swift Package, real Xcode app comes later)
cd ios && swift build && swift test

# Run mcp tests against the Rust backend instead of TS (verifies FFI parity)
cd mcp && npm run test:rust         # uses MAFIA_CORE_BACKEND=rust
cd mcp && npm run test:matrix       # both backends in sequence

# Mock evals → HTML report
cd mcp && npm run eval:mock
open evals/runs/report.html
```

See each sub-project's own README for deeper details.

## Docs

- **`PRD.md`** — product reqs (why we're building this and what the V0/V1+ shape is)
- **`docs/TODO.md`** — living tracker: V0 ✅ / V1 in flight / V2-V4 scope
- **`docs/DESIGN.md`** — design system extracted from the Lovable prototype, source of truth for V1 iOS
- **`docs/LOCAL-TESTING.md`** — V0 acceptance walkthrough on real Gmail
- **`docs/EVALS.md`** — scenario-based eval framework usage
- **`docs/adr/`** — architecture decisions:
  - `ADR-0001` — V0 quarantine + reflog state machine
  - `ADR-0002` — V1 Rust core layout + iOS architecture

## V0 vs V1

**V0 (this repo, shipped):** Node MCP server. Quarantine + reflog + restore on Gmail. 7 tools, hash-chained audit log, OAuth resilience, eval framework, HTML reporter. Runs in Claude Desktop / Claude Code / any MCP host. See `mcp/README.md`.

**V1 (in flight):** Swift iOS app on top of a shared Rust core that the MCP also consumes via FFI. 3 architectural commits landed (per ADR-0002):
1. State machine ported to Rust + napi-rs binding
2. Mafia consumes the binding behind `MAFIA_CORE_BACKEND=rust` — 98 tests pass on both backends
3. Reflog (`verify_chain` + `canonical_json`) ported, with TS↔Rust cross-language consistency tests

Remaining V1 work tracked in `docs/TODO.md`.

## Conventions

- Each sub-project keeps its own `README.md` for setup specifics. This top-level README is just a map.
- `docs/` is shared across all sub-projects. Use absolute repo-relative paths (`docs/TODO.md`) not hard-coded `/Users/...` paths.
- The `vault-view/` directory holds the Lovable design prototype clone. It's gitignored. Re-clone with `git clone git@github.com:prerna2896/vault-view.git vault-view` when you need to view designs.
- Local file: dependencies inside the monorepo use sibling paths — e.g. `mcp/`'s `@mafia/core-node` resolves to `core-rust/ffi-node`.
