/**
 * X49 — game-explore "加载更多" in a real browser (the 4th click site on that
 * page, and the only incremental-append path in the whole Douban overlay set).
 *
 * Why it matters beyond "the button works":
 *  - `fetchMoreGames` has a re-entrancy guard (`loading || !hasMore`) and a
 *    terminal state (the button is replaced by an end marker once the cursor
 *    runs out). Neither was exercised.
 *  - appended items grow the visible-id set, which is exactly the path X31-B's
 *    `useRecordCache` re-read was added for. This proves the growth-triggered
 *    refresh reaches NEW cards without a reload.
 *  - the append is one reactive array assignment, so a big page lands in a
 *    single render pass. The 60-item case measures the resulting frame gap
 *    against GAP_BUDGET_MS — the "一次性大批量修改导致卡顿" risk the
 *    objective calls out — rather than assuming it is fine.
 *
 * The `/j/ilmen/game/search` endpoint is stubbed locally; nothing reaches
 * douban.com.
 */

import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';
import {
  RAF_GAP_INIT_SCRIPT,
  blockMainThread,
  readRafGaps,
  requireVisiblePage,
} from './fixtures/overlay-probe';

const GAME_EXPLORE_URL = 'https://www.douban.com/game/explore';
const OVERLAY = '#umm-douban-overlay';
const ITEMS = `${OVERLAY} .umm-game-list-item`;
const LOAD_BTN = `${OVERLAY} .umm-game-load-btn`;
const END_MARKER = `${OVERLAY} .umm-game-load-end`;
/**
 * X71 retrofit: the budget is the largest rAF gap, not a `longtask` duration.
 * X71 measurement: this append really is one render pass — 60 items cost a
 * 52 ms frame gap (3 dropped frames), inside the 150 ms budget with ~3× headroom.
 * It is deliberately NOT chunked: splitting the array push would make
 * `useRecordCache`'s growth-triggered re-read (X31-B) fire once per chunk, i.e.
 * several extra DB round-trips to save ~40 ms of a hitch the user already
 * paid a network wait for. If the page size ever grows past ~150 items the
 * budget goes red, and that is the moment to revisit.
 * X69's control experiment showed longtask entries can be absent even when a
 * 220 ms block really happened, so an assertion over an empty list proved
 * nothing. The same run now has to SEE a deliberate main-thread block.
 */
const GAP_BUDGET_MS = 150;
const CONTROL_BLOCK_MS = 300;
const CONTROL_FLOOR_MS = 200;

const RULE: DoubanFixtureRule = {
  host: 'www.douban.com',
  match: '/game/explore',
  fixture: 'game-explore-dom',
};

const APPENDED_IDS = ['90001001', '90001002', '90001003'];

function gamePayload(index: number, id: string): Record<string, unknown> {
  return {
    id,
    title: `E2E 追加 ${index}`,
    url: `https://www.douban.com/game/${id}/`,
    rating: '8.1',
    star: '45',
    cover: 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p0.jpg',
    genres: '动作 / 冒险',
    platforms: 'PC',
    review: null,
    n_ratings: 10,
  };
}

/** Stub the paged endpoint; `delayMs` lets a slow response expose re-entrancy. */
async function stubSearch(
  page: import('@playwright/test').Page,
  opts: { count: number; more: number; status?: number; delayMs?: number },
): Promise<{ requests: string[] }> {
  const requests: string[] = [];
  await page.route('**/j/ilmen/game/search**', async (route) => {
    requests.push(new URL(route.request().url()).searchParams.get('more') ?? '');
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.status && opts.status >= 400) {
      await route.fulfill({ status: opts.status, contentType: 'text/plain', body: 'down' });
      return;
    }
    const games = Array.from({ length: opts.count }, (_, i) =>
      gamePayload(i + 1, String(Number(APPENDED_IDS[0]) + i)),
    );
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ games, total: opts.count, more: opts.more }),
    });
  });
  return { requests };
}

async function openExplore(extContext: Parameters<typeof openDoubanFixturePage>[0]) {
  const page = await openDoubanFixturePage(extContext, RULE, GAME_EXPLORE_URL, {
    shell: 'umm-douban-overlay',
  });
  // The append leg measures frame gaps; a throttled background page makes them
  // meaningless (and the page here shares a window with the extension's own).
  await requireVisiblePage(page);
  await expect(page.locator(ITEMS).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

test('加载更多追加恰好 N 条、无重复，游标耗尽后换成结束标记', async ({ extContext }) => {
  const page = await openExplore(extContext);
  const stub = await stubSearch(page, { count: 3, more: 0 });
  const before = await page.locator(ITEMS).count();
  expect(before).toBeGreaterThanOrEqual(1);

  await page.locator(LOAD_BTN).click();
  await expect(page.locator(ITEMS)).toHaveCount(before + 3, { timeout: 30_000 });

  const titles = await page.locator(`${OVERLAY} .umm-game-item-title`).allInnerTexts();
  const normalized = titles.map((t) => t.trim());
  expect(new Set(normalized).size, 'appended cards duplicated an existing title').toBe(
    normalized.length,
  );
  expect(normalized).toContain('E2E 追加 1');

  // Cursor exhausted → the button is replaced by the end marker (no dead button
  // that fires an empty request).
  await expect(page.locator(LOAD_BTN)).toHaveCount(0);
  await expect(page.locator(END_MARKER)).toBeVisible();
  expect(stub.requests).toEqual(['2']);
  await page.close();
});

test('慢响应期间连点两次只发一次请求（重入守卫）', async ({ extContext }) => {
  const page = await openExplore(extContext);
  const stub = await stubSearch(page, { count: 3, more: 5, delayMs: 2500 });
  const before = await page.locator(ITEMS).count();

  // Two clicks must land in the same task, while the first response is still
  // pending. A normal `.click()` would wait for the button to become enabled
  // again (the `:disabled="loading"` binding), which would measure Playwright's
  // actionability wait instead of the component's guard.
  const clicked = await page.evaluate(() => {
    const root = document.getElementById('umm-douban-overlay')?.shadowRoot ?? null;
    const btn = root?.querySelector<HTMLButtonElement>('.umm-game-load-btn');
    if (!btn) return 0;
    btn.click();
    btn.click();
    return 2;
  });
  expect(clicked, 'load-more button not found in the shadow tree').toBe(2);

  await expect(page.locator(ITEMS)).toHaveCount(before + 3, { timeout: 30_000 });
  expect(stub.requests.length, 'the second click must be swallowed by the guard').toBe(1);
  await page.close();
});

test('追加进来的条目能拿到已存在的记录徽章，且不需要重载', async ({ extContext, extPage }) => {
  const page = await openExplore(extContext);
  await stubSearch(page, { count: 3, more: 0 });

  const appendedId = APPENDED_IDS[0] ?? '';
  const key = `game::${appendedId}`;
  const seeded = await sendRuntimeMessage(extPage, 'DB_PUT', {
    storeName: DOUBAN_STORE,
    key,
    record: makeStoreRecord(`https://www.douban.com/game/${appendedId}/`, 1, 0),
  });
  expect(seeded.success).toBe(true);

  await page.locator(LOAD_BTN).click();
  const appended = page.locator(`${ITEMS}:has(.umm-game-item-title:text-is("E2E 追加 1"))`).first();
  await expect(appended.locator('.umm-status--wish')).toHaveCount(1, { timeout: 30_000 });
  // Exactly the appended card is marked; the pre-existing host cards stay clean.
  await expect(page.locator(`${OVERLAY} .umm-status--wish`)).toHaveCount(1);

  await page.close();
});

test('一次追加 60 条不超过帧间隙预算，且探针自证看得见 300ms 阻塞（防一次性大批量 DOM 写入）', async ({
  extContext,
}) => {
  const page = await openExplore(extContext);
  await stubSearch(page, { count: 60, more: 0 });
  const before = await page.locator(ITEMS).count();

  // The probe only exists for navigations after it is registered, so install it
  // and reload once — otherwise an absent recorder would look like "no dropped
  // frames happened".
  await page.addInitScript(RAF_GAP_INIT_SCRIPT);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator(ITEMS).first()).toBeVisible({ timeout: 60_000 });
  const probeInstalled = await page.evaluate(() =>
    Array.isArray((window as Window & { __ummRafGaps?: number[] }).__ummRafGaps),
  );
  expect(probeInstalled, 'rAF recorder never installed → the assertion would be vacuous').toBe(
    true,
  );

  const markBefore = (await readRafGaps(page)).length;
  await page.locator(LOAD_BTN).click();
  await expect(page.locator(ITEMS)).toHaveCount(before + 60, { timeout: 30_000 });

  const appended = (await readRafGaps(page)).slice(markBefore);
  const worst = appended.length > 0 ? Math.max(...appended) : 0;
  console.log(`[jank] 追加 60 条：${String(appended.length)} 个帧间隙，最大 ${String(worst)}ms`);
  expect(worst, `appending 60 cards blocked painting for ${String(worst)}ms`).toBeLessThanOrEqual(
    GAP_BUDGET_MS,
  );

  // 正对照：同一次运行里真的占住主线程，记录器必须报出这个量级。
  const controlBefore = (await readRafGaps(page)).length;
  await blockMainThread(page, CONTROL_BLOCK_MS);
  const controlGaps = (await readRafGaps(page)).slice(controlBefore);
  const maxControlGap = controlGaps.length > 0 ? Math.max(...controlGaps) : 0;
  expect(
    maxControlGap,
    `probe blind: a ${String(CONTROL_BLOCK_MS)}ms block was recorded as ${String(maxControlGap)}ms`,
  ).toBeGreaterThanOrEqual(CONTROL_FLOOR_MS);
  await page.close();
});
