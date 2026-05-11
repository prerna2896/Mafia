# Mafia e2e tests

Playwright end-to-end tests for the `vault-view` Lovable prototype.

Mirrors Ikigai's Playwright config pattern: dedicated `e2e/` package, auto-spinning
`webServer`, single chromium project, semantic locators, and the same trace /
screenshot / video policy.

## Prerequisites

The `vault-view/` prototype is intentionally gitignored at the repo root, so
you must clone it manually before running tests:

```bash
cd /path/to/Mafia
git clone git@github.com:prerna2896/vault-view.git vault-view
cd vault-view && (bun install || npm install)
```

The dev server runs on `http://localhost:8080` (the sandbox-enforced Lovable
port). Playwright will auto-start it via `webServer`.

## Setup

```bash
cd e2e
npm install
npx playwright install chromium
```

## Run

```bash
npm test                  # full suite, headless
npm run test:ui           # Playwright UI mode
npm run test:headed       # full suite with browser visible
npm run test:report       # open last HTML report
```

Run a single file:

```bash
npx playwright test tests/onboarding.spec.ts
```

## Suites

| Spec | Covers |
|------|--------|
| `onboarding.spec.ts` | 7-rung onboarding ladder: welcome → pick surface → pre-prompt → faux iOS dialog → scanning → aha (18 senders / 73%) → write scope. Validates step indicator, back, skip, and the `mafia.onboarded` localStorage flag. |
| `sign-in.spec.ts` | Apple + Google sign-in buttons set `mafia.signedIn` and advance to onboarding. Restore-from-another-device flow: 6-digit OTP focus advancement, button enabled only when filled. |
| `tab-navigation.spec.ts` | All 5 tabs visible after onboarding (Home, Surfaces, Vault, Insights, Settings). Vault has the small amber star dot. Each loads with its Fraunces header. |
| `vibe-toggle.spec.ts` | Settings → Vibe toggle flips `data-vibe` on `.mafia-root` between `calm` (default) and `playful`. Subline copy updates. |
| `home.spec.ts` | Greeting, "This week's invitation" card cycling through Spark / Facilitator / JIT (with the three exact headlines), Discoveries scroller, Open burst + See senders nav, footer copy. |
| `vault.spec.ts` | Vault title + subtitle, purge banner (47 items · 3 days), segmented filter (All/Photos/Emails/Files), Review expand, sub-item checkboxes + Select all / Clear, Restore selected enablement, single-item Restore → Restored, Swipe / See all toggle, swipe Keep / Skip auto-advance. |
| `surfaces.spec.ts` | Title + subtitle, the 5 surface rows (iCloud / Google Photos / Drive / Gmail / Dropbox), Dropbox "Not connected" + Add, coherence card 94% deduped copy, 3-stat grid 12,847 / 1,204 / 76. |
| `insights.spec.ts` | Hero "47 GB", 3-up Protected/Vaulted/Lost, the four Wrapped cards, "This week we learned…" panel, allowlist chips remove + "+ Teach a new preference" add flow including empty-input no-op. |
| `settings.spec.ts` | Title + subtitle, Vault retention slider default 30 + drag, "Cancel subscription" row clay-toned, "On-device by default" pill sage "On", footer. |
| `details.spec.ts` | BurstDetail copy ("We picked this one — sharpest, eyes open."), keeper + 10 vault candidates, Keep all / Move 10 to Vault. SendersDetail "18 senders are responsible for 73%", 8 sender rows, Review opens inline subject list. |
| `sheets.spec.ts` | Paywall sheet from Settings demo trigger (5-row comparison table, 7-day-trial CTA, "Cancel anytime in 2 taps" footer), Cancel subscription sheet, Email Preview sheet, Feedback sheet (Send disabled until non-empty + show payload), Why Vaulted (via long-press on a Vault item). |

## Helpers

`tests/helpers/setup.ts` provides:

- `clearOnboarding(page)` — clears `mafia.onboarded` + `mafia.signedIn` + reloads.
- `signIn(page)` — clicks "Continue with Apple" if on sign-in screen.
- `completeOnboarding(page)` — runs through the 7-step ladder using the "Skip" button when convenient.
- `walkOnboardingFully(page)` — runs through every step honestly (used by onboarding.spec).
- `openTab(page, name)` — clicks the bottom-tab by accessible name.

## Notes

- `webServer.reuseExistingServer` is `true` outside CI; if the dev server is
  already up, Playwright reuses it rather than spinning a new one.
- The prototype's app shell is rendered inside a `PhoneFrame` div on
  desktop — locators rely on accessible role/text, not on viewport-specific
  styles, so the same selectors work in mobile + desktop.
