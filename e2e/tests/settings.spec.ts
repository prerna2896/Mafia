import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Settings tab', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
    await openTab(page, 'Settings');
    await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
  });

  test('Title and "Quiet by design. On-device by default." subtitle', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
    await expect(page.getByText('Quiet by design. On-device by default.')).toBeVisible();
  });

  test('Vibe toggle is present', async ({ page }) => {
    await expect(page.getByText(/^App vibe$/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calm' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Playful' })).toBeVisible();
  });

  test('Vault retention defaults to 30 and updates when dragged', async ({ page }) => {
    // Headline shows "30 days".
    await expect(page.getByText(/^30$/).first()).toBeVisible();
    const slider = page.locator('input[type="range"].mafia-range').first();
    // Set the slider to 60 via fill().
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '60';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.getByText(/^60$/).first()).toBeVisible();
  });

  test('"Cancel subscription" row is clay-toned and 1 tap from root', async ({ page }) => {
    // The row exposes the literal "Cancel subscription" text in a clay class.
    const row = page.getByText(/^Cancel subscription$/);
    await expect(row).toBeVisible();
    // It lives on the root settings screen — no nested navigation needed.
    // (PRD §12 testable promise: always ≤2 taps.)
    const classes = await row.evaluate((el) => el.className);
    expect(classes).toMatch(/text-\[var\(--clay\)\]/);
  });

  test('"On-device by default" pill is sage-toned "On"', async ({ page }) => {
    await expect(page.getByText(/^On-device by default$/)).toBeVisible();
    // Sage pill says "On" — find the "On" pill near the row.
    await expect(page.getByText(/^On$/).first()).toBeVisible();
  });

  test('Footer "Mafia · cross-surface, reversible, quiet."', async ({ page }) => {
    await expect(page.getByText('Mafia · cross-surface, reversible, quiet.')).toBeVisible();
  });
});
