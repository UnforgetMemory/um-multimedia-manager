/**
 * X48 — the options SPA's sync interactions (webdav 5 + import/export 2 +
 * ConfirmDialog 2 click sites), driven in a real browser against the built
 * extension with the WebDAV server stubbed by route interception.
 *
 * These are the guard rails that a render test cannot see:
 *  - the three cloud buttons must stay disabled until the endpoint config is
 *    saved (otherwise 备份/恢复 can be fired against an empty URL);
 *  - success and failure must land in DIFFERENT live regions (role=status vs
 *    role=alert) — that is the a11y contract X8/X10-C established;
 *  - exporting WITH WebDAV credentials must ask first (ADR-016 decision 3: the
 *    file carries the plaintext password), and cancelling must produce no file.
 *
 * Labels are matched as EN|zh alternations because the SPA locale in the test
 * browser is not pinned, and a wrong label must fail loudly rather than silently
 * match nothing.
 */

import { readFileSync, rmSync } from 'node:fs';
import { expect, test } from './fixtures/extension-harness';

const OPTIONS_URL = '#/sync';
const DAV_URL = 'https://webdav.e2e.test/dav/';
const label = (en: string, zh: string): RegExp => new RegExp(`${en}|${zh}`);

async function gotoSyncTab(page: import('@playwright/test').Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/options.html${OPTIONS_URL}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.getByRole('button', { name: label('Save Config', '保存配置') }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

test('未保存配置前云端三个按钮禁用，保存后解禁并出现已保存徽标', async ({
  extContext,
  extensionId,
}) => {
  const page = await extContext.newPage();
  await gotoSyncTab(page, extensionId);

  const cloud = page
    .getByRole('button', { name: label('Smart Merge Sync', '智能合并同步') })
    .first();
  const overwriteLocal = page
    .getByRole('button', { name: label('Local Overwrite Cloud', '本地覆盖云端') })
    .first();
  await expect(cloud).toBeDisabled();
  await expect(overwriteLocal).toBeDisabled();
  await expect(page.getByText(label('Unsaved', '未保存')).first()).toBeVisible();

  await page.locator('input').nth(0).fill(DAV_URL);
  await page.locator('input').nth(1).fill('e2e-user');
  await page.locator('input[type="password"]').first().fill('e2e-pass');
  await page
    .getByRole('button', { name: label('Save Config', '保存配置') })
    .first()
    .click();

  await expect(page.getByText(label('Configuration saved', '配置已保存')).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(cloud).toBeEnabled();
  await page.close();
});

/** Stub the WebDAV origin at CONTEXT level — the probe runs in the service worker. */
async function stubWebdav(
  extContext: import('@playwright/test').BrowserContext,
  status: number,
): Promise<{ methods: string[] }> {
  const methods: string[] = [];
  await extContext.route('https://webdav.e2e.test/**', (route) => {
    methods.push(route.request().method());
    if (status === 207) {
      void route.fulfill({
        status: 207,
        contentType: 'application/xml; charset=utf-8',
        body: '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>',
      });
      return;
    }
    void route.fulfill({ status, contentType: 'text/plain', body: 'denied' });
  });
  return { methods };
}

test('测试连接：页面侧校验零请求，探测成功走 status、失败走 alert', async ({
  extContext,
  extensionId,
}) => {
  // SPA 的校验分支（空 URL / 非 https）必须一个请求都不发；真正的 PROPFIND 由
  // service worker 发出，只有 **context 级** route 拦得到（page route 看不见），
  // 这条是被 escape 守卫实测纠正过的 —— 因此成功/失败两条反馈分支现在都可断言。
  const page = await extContext.newPage();
  const pageOutbound: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('webdav.e2e.test')) pageOutbound.push(request.method());
  });
  await gotoSyncTab(page, extensionId);
  const testBtn = page.getByRole('button', { name: label('Test Connection', '测试连接') }).first();
  const alert = page.locator('[role="alert"][aria-live="assertive"]').first();
  const polite = page.locator('[role="status"][aria-live="polite"]').first();

  await testBtn.click();
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).not.toHaveText('');

  await page.locator('input').nth(0).fill('http://webdav.e2e.test/dav/');
  await testBtn.click();
  await expect(polite).toHaveCount(0);
  expect(pageOutbound, 'a non-https endpoint must not be probed from the page').toEqual([]);

  const ok = await stubWebdav(extContext, 207);
  await page.locator('input').nth(0).fill(DAV_URL);
  await page.locator('input').nth(1).fill('e2e-user');
  await page.locator('input[type="password"]').first().fill('e2e-pass');
  await testBtn.click();
  // Diagnostic ordering: prove the stub was reached before claiming anything
  // about the toast, so a miss says "no probe hit the stub" rather than pointing
  // at an empty (and therefore invisible) live region.
  await expect
    .poll(() => ok.methods.length, { timeout: 20_000, message: 'SW probe never hit the stub' })
    .toBeGreaterThan(0);
  expect(ok.methods).toContain('PROPFIND');
  await expect(polite.locator('> *').first()).toBeVisible({ timeout: 20_000 });
  await expect(polite).not.toHaveText('');
  await page.close();
});

test('测试连接失败（401）落到 role=alert，且不落到 polite 区', async ({
  extContext,
  extensionId,
}) => {
  // 单独一条用例：换桩状态靠重复注册同一 pattern 并不可靠（实测第二个 handler
  // 收不到请求），所以失败分支用自己的 context 级桩，从第一次点击起就是 401。
  const denied = await stubWebdav(extContext, 401);
  const page = await extContext.newPage();
  await gotoSyncTab(page, extensionId);
  await page.locator('input').nth(0).fill(DAV_URL);
  await page.locator('input').nth(1).fill('e2e-user');
  await page.locator('input[type="password"]').first().fill('e2e-pass');
  await page
    .getByRole('button', { name: label('Test Connection', '测试连接') })
    .first()
    .click();

  await expect
    .poll(() => denied.methods.length, { timeout: 20_000, message: 'probe missed the stub' })
    .toBeGreaterThan(0);
  const alert = page.locator('[role="alert"][aria-live="assertive"]').first();
  await expect(alert.locator('> *').first()).toBeVisible({ timeout: 20_000 });
  await expect(alert).not.toHaveText('');
  await expect(page.locator('[role="status"][aria-live="polite"] > *')).toHaveCount(0);
  await page.close();
});

test('带凭证导出必须先确认，取消则不产生任何下载', async ({ extContext, extensionId }) => {
  const page = await extContext.newPage();
  await gotoSyncTab(page, extensionId);

  await page
    .getByRole('button', { name: label('Import / Export', '导入导出') })
    .first()
    .click();
  const exportBtn = page.getByRole('button', { name: label('Export Data', '导出数据') }).first();
  await expect(exportBtn).toBeVisible({ timeout: 15_000 });

  await page.locator('#umm-include-webdav-creds').click({ force: true });

  let downloads = 0;
  page.on('download', () => {
    downloads += 1;
  });

  await exportBtn.click();
  const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await page
    .getByRole('button', { name: label('Cancel', '取消') })
    .last()
    .click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  expect(downloads, 'a cancelled credential export must not write a file').toBe(0);
  await page.close();
});

test('不带凭证直接导出会下载 .json 文件，导入按钮打开 .json 文件选择器', async ({
  extContext,
  extensionId,
}) => {
  const page = await extContext.newPage();
  await gotoSyncTab(page, extensionId);
  await page
    .getByRole('button', { name: label('Import / Export', '导入导出') })
    .first()
    .click();

  const exportBtn = page.getByRole('button', { name: label('Export Data', '导出数据') }).first();
  await expect(exportBtn).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
  await exportBtn.click();
  const download = await downloadPromise;
  expect((download.suggestedFilename() ?? '').toLowerCase()).toMatch(/\.json$/);

  const chooser = page.waitForEvent('filechooser');
  await page
    .getByRole('button', { name: label('Import Data', '导入数据') })
    .first()
    .click();
  const picked = await chooser;
  expect(picked).not.toBeNull();
  await page.close();
});

test('确认导出后真的产出文件，且文件带上已保存的密码（确认按钮不是空操作）', async ({
  extContext,
  extensionId,
}) => {
  const page = await extContext.newPage();
  await gotoSyncTab(page, extensionId);

  // A distinctive password makes "the toggle was honored" a real assertion
  // rather than a guess about which fields the exporter serialized.
  await page.locator('input').nth(0).fill(DAV_URL);
  await page.locator('input').nth(1).fill('e2e-user');
  const password = `pw-${Date.now()}`;
  await page.locator('input[type="password"]').first().fill(password);
  await page
    .getByRole('button', { name: label('Save Config', '保存配置') })
    .first()
    .click();
  await expect(page.getByText(label('Configuration saved', '配置已保存')).first()).toBeVisible({
    timeout: 15_000,
  });

  await page
    .getByRole('button', { name: label('Import / Export', '导入导出') })
    .first()
    .click();
  const exportBtn = page.getByRole('button', { name: label('Export Data', '导出数据') }).first();
  await expect(exportBtn).toBeVisible({ timeout: 15_000 });
  await page.locator('#umm-include-webdav-creds').click({ force: true });

  await exportBtn.click();
  const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
  await dialog
    .getByRole('button', { name: label('Export Data', '导出数据') })
    .first()
    .click();
  const download = await downloadPromise;
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const filePath = await download.path();
  expect(filePath, 'confirmed export produced no readable file').toBeTruthy();
  try {
    expect(readFileSync(filePath as string, 'utf8')).toContain(password);
  } finally {
    rmSync(filePath as string, { force: true });
  }
  await page.close();
});
