import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Surfaces tab', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
    await openTab(page, 'Surfaces');
    await expect(page.getByRole('heading', { name: /^Surfaces$/ })).toBeVisible();
    // Wait out skeleton loader.
    await expect(page.getByText(/Cross-surface coherence/)).toBeVisible({ timeout: 10_000 });
  });

  test('Title and subtitle visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Surfaces$/ })).toBeVisible();
    await expect(
      page.getByText(/One library, many places\. Sync stays read-only unless you say otherwise\./),
    ).toBeVisible();
  });

  test('5 surface rows render (iCloud, Google Photos, Drive, Gmail, Dropbox)', async ({ page }) => {
    await expect(page.getByText('iCloud Photos', { exact: false })).toBeVisible();
    await expect(page.getByText('Google Photos', { exact: false })).toBeVisible();
    await expect(page.getByText('Google Drive', { exact: false })).toBeVisible();
    await expect(page.getByText(/^Gmail$/)).toBeVisible();
    await expect(page.getByText('Dropbox', { exact: false })).toBeVisible();
  });

  test('Dropbox shows "Not connected" with Add button', async ({ page }) => {
    await expect(page.getByText('Not connected')).toBeVisible();
    await expect(page.getByText(/^Add$/)).toBeVisible();
  });

  test('Coherence card shows 94% deduped copy', async ({ page }) => {
    await expect(
      page.getByText(/Your Photos and Drive are 94% deduped relative to each other\./),
    ).toBeVisible();
    await expect(page.getByText(/Cross-surface coherence/)).toBeVisible();
  });

  test('3-stat grid shows 12,847 / 1,204 / 76', async ({ page }) => {
    await expect(page.getByText('12,847')).toBeVisible();
    await expect(page.getByText('1,204')).toBeVisible();
    await expect(page.getByText('76')).toBeVisible();
    await expect(page.getByText('Entities')).toBeVisible();
    await expect(page.getByText('Cross-linked')).toBeVisible();
    await expect(page.getByText('Duplicates left')).toBeVisible();
  });

  test('Footer copy present', async ({ page }) => {
    await expect(
      page.getByText('Mafia treats one photo across surfaces as one entity.'),
    ).toBeVisible();
  });
});
