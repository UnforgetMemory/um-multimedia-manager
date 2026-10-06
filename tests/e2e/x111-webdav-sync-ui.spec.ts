/**
 * X111 — WebDAV 同步的界面层模拟验证（ADR-027；协议层见 x110）。
 *
 * 为什么单独立文件：UI 断言（确认框矩阵 / 取消零写 / 确认后真的执行）与协议断言
 * 关注点不同，混在一个 spec 会同时撞上 size:check 的 600 行棘轮。共享桩在
 * `./fixtures/webdav-server`。
 *
 * 关键判别力：只断「对话框出现/关闭」会被自持状态骗过 —— 「确认后本地真的多了记录」
 * 才能区分「写消息发出去了」与「压根没发」（safeSendMessage 的 `retries` 是**尝试
 * 次数**，传 0 时一次都不发；该用例已用 RED 注入验证过判别力）。
 */

import { expect, test } from './fixtures/extension-harness';
import type { BrowserContext, Page } from '@playwright/test';
import {
  DOUBAN,
  DAV_URL,
  datasetZip,
  installDavServer,
  label,
  manyRemote,
  metaEntry,
  metaOf,
  seed,
  send,
  storeKeys,
} from './fixtures/webdav-server';

/** 凭据先写进设置：全新 profile 没有配置时三个云端按钮是禁用的。 */
test.beforeEach(async ({ extPage }) => {
  const res = await send<{ success?: boolean }>(extPage, 'UPDATE_SETTINGS', {
    webdavUrl: DAV_URL,
    webdavUsername: 'e2e-user',
    webdavPassword: 'e2e-pass',
  });
  expect(res.success).toBe(true);
});

async function openSyncTab(extContext: BrowserContext, extensionId: string): Promise<Page> {
  const page = await extContext.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html#/sync`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(
    page.getByRole('button', { name: label('Smart Merge Sync', '智能合并同步') }).first(),
  ).toBeEnabled({ timeout: 30_000 });
  return page;
}

test('UI：点同步先预览对照矩阵（含 2 vs 100 与方向），取消不产生任何写请求', async ({
  extContext,
  extensionId,
  extPage,
}) => {
  const dav = await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 100, 'remote-hash', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('R', 100, '2026-01-01T00:00:00.000Z')) },
  });
  // 播种 2 条本地记录 ⇒ 该表判为「两侧分叉 ⇒ 合并」，预览矩阵同时呈现 2 vs 100
  await seed(extPage, DOUBAN, 'movie::L1');
  await seed(extPage, DOUBAN, 'movie::L2');

  const page = await openSyncTab(extContext, extensionId);
  await page
    .getByRole('button', { name: label('Smart Merge Sync', '智能合并同步') })
    .first()
    .click();

  const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const table = dialog.locator('table');
  await expect(table, '确认框必须呈现逐表对照矩阵，而不是一句「智能合并」').toBeVisible();
  await expect(table.locator('thead th')).toHaveCount(7);

  const doubanRow = table
    .locator('tbody tr')
    .filter({ hasText: label('Douban', '豆瓣') })
    .first();
  await expect(doubanRow).toBeVisible();
  await expect(doubanRow).toContainText('100');
  await expect(doubanRow).toContainText(label('Merge', '合并'));

  const putsBefore = dav.datasetPuts.length;
  const metaPutsBefore = dav.metaPuts;
  await page
    .getByRole('button', { name: label('Cancel', '取消') })
    .last()
    .click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  expect(dav.datasetPuts.length, '取消确认框不得产生任何 dataset 写请求').toBe(putsBefore);
  expect(dav.metaPuts, '取消确认框不得写 meta').toBe(metaPutsBefore);
  await page.close();
});

test('UI：确认后真的执行（钉住 safeSendMessage 的 retries 语义）', async ({
  extContext,
  extensionId,
  extPage,
}) => {
  await installDavServer(extContext, {
    meta: metaOf([metaEntry(DOUBAN, 3, 'remote-douban', '2026-01-05T00:00:00.000Z')]),
    datasets: { [DOUBAN]: datasetZip(manyRemote('D', 3, '2026-01-01T00:00:00.000Z')) },
  });
  expect((await storeKeys(extPage, DOUBAN)).length).toBe(0);

  const page = await openSyncTab(extContext, extensionId);
  await page
    .getByRole('button', { name: label('Smart Merge Sync', '智能合并同步') })
    .first()
    .click();

  const dialog = page.locator('[role="alertdialog"], [role="dialog"]').first();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog
    .getByRole('button', { name: label('Start Sync', '开始同步') })
    .first()
    .click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });

  await expect
    .poll(async () => (await storeKeys(extPage, DOUBAN)).length, {
      timeout: 30_000,
      message: '确认后写消息未真正送达后台（检查 safeSendMessage 的 retries 取值）',
    })
    .toBe(3);
  await page.close();
});
