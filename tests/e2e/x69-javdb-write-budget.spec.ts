/**
 * X69 — the JavDB write pass measured, not assumed.
 *
 * The DOM-write audit listed `handlers/javdb.ts` as "unbounded host-driven
 * writes, not chunked" and put it first in its risk ranking. Measuring it is
 * cheaper than agreeing: with 300 cards served locally (150 pre-seeded, so both
 * legs run — the per-card scan writes and the per-card dim writes) the whole
 * pass costs a **33 ms** main-thread gap, and the pass is incremental by
 * construction (`data-umm-processed` means a later observer run only touches
 * new cards). Chunking a 33 ms pass would add a frame-scheduling dependency for
 * no measurable win, so this wave does NOT chunk it — and pins the number
 * instead, so a future regression (a per-card await, an O(N²) rescan, a
 * read/write interleave that forces layout) gets caught.
 *
 * The probe is self-proving: the same recorder must see a deliberate 300 ms
 * main-thread block in the same run. Without that control an empty gap list
 * would look like "fast" when it actually means "not measuring" — which is
 * exactly how the `longtask`-based assertions in earlier specs were weakened
 * (see the caveat in fixtures/overlay-probe.ts).
 */

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/extension-harness';
import { sendRuntimeMessage } from './fixtures/extension-harness';
import { JAV_IDS_STORE, installHostMock, waitForBackgroundReady } from './fixtures/host-mocks';
import {
  RAF_GAP_INIT_SCRIPT,
  blockMainThread,
  readRafGaps,
  requireVisiblePage,
} from './fixtures/overlay-probe';

const LIST_URL = 'https://javdb.com/cn/videos';
const TOTAL = 300;
const SEED = 150;

/**
 * Measured 33 ms at this corpus size. 150 ms is ~4× headroom for machine noise
 * while still failing a regression that turns the pass quadratic or makes it
 * per-card-blocking — the failure modes this guards.
 */
const GAP_BUDGET_MS = 150;
const CONTROL_BLOCK_MS = 300;
const CONTROL_FLOOR_MS = 200;

function avidAt(index: number): string {
  return `SSIS-${String(index + 1).padStart(3, '0')}`;
}

const LIST_HTML = `<!doctype html><html lang="zh"><head><title>JavDB E2E</title></head><body>
  <div id="main-container"><div class="movie-list">
    ${Array.from({ length: TOTAL }, (_, i) => {
      const avid = avidAt(i);
      return `<div class="item"><a href="/v/${i}"><div class="video-title"><strong>${avid}</strong></div></a></div>`;
    }).join('\n    ')}
  </div></div>
</body></html>`;

async function gapMark(page: Page): Promise<number> {
  return (await readRafGaps(page)).length;
}

test('300 张卡的 JavDB 扫描+淡化写趟：帧间隙有界，且探针自证可见 300ms 阻塞', async ({
  extContext,
  extPage,
}) => {
  await waitForBackgroundReady(extPage, JAV_IDS_STORE);
  const seeded = await sendRuntimeMessage(extPage, 'ADULT_AV_BATCH_ADD', {
    source: 'javdb',
    items: Array.from({ length: SEED }, (_, i) => ({
      id: avidAt(i),
      rating: 0,
      url: `https://javdb.com/v/${i}`,
    })),
  });
  expect(seeded.success, 'batch seed failed').toBe(true);

  await installHostMock(extContext, ['*://javdb.com/**'], (url) =>
    url.pathname.startsWith('/cn/videos') ? { body: LIST_HTML, contentType: 'text/html' } : null,
  );

  const page = await extContext.newPage();
  await requireVisiblePage(page);
  await page.addInitScript(RAF_GAP_INIT_SCRIPT);
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });

  // 全量写入真的发生了（分片与否都必须先保证"做完了"，否则"没有卡顿"是假的）。
  await expect(page.locator('[data-umm-avid]')).toHaveCount(TOTAL, { timeout: 60_000 });
  await expect(page.locator('.item.umm-viewed')).toHaveCount(SEED, { timeout: 60_000 });

  const loadGaps = await readRafGaps(page);
  const maxLoadGap = loadGaps.length > 0 ? Math.max(...loadGaps) : 0;
  // 本文件「不做分片」的结论只由这个数字支撑，所以每次运行都把它打出来，
  // 而不是让注释里的旧测量值冒充现状。
  console.log(
    `[x69] ${TOTAL} 卡写趟实测最大帧间隙 ${maxLoadGap}ms / 预算 ${GAP_BUDGET_MS}ms（样本 ${loadGaps.length}）`,
  );
  expect(maxLoadGap, `write pass blocked the main thread for ${maxLoadGap}ms`).toBeLessThanOrEqual(
    GAP_BUDGET_MS,
  );

  // 正对照：同一次运行里真的占住主线程，记录器必须报出这个量级。
  const before = await gapMark(page);
  await blockMainThread(page, CONTROL_BLOCK_MS);
  const after = await readRafGaps(page);
  const controlGaps = after.slice(before);
  const maxControlGap = controlGaps.length > 0 ? Math.max(...controlGaps) : 0;
  expect(
    maxControlGap,
    `probe blind: a ${CONTROL_BLOCK_MS}ms block was recorded as ${maxControlGap}ms`,
  ).toBeGreaterThanOrEqual(CONTROL_FLOOR_MS);

  await page.close();
});
