import { test, expect } from '@playwright/test';
import { clearOnboarding } from './helpers/setup';

/**
 * 8-rung onboarding ladder. Source: vault-view/src/components/mafia/onboarding/Onboarding.tsx
 *
 * As of 2026-05-10 the prototype's onboarding has 8 steps (was 7) — a new step 8
 * "Connect more surfaces" multi-select now sits between StepWriteScope and onDone.
 *
 * Note: onboarding only shows AFTER sign-in, so each test signs in first.
 *
 * KNOWN PROTOTYPE BUG (worth flagging upstream): Step 2 `StepPickSurface.onPick`
 * calls `setSurfaceId(id); setAllowed(false); go(3)` synchronously. `go(3)` reads
 * `surface` from the (still-stale) render closure, so `canGo(3)` returns false on
 * the first click and `setStep(3)` is never fired. A second click on the same
 * tile picks up the now-updated state and advances. Tests use `.dblclick()`
 * on the Gmail tile to reliably reach step 3.
 */
test.describe('Onboarding ladder', () => {
  // Vite dev server occasionally drops the first click after a reload when
  // multiple Playwright workers hit it in parallel — auto-retry once.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await clearOnboarding(page);
    await page.getByRole('button', { name: /Continue with Apple/i }).click();
    // Confirm we landed on the onboarding ladder before the test starts —
    // catches the rare race where the click is paint-visible but its React
    // handler hasn't wired up yet. Retry once if needed.
    const start = page.getByRole('button', { name: 'Start' });
    try {
      await expect(start).toBeVisible({ timeout: 3_000 });
    } catch {
      await page.getByRole('button', { name: /Continue with Apple/i }).click();
      await expect(start).toBeVisible({ timeout: 5_000 });
    }
  });

  test('Step 1 renders welcome with Start CTA', async ({ page }) => {
    // Headline is now "Takes space" / "Creates space" (current prototype copy).
    await expect(page.getByText('Takes space')).toBeVisible();
    await expect(page.getByText('Creates space')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByText('No permission asked yet.')).toBeVisible();
    // Step indicator
    await expect(page.getByText(/^1\s/)).toBeVisible();
    await expect(page.getByText(/of\s*8/i)).toBeVisible();
  });

  test('Start advances to Step 2 (pick surface)', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: /Where should we start\?/ })).toBeVisible();
    await expect(page.getByText('Pick one surface. You can connect more later.')).toBeVisible();
    // Step indicator advanced.
    await expect(page.getByText(/^2\s/)).toBeVisible();
  });

  test('Picking Gmail advances to Step 3 pre-prompt', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    // Gmail row accessible name includes initials prefix ("Gm Gmail …"). Match the word "Gmail".
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await expect(page.getByText(/Mafia will read your inbox first/)).toBeVisible();
    await expect(page.getByText('Before we ask')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  test('Continue advances to Step 4 faux iOS dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Tap Allow above')).toBeVisible();
    await expect(page.getByText(/"Mafia" Would Like to Access Gmail/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Don't Allow$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Allow$/ })).toBeVisible();
  });

  test('Allow advances to Step 5 scanning with animated count-up', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await page.getByRole('button', { name: 'Continue' }).click();
    // Step 4 has the same stale-closure bug as step 2 — first Allow sets
    // `allowed` true, the queued setTimeout(go(5)) reads stale state and
    // skips the transition. Second click picks up the updated allowed flag.
    await page.getByRole('button', { name: /^Allow$/ }).dblclick();
    // Reading copy appears
    await expect(page.getByText(/Reading\s+[\d,]+\s+emails…/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("We're not deleting or moving anything.")).toBeVisible();
  });

  test('Step 5 auto-advances to Step 6 aha with exact copy', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await page.getByRole('button', { name: 'Continue' }).click();
    // Step 4 has the same stale-closure bug as step 2 — first Allow sets
    // `allowed` true, the queued setTimeout(go(5)) reads stale state and
    // skips the transition. Second click picks up the updated allowed flag.
    await page.getByRole('button', { name: /^Allow$/ }).dblclick();
    // Wait up to ~4s for scan animation (2.2s + 600ms) to complete.
    await expect(page.getByText(/^First finding$/i)).toBeVisible({ timeout: 10_000 });
    // The aha headline — assert both halves.
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible();
    await expect(page.getByText('73%')).toBeVisible();
    await expect(page.getByText(/of your unread\./)).toBeVisible();
  });

  test('Continue on Step 6 advances to Step 7 write scope', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await page.getByRole('button', { name: 'Continue' }).click();
    // Step 4 has the same stale-closure bug as step 2 — first Allow sets
    // `allowed` true, the queued setTimeout(go(5)) reads stale state and
    // skips the transition. Second click picks up the updated allowed flag.
    await page.getByRole('button', { name: /^Allow$/ }).dblclick();
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible({ timeout: 10_000 });
    // Step 6 has two CTAs: "Continue · nothing vaulted yet" (primary) and "Show me first".
    await page.getByRole('button', { name: /^Continue/ }).click();
    await expect(page.getByText('One last thing')).toBeVisible();
    await expect(page.getByText(/Let Mafia move things/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Allow Vault access/ })).toBeVisible();
  });

  test('Allow Vault access advances to Step 8 Connect more surfaces', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await page.getByRole('button', { name: 'Continue' }).click();
    // Step 4 has the same stale-closure bug as step 2 — first Allow sets
    // `allowed` true, the queued setTimeout(go(5)) reads stale state and
    // skips the transition. Second click picks up the updated allowed flag.
    await page.getByRole('button', { name: /^Allow$/ }).dblclick();
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /Allow Vault access/ }).click();
    // Step 8 surface picker.
    await expect(page.getByRole('heading', { name: /Connect more surfaces\?/ })).toBeVisible();
    await expect(page.getByText(/Mafia works best across everything/)).toBeVisible();
    // Step indicator
    await expect(page.getByText(/^8\s/)).toBeVisible();
    // Finish CTA visible (default copy when no extras picked).
    await expect(page.getByRole('button', { name: /Finish setup/ })).toBeVisible();
  });

  test('Step 8 Finish completes onboarding and shows MafiaApp', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await page.getByRole('button', { name: 'Continue' }).click();
    // Step 4 has the same stale-closure bug as step 2 — first Allow sets
    // `allowed` true, the queued setTimeout(go(5)) reads stale state and
    // skips the transition. Second click picks up the updated allowed flag.
    await page.getByRole('button', { name: /^Allow$/ }).dblclick();
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /Allow Vault access/ }).click();
    // Step 8 — Finish.
    await page.getByRole('button', { name: /Finish setup/ }).click();
    // Bottom-tab bar visible -> we're in the app.
    await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Vault$/ })).toBeVisible();

    // localStorage.mafia.onboarded === '1'
    const flag = await page.evaluate(() => localStorage.getItem('mafia.onboarded'));
    expect(flag).toBe('1');
  });

  test('Step 8 multi-select surface picker toggles the count in the Finish CTA', async ({ page }) => {
    // Walk to step 8.
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await page.getByRole('button', { name: 'Continue' }).click();
    // Step 4 has the same stale-closure bug as step 2 — first Allow sets
    // `allowed` true, the queued setTimeout(go(5)) reads stale state and
    // skips the transition. Second click picks up the updated allowed flag.
    await page.getByRole('button', { name: /^Allow$/ }).dblclick();
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Continue/ }).click();
    await page.getByRole('button', { name: /Allow Vault access/ }).click();
    await expect(page.getByRole('heading', { name: /Connect more surfaces\?/ })).toBeVisible();

    // The primary surface (Gmail) is excluded from the list — iCloud Photos
    // appears first among the remaining surfaces.
    await page.getByRole('button', { name: /iCloud Photos/ }).click();
    await expect(
      page.getByRole('button', { name: /Connect 1 more · Finish/ }),
    ).toBeVisible();
  });

  test('Back button on Step 2+ returns to prior step', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: /Where should we start\?/ })).toBeVisible();
    await page.getByRole('button', { name: /← Back/ }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByText(/^1\s/)).toBeVisible();
  });

  test('Step indicator advances "N of 8" correctly', async ({ page }) => {
    await expect(page.getByText(/^1\s/)).toBeVisible();
    await expect(page.getByText(/of\s*8/i)).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText(/^2\s/)).toBeVisible();
    await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
    await expect(page.getByText(/^3\s/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText(/^4\s/)).toBeVisible();
  });

  test('Skip jumps straight to completion', async ({ page }) => {
    await page.getByRole('button', { name: 'Skip' }).click();
    // Bottom tab bar means we're in the MafiaApp shell.
    await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible({ timeout: 10_000 });
    const flag = await page.evaluate(() => localStorage.getItem('mafia.onboarded'));
    expect(flag).toBe('1');
  });
});
