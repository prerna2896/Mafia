import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Clear all onboarding/sign-in localStorage flags and reload so the app
 * starts from the very first screen (SignIn).
 */
export async function clearOnboarding(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.removeItem('mafia.onboarded');
      localStorage.removeItem('mafia.signedIn');
    } catch {}
  });
  await page.reload();
}

/**
 * Stamp both flags as completed and reload — used to short-circuit to the
 * main MafiaApp shell.
 */
export async function fastForwardToApp(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.setItem('mafia.signedIn', '1');
      localStorage.setItem('mafia.onboarded', '1');
    } catch {}
  });
  await page.reload();
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
 * Walk through the entire 7-step onboarding ladder honestly using the
 * Gmail surface (so we get the "18 senders are responsible for 73%"
 * aha copy).
 */
export async function walkOnboardingFully(page: Page) {
  // Step 1
  await page.getByRole('button', { name: 'Start' }).click();
  // Step 2 — pick Gmail
  await page.getByRole('button', { name: /^Gmail/ }).click();
  // Step 3
  await page.getByRole('button', { name: 'Continue' }).click();
  // Step 4 — faux iOS Allow
  await page.getByRole('button', { name: /^Allow$/ }).click();
  // Step 5 — scanning auto-advances; wait for step 6 aha copy
  await expect(page.getByText(/18 senders are responsible for/)).toBeVisible({ timeout: 10_000 });
  // Step 6
  await page.getByRole('button', { name: /Vault them all/ }).click();
  // Step 7
  await page.getByRole('button', { name: /Allow Vault access/ }).click();
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
