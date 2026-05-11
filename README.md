# mafia-core-rust

Cross-platform trust primitives for Mafia — state machine, reflog, snapshot store. Single source of truth that the Mafia Node MCP server and the V1 iOS app both consume via FFI.

See [ADR-0002 in the Mafia repo](https://github.com/prerna2896/Mafia/blob/main/docs/adr/ADR-0002-rust-core-and-v1-architecture.md) for the architectural plan.

## Workspace layout

```
mafia-core-rust/
├── Cargo.toml          # workspace root
├── core/               # pure Rust: state machine (Commit 1), reflog (Commit 3), snapshot (later)
│   ├── src/
│   └── tests/          # fixture tests mirroring Mafia/tests/state-machine.test.ts
├── ffi-node/           # napi-rs binding — produces an index.node consumed by Mafia
│   ├── src/lib.rs
│   ├── build.rs
│   └── (package.json + napi config added in V1 Commit 2)
└── ffi-ios/            # cargo-lipo Swift Package binding (added when V1 iOS work begins)
```

## Build + test

```bash
# Build everything
cargo build

# Run the core crate's fixture tests (17 currently — must match Mafia TS tests)
cargo test -p mafia-core

# Build the Node binding's cdylib (for napi-rs CLI to package as .node)
cargo build -p mafia-core-node --release
```

## Producing the Node `index.node`

In V1 Commit 2 (the Mafia side), we'll add:
- `ffi-node/package.json` with `@napi-rs/cli` as a dev-dep
- `napi build --release` script that produces `index.node`
- A symlink or workspace pointer so Mafia (`/Users/prernaagarwal/wonder/Mafia/`) can `import { nextState } from "@mafia/core-node"`

Until then the binding is Rust-side only — tests prove it compiles and the API surface matches the spec.

## Versioning

This crate's version is the source of truth. Mafia pins to it via `@mafia/core-node` semver. Bump the workspace `version` in root `Cargo.toml` for any breaking change in the FFI surface.

## Lint config

- `unsafe_code = "forbid"` workspace-wide — the core is pure safe Rust
- Clippy `pedantic` is on with `module_name_repetitions` + `must_use_candidate` muted

## Status

V1 Commit 1 (state machine) — done. 17 tests passing. FFI binding compiles to cdylib.

Next: Commit 2 (wire into Mafia, run TS tests against both backends), then Commit 3 (port `verify_chain` + `canonical_json`).
