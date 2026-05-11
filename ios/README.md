# mafia-ios

Swift Package scaffold for the V1 iOS app of the **Mafia** cross-surface
cleanup product. Companion to:

- `/Users/prernaagarwal/wonder/Mafia/` — the V0 MCP server + product docs
  (PRD, DESIGN, ADRs).
- `/Users/prernaagarwal/wonder/mafia-core-rust/` — the Rust core engine
  consumed via FFI (per ADR-0002).

## Why a Swift Package, not an Xcode project?

The user only has Xcode Command Line Tools right now. A library-only
SwiftPM package compiles + tests with just `swift build` / `swift test`.

When Xcode is installed, open this folder directly — Xcode picks up
`Package.swift` and you can:

1. Add an iOS app target inside Xcode.
2. Make the new target depend on the `MafiaApp` library product.
3. The `@main App` in `Sources/MafiaApp/MafiaApp.swift` is the entry
   point — no extra wiring needed.

## Modules

| Target              | Purpose |
|---------------------|---------|
| `MafiaApp`          | SwiftUI app shell, tab routing, onboarding, screens. |
| `MafiaDesignSystem` | Color tokens, typography, vibe environment, Card / PillButton / SectionLabel primitives. |
| `MafiaCore`         | Stubbed public API for the Rust core (state machine, reflog, snapshot). Replaced by `cargo-lipo` Swift Package binding per ADR-0002. |

## Build + test

```bash
cd /Users/prernaagarwal/wonder/mafia-ios
swift build
swift test
```

Both must pass.

## What's stubbed

- **Fonts** — Inter + Fraunces aren't bundled; `MafiaFont` returns SwiftUI
  system fallbacks. Register the font files in `Info.plist` once the Xcode
  project exists. (See `Sources/MafiaDesignSystem/Typography.swift`.)
- **Rust core** — every `MafiaCore` function returns a hardcoded value.
  Look for `// TODO(rust-core)` markers; see `Sources/MafiaCore/README.md`.
- **Onboarding** — only step titles + Next/Back. Real per-step content
  (faux iOS permission dialog, scan animation, first finding) comes later.
- **Tabs** — each tab renders a title card + microcopy. No real data flow yet.

## Design reference

- DESIGN.md (`/Users/prernaagarwal/wonder/Mafia/docs/DESIGN.md`) — source of
  truth for tokens, copy, components.
- PRD.md (`/Users/prernaagarwal/wonder/Mafia/PRD.md`) — §3 pillars, §5
  functional reqs, §9 roadmap.
- ADR-0002 — Rust core integration plan.

## Next commits

After this scaffold:

1. Add real onboarding step content (mirroring `Onboarding.tsx`).
2. Add `MafiaCoreTests` once the first Rust FFI artifact exists.
3. Bundle Inter + Fraunces font files (will require an Xcode project).
4. Build the Vault tab proper (DESIGN.md §7).
