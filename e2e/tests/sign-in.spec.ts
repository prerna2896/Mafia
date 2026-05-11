import { test, expect } from '@playwright/test';
import { clearOnboarding } from './helpers/setup';

test.describe('Sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await clearOnboarding(page);
  });

  test('renders before onboarding with both providers and restore link', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Mafia$/ })).toBeVisible();
    await expect(page.getByText('Sign in to keep your vault in sync across devices.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Apple/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Restore from another device/i })).toBeVisible();
  });

  test('Apple button signs in and advances to onboarding step 1', async ({ page }) => {
    await page.getByRole('button', { name: /Continue with Apple/i }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    const flag = await page.evaluate(() => localStorage.getItem('mafia.signedIn'));
    expect(flag).toBe('1');
  });

  test('Google button signs in and advances to onboarding step 1', async ({ page }) => {
    await page.getByRole('button', { name: /Continue with Google/i }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    const flag = await page.evaluate(() => localStorage.getItem('mafia.signedIn'));
    expect(flag).toBe('1');
  });

  test('Restore link navigates to restore screen', async ({ page }) => {
    await page.getByRole('button', { name: /Restore from another device/i }).click();
    await expect(page.getByRole('heading', { name: /Restore from another device/i })).toBeVisible();
    await expect(page.getByText(/Scan this code from your other device\./)).toBeVisible();
  });

  test('Restore: button disabled until 6 digits entered', async ({ page }) => {
    await page.getByRole('button', { name: /Restore from another device/i }).click();
    const restoreBtn = page.getByRole('button', { name: /Restore device/ });
    await expect(restoreBtn).toBeDisabled();

    const inputs = page.locator('input[inputmode="numeric"]');
    await expect(inputs).toHaveCount(6);

    // Fill 5 digits — button remains disabled.
    for (let i = 0; i < 5; i++) {
      await inputs.nth(i).fill(String((i + 1) % 10));
    }
    await expect(restoreBtn).toBeDisabled();
  });

  test('Restore: typing a digit focuses the next input', async ({ page }) => {
    await page.getByRole('button', { name: /Restore from another device/i }).click();
    const inputs = page.locator('input[inputmode="numeric"]');
    await inputs.nth(0).fill('4');
    // After filling, focus should advance to index 1.
    await expect(inputs.nth(1)).toBeFocused();
    await inputs.nth(1).fill('2');
    await expect(inputs.nth(2)).toBeFocused();
  });

  test('Restore: all 6 digits enables Restore device → onboarding', async ({ page }) => {
    await page.getByRole('button', { name: /Restore from another device/i }).click();
    const inputs = page.locator('input[inputmode="numeric"]');
    for (let i = 0; i < 6; i++) {
      await inputs.nth(i).fill(String((i + 1) % 10));
    }
    const restoreBtn = page.getByRole('button', { name: /Restore device/ });
    await expect(restoreBtn).toBeEnabled();
    await restoreBtn.click();
    // Lands on onboarding step 1.
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });
});
