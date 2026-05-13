import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Detail screens (BurstDetail + SendersDetail)', () => {
  // Vite dev server occasionally times out on parallel page.goto under
  // worker load — auto-retry once to absorb that.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await bootApp(page);
    await openTab(page, 'Home');
    await expect(page.getByRole('heading', { name: /Good morning,/ })).toBeVisible();
  });

  test('BurstDetail: "We picked this one — sharpest, eyes open."', async ({ page }) => {
    await page.getByRole('button', { name: /Open burst →/ }).click();
    await expect(
      page.getByRole('heading', { name: /We picked this one — sharpest, eyes open\./ }),
    ).toBeVisible();
  });

  test('BurstDetail: keeper image + 10 vault-candidate thumbnails', async ({ page }) => {
    await page.getByRole('button', { name: /Open burst →/ }).click();
    await expect(page.getByText('Keeper')).toBeVisible();
    await expect(page.getByText(/Vault other 10/)).toBeVisible();
  });

  test('BurstDetail: Keep all + Move 10 to Vault CTAs present', async ({ page }) => {
    await page.getByRole('button', { name: /Open burst →/ }).click();
    await expect(page.getByRole('button', { name: /^Keep all$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Move 10 to Vault/ })).toBeVisible();
  });

  test('BurstDetail: Back returns to Home', async ({ page }) => {
    await page.getByRole('button', { name: /Open burst →/ }).click();
    await page.getByRole('button', { name: /← Back/ }).click();
    await expect(page.getByRole('heading', { name: /Good morning,/ })).toBeVisible();
  });

  test('SendersDetail: "N senders are responsible for P% of your unread."', async ({ page }) => {
    await page.getByRole('button', { name: /See senders →/ }).click();
    // Dynamic since the live-API integration: N = top_n returned, P = sum/total.
    // Mock fallback gives 8 senders.
    await expect(page.getByText(/\d+ senders are responsible for/)).toBeVisible();
    await expect(page.getByText(/of your unread/)).toBeVisible();
  });

  test('SendersDetail: 8 sender rows each with Review + Vault all', async ({ page }) => {
    await page.getByRole('button', { name: /See senders →/ }).click();
    // The data file (topSenders) has 8 senders. Review buttons should be 8.
    const reviews = page.getByRole('button', { name: /^Review$/ });
    await expect(reviews).toHaveCount(8);
    const vaultAll = page.getByRole('button', { name: /^Vault all$/ });
    await expect(vaultAll).toHaveCount(8);
  });

  test('SendersDetail: Review opens inline subject preview', async ({ page }) => {
    await page.getByRole('button', { name: /See senders →/ }).click();
    await page.getByRole('button', { name: /^Review$/ }).first().click();
    // Should expose the "Showing N of M" header inside the inline review.
    await expect(page.getByText(/Showing\s+\d+\s+of\s+\d+/)).toBeVisible();
    // And expose either Select all shown or Vault selected.
    await expect(page.getByRole('button', { name: /Vault selected/ })).toBeVisible();
  });
});
