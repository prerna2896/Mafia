import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Vibe toggle (calm / playful)', () => {
  // Vite dev server occasionally times out on parallel page.goto under
  // worker load — auto-retry once to absorb that.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test('Calm is the default and data-vibe="calm" on .mafia-root', async ({ page }) => {
    const root = page.locator('.mafia-root').first();
    await expect(root).toHaveAttribute('data-vibe', 'calm');
    await openTab(page, 'Settings');
    await expect(page.getByText('Clean, focused, minimal.')).toBeVisible();
  });

  test('Clicking Playful flips data-vibe and updates subline copy', async ({ page }) => {
    await openTab(page, 'Settings');
    await page.getByRole('button', { name: 'Playful' }).first().click();
    const root = page.locator('.mafia-root').first();
    await expect(root).toHaveAttribute('data-vibe', 'playful');
    await expect(page.getByText('Soft, warm, a little fun.')).toBeVisible();
  });

  test('Toggle round-trips back to Calm', async ({ page }) => {
    await openTab(page, 'Settings');
    await page.getByRole('button', { name: 'Playful' }).first().click();
    await page.getByRole('button', { name: 'Calm' }).first().click();
    const root = page.locator('.mafia-root').first();
    await expect(root).toHaveAttribute('data-vibe', 'calm');
    await expect(page.getByText('Clean, focused, minimal.')).toBeVisible();
  });

  test('Vibe persists across tabs (state is app-wide)', async ({ page }) => {
    await openTab(page, 'Settings');
    await page.getByRole('button', { name: 'Playful' }).first().click();
    await openTab(page, 'Home');
    const root = page.locator('.mafia-root').first();
    await expect(root).toHaveAttribute('data-vibe', 'playful');
  });
});
