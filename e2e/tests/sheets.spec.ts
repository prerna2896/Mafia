import { test, expect } from '@playwright/test';
import { bootApp, openTab } from './helpers/setup';

test.describe('Sheets (Paywall / Cancel / EmailPreview / Feedback / WhyVaulted)', () => {
  // Vite dev server occasionally times out on parallel page.goto under
  // worker load — auto-retry once to absorb that.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await bootApp(page);
    await openTab(page, 'Settings');
    await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible();
  });

  test('Paywall: triggered from Settings demo, 5-row table + 7-day trial CTA', async ({ page }) => {
    await page.getByText(/^Preview paywall sheet$/).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Mafia Plus extends your Vault\./ })).toBeVisible();
    // 5 comparison rows — scope into the dialog so "Vault retention" doesn't
    // collide with the Settings SectionLabel underneath.
    await expect(dialog.getByText('Vault retention')).toBeVisible();
    await expect(dialog.getByText('Surfaces connected')).toBeVisible();
    await expect(dialog.getByText('Restores per month')).toBeVisible();
    await expect(dialog.getByText('Deep restore (snapshots)')).toBeVisible();
    await expect(dialog.getByText('Cross-surface coherence')).toBeVisible();
    // CTA + cancel-anytime footer.
    await expect(dialog.getByRole('button', { name: /Try free for 7 days/ })).toBeVisible();
    await expect(dialog.getByText(/Cancel anytime in 2 taps/)).toBeVisible();
  });

  test('Cancel: from Cancel subscription row, shows "Cancel Mafia Plus?" headline', async ({ page }) => {
    await page.getByText(/^Cancel subscription$/).click();
    await expect(page.getByRole('heading', { name: /Cancel Mafia Plus\?/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Cancel subscription$/ }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: /Keep Plus/ })).toBeVisible();
  });

  test('Email Preview: faux email From / Subject / Refund + cancel button', async ({ page }) => {
    await page.getByText(/^Subscription emails$/).click();
    await expect(page.getByText(/Mafia <hello@mafia\.app>/)).toBeVisible();
    await expect(page.getByText(/Your Mafia Plus renews tomorrow — \$4\.00/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Refund \+ cancel/ })).toBeVisible();
  });

  test('Feedback: Send disabled until non-empty + payload toggle', async ({ page }) => {
    await page.getByText(/^Help & feedback$/).click();
    const send = page.getByRole('button', { name: /^Send$/ });
    await expect(send).toBeDisabled();
    await page.getByPlaceholder(/Bug, idea, or just a hello…/).fill('Test feedback message');
    await expect(send).toBeEnabled();
    // View payload toggle.
    await page.getByRole('button', { name: /View what we'd send/ }).click();
    await expect(page.getByText(/"app": "Mafia"/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Hide what we'd send/ })).toBeVisible();
  });

  test('Why Vaulted: long-press on a Vault item exposes the sheet', async ({ page }) => {
    await openTab(page, 'Vault');
    await expect(page.getByRole('heading', { name: /^Vault$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^All$/ })).toBeVisible({ timeout: 10_000 });

    // Long-press is implemented via contextmenu in useLongPress. Right-click
    // (dispatches contextmenu) on the LinkedIn weekly digests row (v2).
    // The container that owns the gesture handlers is the row's flex wrapper;
    // we hit it via its title text "LinkedIn — 14 weekly digests".
    const itemRow = page
      .locator('div')
      .filter({ hasText: /LinkedIn — 14 weekly digests/ })
      .first();
    await itemRow.click({ button: 'right' });

    // The menu appears.
    await expect(page.getByRole('button', { name: /Why is this in Vault\?/ })).toBeVisible();
    await page.getByRole('button', { name: /Why is this in Vault\?/ }).click();

    // Sheet copy.
    await expect(page.getByText(/Why it's here/)).toBeVisible();
    await expect(page.getByText(/Rule applied/)).toBeVisible();
    await expect(page.getByText(/^Triggered$/)).toBeVisible();
    await expect(page.getByText(/Reversible until/)).toBeVisible();
  });
});
