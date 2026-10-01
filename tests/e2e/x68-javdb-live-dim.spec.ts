/**
 * X68 — JavDB dimming is two-way in a real browser.
 *
 * The enhancer reads the adult-av stores (not `douban_records`), and before X67
 * it only ever *added* the dim: `run()` is add-only, so a record deleted
 * elsewhere left the already-rendered cards stale until reload — the same
 * one-way gap X18/X32 closed for PT listings. This drives the whole chain
 * (SPA message → service-worker write → per-tab EVENT_BUS broadcast →
 * content-script recompute) against a locally served JavDB list page, so
 * nothing reaches javdb.com.
 */

import type { Page } from '@playwright/test';
import { expect, sendRuntimeMessage, test } from './fixtures/extension-harness';
import { JAV_IDS_STORE, installHostMock, waitForBackgroundReady } from './fixtures/host-mocks';

const LIST_URL = 'https://javdb.com/cn/videos';
const AVID = 'SSIS-001';
const OTHER = 'ABC-123';

const LIST_HTML = `<!doctype html><html lang="zh"><head><title>JavDB E2E</title></head><body>
  <div id="main-container"><div class="movie-list">
    <div class="item"><a href="/v/1"><div class="video-title"><strong>${AVID}</strong></div></a></div>
    <div class="item"><a href="/v/2"><div class="video-title"><strong>${OTHER}</strong></div></a></div>
  </div></div>
</body></html>`;

/**
 * Open the list page with the host served locally. Each test gets a fresh
 * extension profile, so the caller gates on `waitForBackgroundReady` first —
 * otherwise the content script's very first read races the cold service
 * worker's IndexedDB open and can time out (see host-mocks).
 */
async function openJavdb(
  extContext: Parameters<typeof installHostMock>[0],
  page: Page,
): Promise<void> {
  await installHostMock(extContext, ['*://javdb.com/**'], (url) =>
    url.pathname.startsWith('/cn/videos') ? { body: LIST_HTML, contentType: 'text/html' } : null,
  );
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.item').first().locator('.video-title strong')).toHaveText(AVID, {
    timeout: 60_000,
  });
}

test('记录被别处新增/删除时，JavDB 的淡化免重载双向跟随', async ({ extContext, extPage }) => {
  await waitForBackgroundReady(extPage, JAV_IDS_STORE);
  const page = await extContext.newPage();
  await openJavdb(extContext, page);

  const first = page.locator('.item').first();
  const second = page.locator('.item').nth(1);

  // 两张卡都必须先被扫描记账，否则后面的断言是假过：
  // 「未淡化」也可能来自「这个元素根本没被处理」，而不是重算读回了空集合。
  await expect(first).toHaveAttribute('data-umm-avid', AVID, { timeout: 30_000 });
  await expect(second).toHaveAttribute('data-umm-avid', OTHER, { timeout: 30_000 });
  await expect(first).not.toHaveClass(/umm-viewed/);

  // SSIS-* 归日系 → ADULT_AV_ADD 自行分类写入 jav_ids，键形态与下面的删除一致。
  const added = await sendRuntimeMessage(extPage, 'ADULT_AV_ADD', {
    source: 'javdb',
    id: AVID,
    rating: 0,
  });
  expect(added.success, 'adult-av add failed in the background').toBe(true);
  await expect(first, 'external write must dim without reload').toHaveClass(/umm-viewed/, {
    timeout: 30_000,
  });

  const deleted = await sendRuntimeMessage(extPage, 'DB_DELETE', {
    storeName: JAV_IDS_STORE,
    key: `javdb::${AVID}`,
  });
  expect(deleted.success, 'delete failed in the background').toBe(true);
  await expect(first, 'external delete must clear the dim without reload').not.toHaveClass(
    /umm-viewed/,
    { timeout: 30_000 },
  );

  // 重算只跟随真实状态：邻居全程在场，却始终未被牵连。
  await expect(second).not.toHaveClass(/umm-viewed/);
  await page.close();
});
