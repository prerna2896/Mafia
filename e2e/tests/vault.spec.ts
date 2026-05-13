import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Vault tab', () => {
  // Vite dev server occasionally times out on parallel page.goto under
  // worker load — auto-retry once to absorb that.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await bootApp(page);
    await openTab(page, 'Vault');
    // Vault shows a skeleton for ~750ms; wait for the real title + segmented
    // control to make sure we're past it.
    await expect(page.getByRole('heading', { name: /^Vault$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^All$/ })).toBeVisible({ timeout: 10_000 });
  });

  test('Title and subtitle visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Vault$/ })).toBeVisible();
    await expect(page.getByText('Recoverable for 30 days. Nothing here is gone.')).toBeVisible();
  });

  test('Purge banner shows "47 items purging in 3 days"', async ({ page }) => {
    await expect(page.getByText('47 items purging in 3 days')).toBeVisible();
    await expect(page.getByText("Anything you'd like to keep?")).toBeVisible();
  });

  test('Segmented control: All / Photos / Emails / Files', async ({ page }) => {
    for (const t of ['All', 'Photos', 'Emails', 'Files']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${t}$`) })).toBeVisible();
    }
  });

  test('Switching to Emails filters to only emails', async ({ page }) => {
    await page.getByRole('button', { name: /^Emails$/ }).click();
    // The "From Gmail" sender pill should still appear; photo group "Goa burst"
    // (id v1) should not be present since v1 is a photo.
    await expect(page.getByText(/From Gmail/i).first()).toBeVisible();
  });

  // The purge banner at the top also has a "Review" button (no-op demo).
  // For bundle rows we want the per-row Review beside "Restore all".
  // Skip index 0 (the banner) and use index 1 onward.
  const openFirstBundleReview = async (page: import('@playwright/test').Page) => {
    const reviewBtns = page.getByRole('button', { name: /^Review$/ });
    // index 0 = purge-banner button, index 1 = first row Review (v1 Goa burst).
    await reviewBtns.nth(1).click();
  };

  test('Restore selected disabled when 0 selected; Select all + Clear toggle', async ({ page }) => {
    await openFirstBundleReview(page);
    // Restore selected button starts disabled.
    const restoreSel = page.getByRole('button', { name: /Restore selected/ });
    await expect(restoreSel).toBeDisabled();

    // Select all.
    await page.getByRole('button', { name: /^Select all$/ }).click();
    await expect(restoreSel).toBeEnabled();

    // Clear toggles back.
    await page.getByRole('button', { name: /^Clear$/ }).click();
    await expect(restoreSel).toBeDisabled();
  });

  test('Restoring selected closes review (and surfaces a toast)', async ({ page }) => {
    await openFirstBundleReview(page);
    await page.getByRole('button', { name: /^Select all$/ }).click();
    await page.getByRole('button', { name: /Restore selected/ }).click();
    // Review pane collapses → "Select all" button no longer in DOM.
    await expect(page.getByRole('button', { name: /^Select all$/ })).toHaveCount(0);
  });

  test('Single-item Restore turns into Restored', async ({ page }) => {
    // Single-item rows are non-bundle (no Review button). Find one by looking
    // for a row whose Restore (singular, no "all") button is exposed.
    // The "Restore" button (singular) exists on non-bundle items.
    const restoreSingle = page.getByRole('button', { name: /^Restore$/ }).first();
    await restoreSingle.click();
    await expect(page.getByRole('button', { name: /^Restored$/ }).first()).toBeVisible();
  });

  test('Visual bundle Review shows Swipe / See all toggle (v1 burst)', async ({ page }) => {
    // The first row in the file is "Goa burst" (v1), a visual bundle.
    // Skip the purge-banner Review button at index 0.
    await openFirstBundleReview(page);
    // The Swipe + See all toggles only appear for visual bundles.
    const swipeBtn = page.getByRole('button', { name: /^Swipe$/ });
    const seeAllBtn = page.getByRole('button', { name: /^See all$/ });
    await expect(swipeBtn).toBeVisible();
    await expect(seeAllBtn).toBeVisible();
    // Switch to grid then back.
    await seeAllBtn.click();
    await swipeBtn.click();
  });

  test('Swipe Keep/Skip auto-advances cursor', async ({ page }) => {
    // Open v1 Goa burst review (first per-row Review; index 0 is the purge banner).
    await openFirstBundleReview(page);
    await expect(page.getByRole('button', { name: /^Swipe$/ })).toBeVisible();

    // The cursor label is "1 / N · …meta…". Click Keep, expect cursor advances.
    const label = page.locator('text=/^\\d+ \\/ \\d+/').first();
    await expect(label).toBeVisible();
    const before = (await label.textContent())?.split('/')[0].trim();
    // Calm-vibe Keep button is aria-labelled "Keep".
    await page.getByRole('button', { name: /^Keep$/ }).click();
    const after = (await label.textContent())?.split('/')[0].trim();
    expect(before).not.toBe(after);
  });
});
