# ios/ — Swift Package scaffold for V1 iOS app

Part of the [Mafia monorepo](../README.md). Companion to:

- `../mcp/` — V0 Node MCP server (Gmail)
- `../core-rust/` — Rust core (state machine, reflog) consumed via FFI per ADR-0002
- `../docs/` — shared product docs (PRD, DESIGN, ADRs)

## Why a Swift Package, not an Xcode project?

Right now the dev environment only has Xcode Command Line Tools. A library-only SwiftPM package compiles + tests with just `swift build` / `swift test`.

When full Xcode is installed, open this folder directly — Xcode picks up `Package.swift` and you can:

1. Add an iOS app target inside Xcode.
2. Make the new target depend on the `MafiaApp` library product.
3. The `@main App` in `Sources/MafiaApp/MafiaApp.swift` is the entry point — no extra wiring needed.

## Modules

| Target              | Purpose |
|---------------------|---------|
| `MafiaApp`          | SwiftUI app shell, tab routing, onboarding, screens. |
| `MafiaDesignSystem` | Color tokens, typography, vibe environment, Card / PillButton / SectionLabel primitives. |
| `MafiaCore`         | Stubbed public API for the Rust core (state machine, reflog, snapshot). Replaced by `cargo-lipo` Swift Package binding per ADR-0002. |

## Build + test

```bash
cd ios
swift build
swift test
```

Both must pass. Run from the monorepo root or from this directory.

## What's stubbed

- **Fonts** — Inter + Fraunces aren't bundled; `MafiaFont` returns SwiftUI system fallbacks. Register the font files in `Info.plist` once the Xcode project exists. (See `Sources/MafiaDesignSystem/Typography.swift`.)
- **Rust core** — every `MafiaCore` function returns a hardcoded value. Look for `// TODO(rust-core)` markers; see `Sources/MafiaCore/README.md`.
- **Onboarding** — only step titles + Next/Back. Real per-step content (faux iOS permission dialog, scan animation, first finding) comes later.
- **Tabs** — each tab renders a title card + microcopy. No real data flow yet.

## Design reference

- **`../docs/DESIGN.md`** — source of truth for tokens, copy, components.
- **`../PRD.md`** — §3 pillars, §5 functional reqs, §9 roadmap.
- **`../docs/adr/ADR-0002-rust-core-and-v1-architecture.md`** — Rust core integration plan.

## Next commits

After this scaffold:

1. Add real onboarding step content (mirroring `vault-view`'s `Onboarding.tsx`).
2. Add `MafiaCoreTests` once the first Rust FFI artifact exists.
3. Bundle Inter + Fraunces font files (will require an Xcode project).
4. Build the Vault tab proper (DESIGN.md §7).
