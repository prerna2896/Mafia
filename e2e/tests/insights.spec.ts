import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Insights tab', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
    await openTab(page, 'Insights');
    await expect(page.getByRole('heading', { name: /^Insights$/ })).toBeVisible();
    // Wait out the 700ms skeleton.
    await expect(page.getByText(/Cumulative, not streaks\. We learn from what you keep\./)).toBeVisible({ timeout: 10_000 });
  });

  test('Hero "47 GB" with caption', async ({ page }) => {
    await expect(page.getByText(/^47$/)).toBeVisible();
    await expect(page.getByText(/^GB$/)).toBeVisible();
    await expect(page.getByText(/across 6 months · 1,847 entities/)).toBeVisible();
  });

  test('3-up sub-stats: Protected / Vaulted / Lost', async ({ page }) => {
    await expect(page.getByText('Protected')).toBeVisible();
    await expect(page.getByText('Vaulted')).toBeVisible();
    await expect(page.getByText('Lost')).toBeVisible();
    await expect(page.getByText('1,847')).toBeVisible();
    await expect(page.getByText('312')).toBeVisible();
    await expect(page.getByText(/^0$/).first()).toBeVisible();
  });

  test('Wrapped scroller shows 4 cards (Protection / Top sender / Library / We learned)', async ({ page }) => {
    await expect(page.getByText('Protection')).toBeVisible();
    await expect(page.getByText('Top sender')).toBeVisible();
    await expect(page.getByText('Library')).toBeVisible();
    await expect(page.getByText('We learned')).toBeVisible();
    await expect(page.getByText('LinkedIn')).toBeVisible();
    await expect(page.getByText(/^94%$/)).toBeVisible();
  });

  test('"This week we learned…" panel with DoorDash/Airbnb learning + saved nudges line', async ({ page }) => {
    await expect(page.getByText(/^This week we learned…$/)).toBeVisible();
    await expect(
      page.getByText(/You vault DoorDash receipts but keep Airbnb ones\. We'll stop suggesting Airbnb\./),
    ).toBeVisible();
    await expect(page.getByText(/Adjusted on Tuesday · 22 future nudges saved\./)).toBeVisible();
  });

  test('Edit all preferences expands existing chips', async ({ page }) => {
    await page.getByRole('button', { name: /Edit all preferences/ }).click();
    await expect(page.getByText('You keep group shots')).toBeVisible();
    await expect(page.getByText('You vault DoorDash receipts')).toBeVisible();
  });

  test('Removing a chip removes it (× → Forget → confirm)', async ({ page }) => {
    await page.getByRole('button', { name: /Edit all preferences/ }).click();
    // Click the × on the "You keep group shots" chip.
    await page.getByRole('button', { name: /Forget You keep group shots/ }).click();
    // Confirm sheet
    await expect(page.getByRole('heading', { name: /Forget this learning\?/ })).toBeVisible();
    await page.getByRole('button', { name: /^Forget$/ }).click();
    await expect(page.getByText('You keep group shots')).toHaveCount(0);
  });

  test('+ Teach a new preference opens input and saves a chip', async ({ page }) => {
    await page.getByRole('button', { name: /Edit all preferences/ }).click();
    await page.getByRole('button', { name: /\+ Teach a new preference/ }).click();
    const input = page.getByPlaceholder(/e\.g\.\s*"You keep boarding passes"/);
    await expect(input).toBeVisible();
    await input.fill('You keep recipes from mom');
    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('You keep recipes from mom')).toBeVisible();
  });

  test('Empty input + Save is a no-op (collapses without adding)', async ({ page }) => {
    await page.getByRole('button', { name: /Edit all preferences/ }).click();
    await page.getByRole('button', { name: /\+ Teach a new preference/ }).click();
    const input = page.getByPlaceholder(/e\.g\.\s*"You keep boarding passes"/);
    await input.fill('   ');
    await page.getByRole('button', { name: /^Save$/ }).click();
    // The "+ Teach" prompt should return (input collapsed) — no new chip.
    await expect(page.getByRole('button', { name: /\+ Teach a new preference/ })).toBeVisible();
  });

  test('Footer copy "No streaks. No pressure. Just signal."', async ({ page }) => {
    await expect(page.getByText('No streaks. No pressure. Just signal.')).toBeVisible();
  });
});
