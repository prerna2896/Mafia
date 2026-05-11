# MafiaCore

Swift-side facade for the Rust core engine (PRD §7.1, ADR-0002).

## Current status — STUB

Every function in `MafiaCore.swift` is a hardcoded Swift implementation.
Look for `// TODO(rust-core)` comments — each marks a function that will be
replaced by an FFI call into the Rust crate at
`/Users/prernaagarwal/wonder/mafia-core-rust/`.

## Replacement plan

When Rust commits 1–3 of ADR-0002 ship:

1. The Rust workspace produces a static / dynamic library via `cargo-lipo`
   (universal: arm64 device + arm64/x86_64 simulator).
2. We add an `.xcframework` (or a binary Swift Package target) wrapping the
   library + bridging header.
3. `MafiaCore.swift` becomes thin Swift wrappers that marshall types across the
   FFI boundary (`@_silgen_name`-style externs or generated via `swift-bridge` /
   `uniffi-rs`).
4. The `Tests/MafiaCoreTests` (not yet created) will run the same fixture
   files Mafia's TS tests use, asserting cross-language consistency.

## API surface today

| Symbol            | Rust equivalent (ADR-0002 commit) |
|-------------------|-----------------------------------|
| `nextState`       | `core::state_machine::next_state` (commit 1) |
| `verifyChain`     | `core::reflog::verify_chain`      (commit 3) |
| `contentId`       | `core::snapshot::content_id`      (commit 3) |
| `stats`           | derived from reflog               (commit 5) |

## Why a stub is fine right now

Per ADR-0002 §"iOS app starts after step 3", the iOS UI scaffolding can begin
in parallel with the Rust port — we just keep the Swift signatures stable so
the eventual swap is mechanical.
