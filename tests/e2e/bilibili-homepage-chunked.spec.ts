/**
 * X14 #5 — single-site content script under the chunked-write guard.
 *
 * Chain (all production code, real MV3 service worker in between):
 *   entrypoints/bilibili-homepage.content (manifest `*://www.bilibili.com/*`,
 *   document_idle) → parseBiliListingRoute('https://www.bilibili.com/') =
 *   'www-listing' → isListingCapableRoute → initListing: injectStyles
 *   (#umm-bili-homepage-styles) + tryInit (root `.bili-feed4` from
 *   LISTING_ROOT_SELECTORS) → runListingDimmerPass over 1 000 cards.
 *
 * Both write phases go through runChunked (src/libraries/utils/dom-chunk.ts):
 * phase 1 runs ONE card group per scheduled tick (LISTING_CHUNK_SIZE=10 → 100
 * groups for 1 000 cards, badges pre-created), then a single DB_GET_BULK over
 * `movie::<bvid>` keys of `bilibili_records`, then phase 2 re-writes only the
 * 30 found records. Measured note: with the tab in the foreground the writes
 * arrive 10 per delivery, exactly matching the chunk size; with the tab
 * backgrounded Chromium coalesces its animation frames and ~20 groups land in
 * one delivery — which is why the budget below is half the corpus, not the
 * chunk size, and why the spec refuses to run on a hidden page.
 *
 * Two independent proofs about the write pass:
 *  - SHAPE: every `data-umm-bili-processed` write is attributed to the
 *    MutationObserver delivery that carried it (= one task's writes). Chunked
 *    and foregrounded, the corpus arrives in 100 deliveries of 10
 *    (LISTING_CHUNK_SIZE); the ~5 deliveries of ~200 figure is the *throttled*
 *    reading the visibility precondition below exists to refuse. With the chunk
 *    size collapsed to one shot it arrives as a single delivery of 1 000 (all
 *    three measured, X71). That is the leg which can catch "chunking switched
 *    off"; the old 5 ms interval sampler used to do it here flaked on unchanged
 *    code (a ~27 ms pass gets ~4 ticks — seeing an intermediate level was luck);
 *  - BLOCKING: no animation frame may be blocked longer than GAP_BUDGET_MS, and
 *    the same run must see a deliberate main-thread block (positive control).
 *    Reported honestly: this leg measures 87 ms chunked vs 64-68 ms one-shot, so
 *    it bounds jank and proves the probe alive — it does NOT police chunking.
 *
 * Dim target discipline is asserted too: homepage cards have no
 * DIMMER_WRAPPER_SELECTORS shell ancestor, so findDimShell returns null and the
 * class must land on the CARD (exclusive shell XOR card — compound opacity on
 * both would be the regression).
 */

import { expect, test } from './fixtures/extension-harness';
import {
  BILIBILI_STORE,
  installBilibiliMocks,
  seedRecord,
  waitForBackgroundReady,
} from './fixtures/host-mocks';
import {
  RAF_GAP_INIT_SCRIPT,
  armWriteBatchProbe,
  blockMainThread,
  readRafGaps,
  readWriteBatches,
  requireVisiblePage,
} from './fixtures/overlay-probe';
import { biliStoreKey, bilibiliHomepageHtml, makeBiliCards } from './fixtures/bilibili-page';

const HOME_URL = 'https://www.bilibili.com/';
const PROCESSED_MARK_ATTR = 'data-umm-bili-processed';
const PROCESSED_ATTR = `[${PROCESSED_MARK_ATTR}]`;
const STYLE_ID = '#umm-bili-homepage-styles';

/**
 * Jank budget on the probe that actually MEASURES (X71 retrofit).
 *
 * This leg asserted on `PerformanceObserver('longtask')` durations until X69's
 * control experiment killed that: a deliberate 220 ms main-thread block produced
 * zero entries on the first read, so an assertion over an empty list was a
 * budget in name only. The hard number is now the largest rAF gap — a frame
 * callback cannot run while the main thread is busy — and the same run must SEE
 * a deliberate `blockMainThread` block, or the spec reports itself blind.
 *
 * X112/X113 定级（负载实测 + 复审收口）：本腿的角色是**挂死看门狗**——分片判别
 * 由上面的写入形状腿（(b′)）承担，探针探盲性由同一运行内的 `blockMainThread`
 * 正对照保证（硬断言，未动）。数字的来历与取舍：空载实测分片与一趟写分别落在
 * 51–87ms 与 64–68ms（同一噪声带，X71 记）；负载下同一份代码被调度器拖到 1968ms
 * （bilibili-homepage 单例红，隔离复跑 6.9s 绿）。3s 对 1.968s 只有 1.5× 余量，
 * 下一场负载仍会把正确代码判红，故取 10s＝明确的「只拦挂死」量级——负载型
 * 1–2s 停顿**有意**不判红（属于环境不属于产品；要拦它得用同 run 空闲基线做
 * 相对判据，那是另一条腿的设计，未做）。
 */
const GAP_BUDGET_MS = 10_000;
const CONTROL_BLOCK_MS = 300;
const CONTROL_FLOOR_MS = 200;

/**
 * Corpus size, deliberately 5× the fixture default.
 *
 * The old non-synchronicity leg sampled the processed-card level every 5 ms and
 * required intermediate levels. Measured here (X71): the 200-card pass finishes
 * in ~27 ms — which at a 5 ms tick means ~4 samples for the whole pass, so
 * "saw an intermediate level" was luck, and the leg flaked three times in this
 * session on UNCHANGED code. 1 000 cards puts the pass in the range where the
 * remaining leg (largest rAF gap) can actually discriminate chunked from
 * one-shot writes, which is the thing worth guarding.
 */
const CARD_COUNT = 1000;

const CARDS = makeBiliCards(CARD_COUNT);
// Controls: cards the fixture never seeds (watched = first 30).
const CLEAN_INDEX = 500;
const LAST_INDEX = CARD_COUNT - 1;
const WATCHED = CARDS.filter((card) => card.watched);
const UNWATCHED = CARDS.filter((card) => !card.watched);
const TOTAL = CARDS.length;

function cardByIndex(index: number): string {
  return `.bili-video-card[data-card-id="${CARDS[index]!.bvid}"]`;
}

test('1000 bilibili homepage cards are marked through runChunked: writes spread across deliveries, no frame gap over budget', async ({
  extContext,
  extPage,
}) => {
  await installBilibiliMocks(extContext, { homepageHtml: bilibiliHomepageHtml(CARDS) });

  // Seed before navigation (popup origin → SW → IndexedDB) so the very first
  // pass already has records to find — phase 2 is then driven by real data.
  for (const card of WATCHED) {
    const res = await seedRecord(
      extPage,
      BILIBILI_STORE,
      biliStoreKey(card),
      `https://www.bilibili.com/video/${card.bvid}/`,
    );
    expect(res.success).toBe(true);
  }

  await waitForBackgroundReady(extPage, BILIBILI_STORE);

  const page = await extContext.newPage();
  // Timing and shape legs are only meaningful on a rendering page.
  await requireVisiblePage(page);
  // Both probes must pre-date the document_idle injection pass.
  await page.addInitScript(RAF_GAP_INIT_SCRIPT);
  await armWriteBatchProbe(page, { attribute: PROCESSED_MARK_ATTR });

  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });

  // (a) the script's own sheet is in the host document → injectStyles ran.
  await expect(page.locator(STYLE_ID)).toBeAttached({ timeout: 60_000 });

  // (b) phase 1 covered every card exactly once (processed attr + pre-created badge).
  await expect(page.locator(PROCESSED_ATTR)).toHaveCount(TOTAL, { timeout: 60_000 });
  await expect(page.locator('.umm-bili-badge')).toHaveCount(TOTAL, { timeout: 30_000 });

  // (b′) 写入形状 —— 本波真正有牙的分片守卫。实测（X71，前台标签页）：分片构建下
  // 1000 条标记落在 100 个投递批次里，每批 10 条＝正好等于 LISTING_CHUNK_SIZE；
  // 把 chunkSize 调成一趟写完全部就是 1 批 1000 条，变异已证明这条会变红。
  // 上限取「语料一半」而不是「分片大小」：合帧时一次投递能攒到 ~200 条——那是
  // **被节流的读法**（正是可见性前置要拒绝的状态），按 10 卡上限会误红正确代码；
  // 按 500 既容得下抖动，又容不下一趟写完整语料。
  // 为什么毫秒预算不行：同一批实验里最大帧间隙是 51-87ms（分片）对 64-68ms（一趟），
  // 两套构建落在同一条噪声带里，预算只兜得住「卡死级」阻塞。两者分工：
  // (b′) 管形状，(g) 管阻塞上界。
  const probe = await readWriteBatches(page);
  expect(probe, 'write-batch probe never armed → the write shape would be vacuous').not.toBeNull();
  const counts = probe?.counts ?? [];
  const worstBatch = counts.length > 0 ? Math.max(...counts) : 0;
  console.log(
    `[writes] ${String(probe?.total ?? 0)} 次标记写入，${counts.length} 个投递批次，` +
      `跨度 ${String(probe?.windowMs ?? 0)}ms，逐批 ${counts.slice(0, 25).join('/')}`,
  );
  expect(
    probe?.total ?? 0,
    'the probe saw fewer marks than the DOM carries',
  ).toBeGreaterThanOrEqual(TOTAL);
  expect(counts.length, '全部标记落在同一个投递批次 ⇒ 写入没有摊开').toBeGreaterThanOrEqual(2);
  expect(
    worstBatch,
    `单批写入 ${worstBatch} 条，超过语料一半 ${String(CARD_COUNT / 2)}`,
  ).toBeLessThanOrEqual(CARD_COUNT / 2);

  // (c) phase 2 dimmed exactly the 30 seeded cards, on the CARD not a shell.
  await expect(page.locator('.bili-video-card.umm-viewed')).toHaveCount(WATCHED.length, {
    timeout: 30_000,
  });
  await expect(page.locator('.umm-bili-dim-shell')).toHaveCount(0);
  // Unwatched controls stay clean.
  await expect(page.locator(cardByIndex(CLEAN_INDEX))).not.toHaveClass(/umm-viewed/);

  // (d) the dim is the injected rule, not just a class name (transition means
  // the computed value settles over ~300ms → poll instead of a single read).
  await expect
    .poll(
      async () => {
        return page.evaluate((sel: string) => {
          const el = document.querySelector(sel);
          return el ? getComputedStyle(el).opacity : 'missing';
        }, cardByIndex(0));
      },
      { timeout: 15_000 },
    )
    .toBe('0.35');
  const cleanOpacity = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).opacity : 'missing';
  }, cardByIndex(LAST_INDEX));
  expect(cleanOpacity).toBe('1');

  // (e) badges carry the DB verdict, not a constant: '已看 8' for the seeded
  // status-2/rating-8 records, '未看' where DB_GET_BULK omitted the key.
  const watchedBadge = page.locator(`${cardByIndex(0)} .umm-bili-badge`);
  await expect(watchedBadge).toHaveText('已看 8');
  await expect(page.locator(`${cardByIndex(CLEAN_INDEX)} .umm-bili-badge`)).toHaveText('未看');
  // Badges mount on the BADGE_ANCHOR_SELECTORS hit (.bili-video-card__cover),
  // which is what setListingBadge's position:relative surgery enables.
  const badgeParent = await page.evaluate(
    (sel: string) => document.querySelector(`${sel} .umm-bili-badge`)?.parentElement?.className,
    cardByIndex(0),
  );
  expect(badgeParent).toBe('bili-video-card__cover');
  await expect(watchedBadge).toHaveCSS('position', 'absolute');

  // (g) jank budget over the whole run (both chunked passes + observer re-runs).
  const gaps = await readRafGaps(page);
  const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
  console.log(
    `[jank] ${String(TOTAL)}-card run: ${String(gaps.length)} raf gaps max=${String(maxGap)}ms`,
  );
  expect(maxGap, `the write pass blocked painting for ${String(maxGap)}ms`).toBeLessThanOrEqual(
    GAP_BUDGET_MS,
  );

  // 正对照：同一次运行里真的占住主线程，记录器必须报出这个量级 —— 否则
  // 「没有掉帧」与「没在测」长得一模一样。
  const before = (await readRafGaps(page)).length;
  await blockMainThread(page, CONTROL_BLOCK_MS);
  const controlGaps = (await readRafGaps(page)).slice(before);
  const maxControlGap = controlGaps.length > 0 ? Math.max(...controlGaps) : 0;
  expect(
    maxControlGap,
    `probe blind: a ${String(CONTROL_BLOCK_MS)}ms block was recorded as ${String(maxControlGap)}ms`,
  ).toBeGreaterThanOrEqual(CONTROL_FLOOR_MS);

  // Every seeded card is accounted for (no silent partial pass).
  expect(WATCHED.length).toBe(30);
  expect(UNWATCHED.length).toBe(CARD_COUNT - 30);
});
