import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Tab navigation', () => {
  // Vite dev server occasionally times out on parallel page.goto under
  // worker load — auto-retry once to absorb that.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test('all 5 tabs visible after onboarding', async ({ page }) => {
    for (const name of ['Home', 'Surfaces', 'Vault', 'Insights', 'Settings']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}$`) })).toBeVisible();
    }
  });

  test('each tab loads with its Fraunces (font-serif) header', async ({ page }) => {
    await openTab(page, 'Home');
    await expect(page.getByRole('heading', { name: /Good morning,/ })).toBeVisible();
    await openTab(page, 'Surfaces');
    await expect(page.getByRole('heading', { name: /^Surfaces$/ })).toBeVisible();
    await openTab(page, 'Vault');
    await expect(page.getByRole('heading', { name: /^Vault$/ })).toBeVisible();
    await openTab(page, 'Insights');
    await expect(page.getByRole('heading', { name: /^Insights$/ })).toBeVisible();
    await openTab(page, 'Settings');
    await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
  });

  test('Vault tab has the small amber star dot indicator', async ({ page }) => {
    // The star dot is a span inside the Vault tab button. We look for it
    // by its absolute positioning + amber background.
    const vaultTab = page.getByRole('button', { name: /^Vault$/ });
    await expect(vaultTab).toBeVisible();
    // The dot is a child span with bg-[var(--amber)].
    const dot = vaultTab.locator('span.bg-\\[var\\(--amber\\)\\]').first();
    await expect(dot).toHaveCount(1);
  });

  test('tab state survives a round-trip', async ({ page }) => {
    await openTab(page, 'Vault');
    await expect(page.getByRole('heading', { name: /^Vault$/ })).toBeVisible();
    await openTab(page, 'Settings');
    await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
    await openTab(page, 'Vault');
    await expect(page.getByRole('heading', { name: /^Vault$/ })).toBeVisible();
  });
});
