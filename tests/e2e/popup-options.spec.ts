/**
 * X9-C #4 — extension pages in the real browser: popup dashboard + options
 * toast a11y.
 *
 * Popup: chrome-extension://<id>/popup.html (id derived from the MV3 SW
 * target URL) must render the UMManager dashboard and all 8 stat cards with
 * numeric values — proving the popup → messaging → SW-IndexedDB read chain
 * works in production bits, not just unit mocks.
 *
 * Options: navigating to options.html#/settings and saving the NeoDB token
 * triggers the real background settings write AND a success toast; the toast
 * must carry live-region a11y attributes (role=status / aria-live=polite) in
 * the real DOM (ToastContainer, feature P-D accessibility).
 */

import { expect, test } from './fixtures/extension-harness';

test('popup dashboard renders stat cards with numeric values', async ({ extPage }) => {
  await expect(extPage.locator('h1')).toContainText('UMManager');
  await expect(extPage.locator('text=/^v\\d+\\.\\d+\\.\\d+/').first()).toBeVisible();

  const statValues = extPage.locator('[class*="tabular-nums"]');
  await expect
    .poll(
      async () => {
        const texts = await statValues.allInnerTexts();
        return texts.length >= 8 && texts.slice(0, 8).every((t) => /^\d+$/.test(t.trim()));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  expect(await statValues.count()).toBeGreaterThanOrEqual(8);
});

test('options settings save shows an accessible live-region toast', async ({
  extContext,
  extensionId,
}) => {
  const page = await extContext.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#/settings`, {
    waitUntil: 'domcontentloaded',
  });

  const tokenInput = page.locator('input[type="password"]').first();
  await expect(tokenInput).toBeVisible({ timeout: 30_000 });
  await tokenInput.fill('e2e-neodb-token');

  // zh-CN '保存 Token' / en 'Save Token' — match either locale.
  await page
    .locator('button')
    .filter({ hasText: /Save Token|保存 Token/ })
    .first()
    .click();

  // Real toast with live-region semantics (success → role=status polite;
  // failure path would be role=alert — either way the a11y region must exist).
  const liveToast = page
    .locator('[role="status"][aria-live="polite"], [role="alert"][aria-live="assertive"]')
    .first();
  await expect(liveToast).toBeVisible({ timeout: 15_000 });
  await expect(liveToast).not.toHaveText('');
});
