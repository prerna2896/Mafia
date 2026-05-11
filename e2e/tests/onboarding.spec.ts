import { test, expect } from '@playwright/test';
import { clearOnboarding } from './helpers/setup';

/**
 * 7-rung onboarding ladder. Source: vault-view/src/components/mafia/onboarding/Onboarding.tsx
 *
 * Note: onboarding only shows AFTER sign-in, so each test signs in first.
 */
test.describe('Onboarding ladder', () => {
  test.beforeEach(async ({ page }) => {
    await clearOnboarding(page);
    await page.getByRole('button', { name: /Continue with Apple/i }).click();
  });

  test('Step 1 renders welcome with Start CTA', async ({ page }) => {
    await expect(page.getByText('Take space.')).toBeVisible();
    await expect(page.getByText('Make space.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByText('No permission asked yet.')).toBeVisible();
    // Step indicator
    await expect(page.getByText(/^1\s/)).toBeVisible();
    await expect(page.getByText(/of\s*7/i)).toBeVisible();
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
    await page.getByRole('button', { name: /^Gmail/ }).click();
    await expect(page.getByText(/Mafia will read your inbox first/)).toBeVisible();
    await expect(page.getByText('Before we ask')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  test('Continue advances to Step 4 faux iOS dialog', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /^Gmail/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Tap Allow above')).toBeVisible();
    await expect(page.getByText(/"Mafia" Would Like to Access Gmail/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Don't Allow$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Allow$/ })).toBeVisible();
  });

  test('Allow advances to Step 5 scanning with animated count-up', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /^Gmail/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /^Allow$/ }).click();
    // Reading copy appears
    await expect(page.getByText(/Reading\s+[\d,]+\s+emails…/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("We're not deleting or moving anything.")).toBeVisible();
  });

  test('Step 5 auto-advances to Step 6 aha with exact copy', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /^Gmail/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /^Allow$/ }).click();
    // Wait up to ~4s for scan animation (2.2s + 600ms) to complete.
    await expect(page.getByText(/^First finding$/i)).toBeVisible({ timeout: 10_000 });
    // The aha headline — assert both halves.
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible();
    await expect(page.getByText('73%')).toBeVisible();
    await expect(page.getByText(/of your unread\./)).toBeVisible();
  });

  test('Vault them all advances to Step 7 write scope', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /^Gmail/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /^Allow$/ }).click();
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Vault them all/ }).click();
    await expect(page.getByText('One last thing')).toBeVisible();
    await expect(page.getByText(/Let Mafia move things/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Allow Vault access/ })).toBeVisible();
  });

  test('Allow Vault access completes onboarding and shows MafiaApp', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('button', { name: /^Gmail/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /^Allow$/ }).click();
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Vault them all/ }).click();
    await page.getByRole('button', { name: /Allow Vault access/ }).click();
    // Bottom-tab bar visible -> we're in the app.
    await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /^Vault$/ })).toBeVisible();

    // localStorage.mafia.onboarded === '1'
    const flag = await page.evaluate(() => localStorage.getItem('mafia.onboarded'));
    expect(flag).toBe('1');
  });

  test('Back button on Step 2+ returns to prior step', async ({ page }) => {
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('heading', { name: /Where should we start\?/ })).toBeVisible();
    await page.getByRole('button', { name: /← Back/ }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByText(/^1\s/)).toBeVisible();
  });

  test('Step indicator advances "N of 7" correctly', async ({ page }) => {
    await expect(page.getByText(/^1\s/)).toBeVisible();
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText(/^2\s/)).toBeVisible();
    await page.getByRole('button', { name: /^Gmail/ }).click();
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
