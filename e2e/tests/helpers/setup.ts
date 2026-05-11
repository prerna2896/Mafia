import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Clear all onboarding/sign-in localStorage flags and reload so the app
 * starts from the very first screen (SignIn).
 */
export async function clearOnboarding(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.removeItem('mafia.onboarded');
      localStorage.removeItem('mafia.signedIn');
    } catch {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Give Vite + React time to fully hydrate the SignIn screen before the
  // test interacts — without this, parallel-spec runs occasionally observe
  // the first click being absorbed by a not-yet-bound listener and the
  // state update silently dropped.
  await expect(page.getByRole('button', { name: /Continue with Apple/i })).toBeVisible({
    timeout: 10_000,
  });
  // Belt-and-braces: ensure no transient overlay is still mounted from a
  // prior test (rare HMR artifact).
  await page.waitForFunction(() => document.readyState === 'complete');
  // A short settle pause smooths over a race where React 19 finishes
  // mounting after the button is paint-visible but before its onClick is
  // wired — without this we see flaky "click registered, state didn't
  // change" failures on the first sign-in click of a run.
  await page.waitForTimeout(120);
}

/**
 * Stamp both flags as completed and reload — used to short-circuit to the
 * main MafiaApp shell.
 */
export async function fastForwardToApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.setItem('mafia.signedIn', '1');
      localStorage.setItem('mafia.onboarded', '1');
    } catch {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  // Wait for the bottom tab bar to appear (means we're in the shell).
  await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible({ timeout: 10_000 });
}

/**
 * Click "Continue with Apple" on the sign-in screen, leaving us on the
 * first onboarding step.
 */
export async function signIn(page: Page) {
  await expect(page.getByRole('button', { name: /Continue with Apple/i })).toBeVisible();
  await page.getByRole('button', { name: /Continue with Apple/i }).click();
}

/**
 * Walk through the entire 8-step onboarding ladder honestly using the
 * Gmail surface (so we get the "18 senders are responsible for 73%"
 * aha copy).
 */
export async function walkOnboardingFully(page: Page) {
  // Step 1
  await page.getByRole('button', { name: 'Start' }).click();
  // Step 2 — pick Gmail. NB: the prototype has a known state-batching bug
  // where the first click sets surfaceId but go(3) reads stale state; a
  // second click on the same tile is needed to actually advance. See the
  // commit message + onboarding.spec.ts header note.
  await page.getByRole('button', { name: /Gmail/ }).first().dblclick();
  // Step 3
  await page.getByRole('button', { name: 'Continue' }).click();
  // Step 4 — faux iOS Allow. Same stale-closure bug as step 2 (see note in
  // onboarding.spec.ts header): the second click is what actually advances.
  await page.getByRole('button', { name: /^Allow$/ }).dblclick();
  // Step 5 — scanning auto-advances; wait for step 6 aha copy
  await expect(page.getByText(/18 senders are responsible for/)).toBeVisible({ timeout: 10_000 });
  // Step 6 — primary CTA is "Continue · nothing vaulted yet"
  await page.getByRole('button', { name: /^Continue/ }).click();
  // Step 7 — write scope
  await page.getByRole('button', { name: /Allow Vault access/ }).click();
  // Step 8 — Connect more surfaces (Finish setup)
  await page.getByRole('button', { name: /Finish setup/ }).click();
  // Land in the app
  await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible({ timeout: 10_000 });
}

/**
 * Quickly skip onboarding for tests that don't care about the ladder.
 * Uses the "Skip" link in the top-right corner of the onboarding shell.
 */
export async function skipOnboarding(page: Page) {
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible({ timeout: 10_000 });
}

/**
 * Click a bottom-tab by its accessible name (Home, Surfaces, Vault,
 * Insights, Settings).
 */
export async function openTab(page: Page, name: 'Home' | 'Surfaces' | 'Vault' | 'Insights' | 'Settings') {
  await page.getByRole('button', { name: new RegExp(`^${name}$`) }).click();
}

/**
 * Bring the prototype to "signed in + onboarded" state quickly for tests
 * that just need to exercise the main app shell.
 */
export async function bootApp(page: Page) {
  await fastForwardToApp(page);
}
