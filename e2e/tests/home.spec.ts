import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Home tab', () => {
  // Vite dev server occasionally times out on parallel page.goto under
  // worker load — auto-retry once to absorb that.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await bootApp(page);
    await openTab(page, 'Home');
    // Home shows a skeleton for 700ms; wait it out.
    await expect(page.getByRole('heading', { name: /Good morning,/ })).toBeVisible();
  });

  test('Greeting visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Good morning,/ })).toBeVisible();
    await expect(page.getByText('Prerna.')).toBeVisible();
  });

  test('This week\'s invitation card visible', async ({ page }) => {
    await expect(page.getByText("This week's invitation")).toBeVisible({ timeout: 10_000 });
  });

  test('Default archetype is Spark with Goa headline', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /Want to see the 6 best shots from your Goa trip\?/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Refresh cycles Spark → Facilitator → JIT', async ({ page }) => {
    // Spark by default.
    await expect(
      page.getByRole('heading', { name: /Want to see the 6 best shots from your Goa trip\?/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Refresh button is the small icon inside the invitation card; we
    // grab it by being inside the "This week's invitation" header row.
    const refresh = page
      .locator('div', { hasText: "This week's invitation" })
      .locator('button')
      .first();

    await refresh.click();
    await expect(
      page.getByRole('heading', { name: /Free 4 GB right now\./ }),
    ).toBeVisible();

    await refresh.click();
    await expect(
      page.getByRole('heading', { name: /Pick your favorite from the last burst\?/ }),
    ).toBeVisible();

    // One more cycle back to Spark.
    await refresh.click();
    await expect(
      page.getByRole('heading', { name: /Want to see the 6 best shots from your Goa trip\?/ }),
    ).toBeVisible();
  });

  test('Discoveries section shows multiple cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Discoveries$/ })).toBeVisible();
    // The 4 cards' eyebrows / titles.
    await expect(page.getByText('47 expired boarding passes')).toBeVisible();
    await expect(page.getByText('18 senders = 73% of unread')).toBeVisible();
    await expect(page.getByText('Pick the keeper from this burst')).toBeVisible();
    await expect(page.getByText("A photo you haven't seen in 3 years")).toBeVisible();
  });

  test('"Open burst" navigates to BurstDetail', async ({ page }) => {
    await page.getByRole('button', { name: /Open burst →/ }).click();
    await expect(
      page.getByRole('heading', { name: /We picked this one — sharpest, eyes open\./ }),
    ).toBeVisible();
  });

  test('"See senders" navigates to SendersDetail', async ({ page }) => {
    await page.getByRole('button', { name: /See senders →/ }).click();
    await expect(page.getByText(/18 senders are responsible for/)).toBeVisible();
  });

  test('Footer reassurance copy present', async ({ page }) => {
    await expect(page.getByText('We never permanently delete without you.')).toBeVisible();
  });
});
