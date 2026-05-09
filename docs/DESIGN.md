# Mafia design — extracted from the Lovable prototype

**Source prototype:** `vault-view/` (gitignored, not part of Mafia commits). Stack: React 19 + TanStack Start + shadcn/ui + Tailwind v4. Run: `cd vault-view && bun run dev` (or `npm run dev`).

This document is the design source of truth for V1's iOS app. Pairs with `PRD.md` (the why) and `docs/TODO.md` (the when).

---

## 1. Design language

### 1.1 Typefaces

| Use | Family | Notes |
|---|---|---|
| Body, UI chrome, numbers | **Inter** 400/500/600/700 | `font-feature-settings: "ss01", "cv11"` — alt single-storey `a` and disambiguated `Il1`. Tabular nums via `.tabnums` class. |
| Headlines, hero numbers | **Fraunces** 400–700, opsz 9–144 | Editorial display serif. `font-optical-sizing: auto`. Italics ON in playful vibe. |

Both via Google Fonts.

### 1.2 Color tokens (oklch)

The palette is **warm and quiet** — amber primary, sage secondary, clay destructive. No cool corporate blues.

| Token | Light value | Use |
|---|---|---|
| `--paper` | `oklch(0.983 0.005 95)` ≈ `#FAFAF7` | App background, off-white |
| `--surface` | `oklch(0.97 0.006 90)` | Inset surfaces, segmented tab tracks |
| `--ink` | `oklch(0.18 0.005 280)` ≈ `#1A1A1A` | Primary text, pill-button bg |
| `--ink-soft` | `oklch(0.45 0.01 280)` | Secondary text, eyebrows |
| `--amber` | `oklch(0.74 0.135 65)` ≈ `#E89B3C` | Primary CTA, key accents |
| `--amber-soft` | `oklch(0.92 0.05 70)` | Tinted backgrounds (purge banner) |
| `--sage` | `oklch(0.81 0.04 130)` ≈ `#B8C5A6` | Secondary, "ok" health, restored state |
| `--sage-soft` | `oklch(0.94 0.025 130)` | Soft tints (insight panels) |
| `--clay` | `oklch(0.62 0.13 30)` ≈ `#C66B5C` | Destructive only (Cancel subscription, errors) |

Dark mode is defined in `styles.css` but the prototype runs light by default.

**Principle:** white cards on warm paper, with thin black/4% rings instead of borders. Soft shadows (`0 2px 24px -12px rgba(0,0,0,0.12)`).

### 1.3 Radii

```
--radius: 0.625rem   // base
sm: -4px  md: -2px  lg: base
xl: +4px  2xl: +8px  3xl: +12px  4xl: +16px
```

In practice: **most cards are `rounded-[20px]` or `rounded-[22px]`**, segmented controls and pills are fully rounded. Phone-frame screen is `rounded-[46px]`.

### 1.4 Spacing rhythm

- Page padding: `px-6` (24px) consistent across screens
- Vertical: `mt-2` to anchor at top, `mt-7`/`mt-9` between major sections, `pb-32` to clear the floating bottom nav
- Card interior: `p-4` to `p-6`
- Tight inline rhythm: `gap-1.5` / `gap-3` / `gap-12px`

### 1.5 Shadows + rings

Cards use **rings + shadows together** for a subtle floating feel:

```css
shadow-[0_2px_24px_-12px_rgba(0,0,0,0.12)]
ring-1 ring-black/[0.04]
```

Bottom nav is `bg-white/85` with `backdrop-blur-xl` — frosted glass over content.

---

## 2. The two vibes

The prototype lets the user toggle the brand feel. This is **product-distinctive** — keep it for V1.

| Vibe | Personality | Implementation |
|---|---|---|
| **Calm** (default) | Quiet, warm, editorial. Amber + sage. Fraunces upright. Plain check / cross icons. | `data-vibe="calm"` |
| **Playful** | Soft, whimsical, slightly fun. Peachy coral + powder blue. Fraunces italic. Emoji + rotation animations on tap. "💖 keep!" / "👋 nah". | `data-vibe="playful"` overrides `--amber`, `--sage`, h1/h2 italic, button transforms |

The toggle lives in **Settings → Vibe** (`VibeToggle` component in `vault-view/src/components/mafia/vibe.tsx`). Recommend porting this to V1 iOS via `@AppStorage` + a SwiftUI environment object.

---

## 3. Information architecture

### 3.1 Bottom tab bar (5 tabs)

| Tab | Purpose | PRD section |
|---|---|---|
| **Home** | Greeting + "this week's invitation" + horizontal scroll of Discoveries | §5.6 (nudges) + §5.2 (discover) |
| **Surfaces** | Connected sources (iCloud Photos, Google Photos, Drive, Gmail, Dropbox) + cross-surface coherence card | §5.1 + §3.1 |
| **Vault** ⭐ | First-class destination; recoverable items grouped by recency; bundle Review flow | §5.4 |
| **Insights** | Cumulative recovered GB + Wrapped-style cards + "this week we learned" | §5.5 |
| **Settings** | Vibe toggle, account, surfaces summary, privacy, vault retention slider, subscription, about | §6 + §12 |

The Vault tab is marked "star" — small amber dot indicator. Reinforces it as the trust pillar's home.

### 3.2 Detail / drilled screens

| Screen | Reached from | What it shows |
|---|---|---|
| **BurstDetail** | Home → "Open burst" Discovery card | Side-by-side: keeper (sage ring) + 10 candidates to vault. "We learn if we got it wrong" copy. |
| **SendersDetail** | Home → "See senders" Discovery card | Top 8 junk senders with stacked bar chart, Review (preview subjects + select) + "Vault all" per sender |

---

## 4. Component inventory

### 4.1 shadcn/ui (style: new-york, slate base, lucide icons)

The prototype installs the full shadcn surface (`vault-view/src/components/ui/`), but actually uses a small subset. Keep the same starter set for any web companion / admin surface; for iOS, port the *patterns*, not the component code.

### 4.2 Mafia-specific components (`vault-view/src/components/mafia/`)

Updated 2026-05-09 — prototype now ~2× the surface area as initial extraction.

| Component | Path | Purpose | iOS port priority |
|---|---|---|---|
| `MafiaApp` | `MafiaApp.tsx` | Tab nav shell + onboarded/signedIn gating via localStorage. Includes a "Replay onboarding" debug badge. | High |
| `PhoneFrame` | `PhoneFrame.tsx` | Marketing wrapper. | Skip |
| `VibeProvider` + `VibeToggle` | `vibe.tsx` | Calm/playful toggle (§2). | High |
| `PhotoViewer` | `PhotoViewer.tsx` | Fullscreen photo, swipe-down dismiss, swipe L/R nav, keyboard arrows, 3-dot menu, **two-finger pinch-zoom (1×–4×) with pan, double-tap to toggle 1×↔2×, zoom badge, auto-reset on photo change**. | High |
| `icons.tsx` | — | Custom stroked icons + Dot. | Medium |
| `data.ts` | — | Mock surfaces, vault items, senders. **`VaultItem` now has optional `snapshot` field** (`from`, `subject`, `date`) for upstream-purged restore. | Reference |
| `Onboarding` | `onboarding/Onboarding.tsx` | 7-rung ladder per §5.0; localStorage-persisted; back-nav guards prevent step skipping. | High |
| `SignIn` | `onboarding/SignIn.tsx` | Apple/Google CTAs + "Restore from another device" via faux QR + 6-digit OTP. | High |
| **State framework** (`_state/`) | | | |
| `EmptyStates` | `_state/EmptyStates.tsx` | `VaultEmpty` (with Learn-how sheet), `SurfacesEmpty`, `InsightsEmpty`, `HomeFirstScan` (animated scanning bar). | High |
| `Failures` | `_state/Failures.tsx` | `SnapshotSheet` (upstream-purged), `ReconnectSheet` (sync lost), `ScopeSheet` (insufficient permissions). | High |
| `Shimmer` | `_state/Shimmer.tsx` | `Shimmer` + `ShimmerCard` skeleton primitives. | Medium |
| `ScopeManager` | `_state/ScopeManager.tsx` | Per-surface scope sheet — Read/Modify/Purge toggles, album-skip chips, danger zone (disconnect). | High |
| `demo.ts` | `_state/demo.ts` | `useEmptyDemo` flag + `useSkeleton(ms)` hook for prototype demos. | Skip |
| **Sheet framework** (`_sheets/`) | | | |
| `Sheets` | `_sheets/Sheets.tsx` | `SheetShell` (bottom-sheet primitive), `ConfirmSheet`, `PaywallSheet`, `CancelSubscriptionSheet`, `EmailPreviewSheet`, `FeedbackSheet`, `WhyVaultedSheet`, `ItemContextMenu`, `useLongPress` hook. | High |
| `SearchVault` | `_sheets/SearchVault.tsx` | Full-screen search overlay; recent chips; cross-surface result rows with inline restore. | High |
| `SurfaceDetail` | `_sheets/SurfaceDetail.tsx` | Per-surface drill-down — storage breakdown bar (Used / Vaulted / Headroom), top senders/folders, last-30d activity. | Medium |
| `ConflictResolution` | `_sheets/ConflictResolution.tsx` | Cross-surface duplicate groups; pick canonical surface per group; **success state with checkmark + Kept/Vaulted/Lost stats panel**; CTA copy adapts to selection progress. | Medium |
| `ConnectionCeremony` | `_sheets/ConnectionCeremony.tsx` | 4-step add-a-new-surface flow that mirrors onboarding rungs 3–6 contextually. | Medium |

### 4.3 Sheet system (added 2026-05-09)

The prototype now uses **bottom sheets as the primary interaction layer** for non-screen-level UI. Pattern:

- `SheetShell` (in both `_sheets/Sheets.tsx` and `_state/Failures.tsx`, slightly duplicated) — fixed overlay, semi-opaque backdrop with backdrop-blur, max-height 88-90%, top drag handle, paper background, rounded-t-[24px].
- `ConfirmSheet` — generic destructive confirmation primitive. Two-button row, clay tone for destructive.
- Sheets stack: paywall, cancel, email preview, feedback, why-vaulted, scope manager, snapshot (upstream-purged), reconnect, scope grant.
- `useLongPress` hook + `ItemContextMenu` — 450ms long-press → contextual menu at touch coordinates. Fallback to right-click contextmenu event.

For iOS port: SwiftUI `.sheet(isPresented:)` with `.presentationDetents([.medium, .large])`. The "drag handle on top" + "rounded-t-24" pattern is exactly Apple's bottom-sheet default.

### 4.4 Repeating UI patterns (port these to iOS)

**Card** — white, rounded-[20px], ring-1 ring-black/4%, soft shadow.
**SectionLabel** — uppercase eyebrow with amber dot prefix, `tracking-[0.14em] text-[10px]`.
**Pill button** — fully rounded, `bg-[var(--ink)] text-white` for primary, `bg-[var(--surface)]` for secondary, `bg-[var(--amber)]` for invitations.
**Hero number** — Fraunces, `text-[72px]`, `tabnums`, paired with smaller unit suffix in `--ink-soft`.
**Segmented control** — pill track, `bg-[var(--surface)]`, active pill `bg-white shadow-sm`.
**Bundle Review** — list expansion within a card row (Vault + SendersDetail share this pattern).
**Visual Swipe / Grid toggle** — for image bundles, swipe-to-decide auto-advances; grid is "see all" overview.

---

## 5. Microcopy library

These strings appear repeatedly and define the brand voice. **Use them verbatim in V1.**

| Where | Copy |
|---|---|
| Footer of Home, Vault, BurstDetail | *"We never permanently delete without you."* |
| Vault subtitle | *"Recoverable for 30 days. Nothing here is gone."* |
| Surfaces subtitle | *"One library, many places. Sync stays read-only unless you say otherwise."* |
| Surfaces footer | *"Mafia treats one photo across surfaces as one entity."* |
| Insights subtitle | *"Cumulative, not streaks. We learn from what you keep."* |
| Insights footer | *"No streaks. No pressure. Just signal."* |
| Settings subtitle | *"Quiet by design. On-device by default."* |
| Settings footer | *"Mafia · cross-surface, reversible, quiet."* |
| Purge warning banner | *"47 items purging in 3 days · Anything you'd like to keep?"* |
| Purge confirmation | *"Vaulted N items · Recoverable for 30 days."* |
| Cancel subscription row | *"Top-level. Always one tap away."* (PRD §12 promise) |
| Burst learning panel | *"You usually keep the sharpest. Let us know if we got it wrong — we learn."* |
| Insight learning panel | *"You vault DoorDash receipts but keep Airbnb ones. We'll stop suggesting Airbnb."* |
| Senders detail headline | *"18 senders are responsible for 73% of your unread."* |

The voice is **second person, gentle, never hectoring**. Numbers are specific and verifiable. No emoji in calm vibe; opt-in emoji in playful vibe.

---

## 6. Three-archetype invitation card (Home)

Direct implementation of PRD §5.6 + UX-expert SF-1. The invitation card on Home cycles through three states:

| Archetype | Trigger | Sample copy | Sample CTA |
|---|---|---|---|
| **Spark** | Charging + Wi-Fi + idle, no storage pressure | *"Want to see the 6 best shots from your Goa trip?"* | "Show me ✨" |
| **Facilitator** | Storage pressure (>90% full) | *"Free 4 GB right now. One tap, Vault keeps a copy."* — with usage progress bar | "Free 4 GB" |
| **Just-in-time** | Post-burst-shoot detected | *"Pick your favorite from the last burst?"* — with thumbnail filmstrip, sharpest highlighted | "Pick keeper" |

Cycle button (top-right Refresh icon) is for prototype/demo only. In V1, the system picks based on context.

---

## 7. Vault deep-dive

The prototype's Vault is the most-developed screen and shows the trust pillar realized as UI:

### 7.1 Top of screen
- Headline `Vault` (Fraunces 34px) + subtitle `"Recoverable for 30 days. Nothing here is gone."`
- **Purge warning banner**: amber tinted, with a `3d` clock chip, "47 items purging in 3 days · Anything you'd like to keep?" + Review CTA
- **Segmented control**: All / Photos / Emails / Files

### 7.2 Item rows
Grouped by recency (Today / Yesterday / 3 days ago). Each row:
- Thumbnail (or kind glyph: ✉ ◫ ▦)
- Title + subtitle
- "From <surface>" pill + "Nd left" countdown
- "Review" button (for bundle items — multiple sub-items inside)
- "Restore" / "Restore all" pill (becomes "Restored" sage state on click)

### 7.3 Review expansion (bundle items)
Embedded sub-list within the row card. Two view modes for visual bundles:

- **Swipe view** — single image, prev/next, keep/skip buttons auto-advance, filmstrip at bottom showing decisions ("Tinder for photos")
- **Grid view** — 3-col thumbnails, tap to toggle selection

For non-visual bundles (newsletter digests, receipts) — vertical list with checkbox + label + date.

### 7.4 Selection chrome
- "Select all" / "Clear" toggle in header
- Counter "N of M selected"
- "Restore selected" CTA (disabled until selection > 0)

### 7.5 Toasts on action
`sonner` package — bottom-center: `"Restored 8 of 11 to iCloud Photos"`. Distinct toasts for vault, restore, purge.

---

## 8. Insights deep-dive

Replaces streaks per PRD §5.5 + UX-expert MF-4. Three layers:

1. **Hero card** — large recovered GB number, "across N months · M entities", + 3-up sub-stats (Protected / Vaulted / Lost = 0)
2. **Wrapped-style horizontal scroll** — 4 cards in distinct tones (ink / amber / sage), Spotify-Wrapped energy: "Protection · 1,847 photos protected", "Top sender · LinkedIn · 412 vaulted", `94%` coherence, "We learned: Group shots — you tend to keep these"
3. **"This week we learned…" panel** — sage-soft tinted, Fraunces headline summarizing a learned exception ("You vault DoorDash receipts but keep Airbnb ones. We'll stop suggesting Airbnb."). Footer: "Adjusted on Tuesday · 22 future nudges saved."

The third layer is the PRD §3.2 pattern-learning surface — proves the system actually adapts, in user-visible language.

---

## 9. PRD feature mapping

Updated 2026-05-09. Cross-checked against `vault-view/` HEAD `75ca821`.

| PRD section | In prototype | Status |
|---|---|---|
| §5.0 Onboarding ladder | ✅ fully | 7-step `Onboarding.tsx` matches PRD spec exactly; localStorage-persisted; replay debug badge. |
| §5.0a Aha moment | ✅ fully | Onboarding step 6 + Home Discoveries + BurstDetail. Three angles realized. |
| §5.1 Connect (sources) | ✅ | Surfaces tab + ConnectionCeremony 4-step add flow + ScopeManager per-surface sheet. |
| §5.2 Discover | ✅ | Home Discoveries scroll + SendersDetail + BurstDetail. SearchVault adds cross-surface lookup. |
| §5.3 Decide / rules | ✅ | Bundle Review (Vault, SendersDetail), `WhyVaultedSheet` (rule provenance), Insights now has **editable allowlist** with [×] removable chips + "+ Teach a new preference" inline form. |
| §5.4 Vault | ✅ fully | First-class tab; Review with Swipe/Grid; long-press → ItemContextMenu (Restore / Why / Find similar / Share / Permanent purge). |
| §5.5 Reflect / Insights | ✅ fully | Wrapped-style cards + "this week we learned" panel + editable allowlist (see §5.3). |
| §5.6 Nudges | ⚠️ partial | Three-archetype invitation card on Home ✅. **Notification / Live Activity / widget mockups still missing.** |
| §5.7 Agent surface (MCP) | n/a | UI prototype scope; covered by Mafia |
| §6.2 Read-only-first | ✅ | Onboarding step 3 pre-prompt + step 7 explicit grant; ScopeManager exposes ongoing toggle. |
| §10 Account / sign-in | ✅ | Apple + Google + Restore-from-device. |
| §12 Monetization (anti-dark-pattern promises) | ✅ | PaywallSheet + CancelSubscriptionSheet + EmailPreviewSheet — all four promises are visualized. |

UX-expert findings status:
- **MF-1** Vault as a felt place ✅
- **MF-2** Onboarding ladder ✅
- **MF-3** First-session aha ✅ (onboarding step 6 + BurstDetail + SendersDetail)
- **MF-4** Investment over streaks ✅
- **SF-1** Three nudge archetypes ✅ (Spark/Facilitator/JIT cycling on Home)
- **SF-3** Vault top-level tab + weekly purge banner ✅
- **SF-4** Testable monetization commitments ✅ (PaywallSheet copy)
- **SF-6** First false-positive UX ✅ (Bundle Review, ItemContextMenu, WhyVaultedSheet)

---

## 10. What the prototype invented (keep)

These are *not* in the PRD verbatim but emerged in the prototype. Worth keeping for V1:

1. **Calm / Playful vibe toggle** — gives the user agency over the brand feel. Strong product-distinctive feature; competitors don't do this.
2. **Cross-surface coherence number** — "Photos and Drive are 94% deduped relative to each other." Visualizes the cross-surface entity graph as a single tractable metric. Goes in Surfaces tab.
3. **"This week we learned" reflection panel** — surfaces the allowlist-learning loop in plain language. Makes the personalization visible (and earns trust each time).
4. **Wrapped-style insight cards** — Spotify Wrapped emotional register applied to data tidying. Highly shareable.
5. **Bundle Review with Swipe/Grid toggle** — different cognitive modes for the same action. Swipe for fast triage, Grid for overview.
6. **Sender-pattern surface** — "18 senders = 73% of unread" with stacked bar chart + per-sender Review + Vault all. Direct realization of PRD's Phase 0 aha moment, ported to mobile.

---

## 11. What's still missing (build for V1)

After the 2026-05-09 prototype refresh #2, only one design gap remains:

1. **Notification / Live Activity / widget mockups** — Tier 2 #7. The system-level surfaces of PRD §5.6 nudges (lock-screen notification "Vault purging in 3 days", Dynamic Island scan progress, home-screen widget) aren't drawn yet. Mockups, not implementation — these can be drawn directly in Figma if Lovable is awkward for OS-chrome work.

Implementation-level (not really a design gap):

- **Pull-to-refresh** affordance — standard iOS pattern, no design needed.

**Otherwise the prototype is design-complete for V1 iOS implementation.** Closed since last validation: pinch-zoom in `PhotoViewer`, conflict-resolution success state with stats panel, allowlist editor in Insights.

---

## 12. Implementation notes for V1 iOS

### 12.1 Stack recommendation
- **SwiftUI + Observation** for all UI (no UIKit unless forced for a specific component)
- **PhotoKit** for iCloud Photos
- **BackgroundTasks** for charging-idle scans
- **WidgetKit + ActivityKit** for Live Activity nudges (PRD §5.6)
- **App Intents** for "Run weekly review" Shortcut (per PRD NH-3)

### 12.2 Storage / FFI
- The Rust core (ADR-0002) owns all state machine + reflog logic
- iOS side calls Rust via Swift Package wrapping `cargo lipo` artifact
- SQLite via the Rust core (`rusqlite`); iOS does not duplicate the schema
- SwiftData *only* for ephemeral UI state if needed — never for trust-critical data

### 12.3 Color / type
Port the oklch palette to a SwiftUI `Color` extension. Use `Color(.displayP3, ...)` form for fidelity. Use the system `font(.custom("Fraunces", ...))` and `Inter` registered via `Info.plist`.

### 12.4 Animation
- Soft spring on tab switch
- `.scaleEffect(0.97)` press feedback on every CTA (matches `active:scale-[0.97]` web pattern)
- Playful vibe rotation on tap: `.rotationEffect(±2°)` while pressed

### 12.5 Accessibility (must-have for V1)
- Min 17pt body, 28pt+ headlines (Fraunces); never below 11pt for tertiary
- VoiceOver labels on all icons
- Dynamic Type support (the current prototype uses fixed pixel sizes — bad practice for native)
- Reduce Motion fallback for the playful rotation animation

### 12.6 Performance budget
- Cold launch < 1.5s on iPhone 13+
- Vault scroll: 60fps with 5,000 items (use `LazyVStack`)
- Photo thumbnail prefetch via `PHCachingImageManager`

---

## 13. How to use this doc

- **For design iteration:** the prototype is the source. Update `vault-view/` first, then update relevant sections here.
- **For V1 iOS implementation:** read sections 1, 2, 4, 5, 11, 12 before starting; the rest is reference.
- **For copywriting:** §5 is the authoritative voice/copy library. Don't write new copy without checking it against existing patterns.
- **For PRD decisions:** §9 keeps the prototype↔PRD mapping honest as both evolve.

When the prototype changes meaningfully, regenerate this doc by re-reading `vault-view/src/components/mafia/` and updating the affected sections. The mapping in §9 should be the diff anchor.
