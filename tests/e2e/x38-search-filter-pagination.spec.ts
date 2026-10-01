/**
 * X27-C 第三波 — the search results page: the 全部/电影/剧集 filter tabs and the
 * paginator (10 click sites across App.vue + UmmSearchFilter + UmmSearchCard;
 * the existing `x27a-douban-search.spec.ts` covers rendering, pairing and one
 * external-write refresh, but no filter or pagination click).
 *
 * Pinned contracts:
 *  - the three filter tabs are a PARTITION of the rendered set (剧集 ∪ 非剧集 == 全部),
 *    which a per-state count alone cannot express;
 *  - page links carry the host's own paging step (`start` offset), and the
 *    navigation round-trips through the fixture route (no dead overlay after nav);
 *  - the jump box clamps to the last page and an empty box navigates nowhere —
 *    a URL built from raw user input is exactly where bogus offsets leak.
 */

import { expect, setStoredLanguage, test } from './fixtures/extension-harness';
import {
  labelFirstSubjectsAsTv,
  openDoubanFixturePage,
  type DoubanFixtureRule,
} from './fixtures/douban-crawl-fixtures';

const SEARCH_URL = 'https://search.douban.com/movie/subject_search?search_text=E2E&cat=1002';
const OVERLAY = '#umm-search-overlay';
// The card root is the anchor itself (`a.umm-search-card`), the same selector the
// render spec uses — a bare `.umm-search-card` also matches nested fragments.
const CARDS = `${OVERLAY} a.umm-search-card`;
const PAGER = `${OVERLAY} .umm-paginator`;

const RULE: DoubanFixtureRule = {
  host: 'search.douban.com',
  match: '/movie/subject_search',
  fixture: 'search',
};

/**
 * The crawl carries no 剧集 result, which would leave the tv side of the filter
 * empty and its assertions vacuous. This rule serves the SAME crawled body with
 * one item's label array filled in, so both sides of the partition are real.
 */
const TV_RULE: DoubanFixtureRule = {
  ...RULE,
  transform: (html) => labelFirstSubjectsAsTv(html, 1),
};

async function openSearchPage(
  extContext: Parameters<typeof openDoubanFixturePage>[0],
  rule: DoubanFixtureRule = RULE,
) {
  const page = await openDoubanFixturePage(extContext, rule, SEARCH_URL);
  await expect(page.locator(CARDS).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

const typeBtn = (label: string): string => `${OVERLAY} .umm-type-btn:has-text("${label}")`;
const activeBtn = `${OVERLAY} .umm-type-btn--active`;

test('三个筛选页签是已渲染集合的一个划分（剧集 + 非剧集 == 全部）', async ({
  extContext,
  extPage,
}) => {
  // X109：筛选页签文案已入词典（UmmSearchFilter）⇒ 本例的文案断言先钉 zh-CN。
  await setStoredLanguage(extPage, 'zh-CN');
  const page = await openSearchPage(extContext, TV_RULE);

  const allCount = await page.locator(CARDS).count();
  expect(allCount, 'the fixture needs at least two result cards').toBeGreaterThanOrEqual(2);
  await expect(page.locator(activeBtn)).toHaveText('全部');

  // Classification must agree with what the card actually displays.
  const labelledTv = (await page.locator(CARDS).allInnerTexts()).filter((t) =>
    t.includes('剧集'),
  ).length;
  // Both sides have to be populated, or "the filter partitions the set" is
  // satisfied by an empty subset and proves nothing.
  expect(
    labelledTv,
    'no card carries the 剧集 marker the filter selects on',
  ).toBeGreaterThanOrEqual(1);
  const movieExpected = allCount - labelledTv;
  expect(movieExpected, 'every card is 剧集, so the 电影 side is empty').toBeGreaterThanOrEqual(1);

  await page.locator(typeBtn('剧集')).click();
  const tvCount = await page.locator(CARDS).count();
  await expect(page.locator(activeBtn)).toHaveText('剧集');
  for (const text of await page.locator(CARDS).allInnerTexts()) {
    expect(text, `card without a 剧集 marker: ${JSON.stringify(text.slice(0, 40))}`).toContain(
      '剧集',
    );
  }
  expect(tvCount).toBe(labelledTv);

  await page.locator(typeBtn('电影')).click();
  const movieCount = await page.locator(CARDS).count();
  await expect(page.locator(activeBtn)).toHaveText('电影');
  expect(movieCount).toBe(movieExpected);
  for (const text of await page.locator(CARDS).allInnerTexts()) {
    expect(text).not.toContain('剧集');
  }

  // The partition invariant: nothing dropped, nothing duplicated.
  expect(tvCount + movieCount).toBe(allCount);

  await page.locator(typeBtn('全部')).click();
  await expect(page.locator(CARDS)).toHaveCount(allCount);
  await expect(page.locator(activeBtn)).toHaveText('全部');
});

test('下一页链接带宿主分页步长，导航后 overlay 仍然可用', async ({ extContext, extPage }) => {
  // X108：搜索分页文案已入词典 ⇒ 先钉 zh-CN 再按中文选择器断言（夹具是中文页）。
  await setStoredLanguage(extPage, 'zh-CN');
  const page = await openSearchPage(extContext);
  await expect(page.locator(PAGER)).toBeVisible();

  const next = page.locator(`${OVERLAY} a.umm-page-link:has-text("下一页")`);
  await expect(next).toBeVisible();
  const href = (await next.getAttribute('href')) ?? '';
  expect(href, 'the next-page href must carry a start offset').toMatch(/[?&]start=\d+/);

  await next.click();
  await expect(page).toHaveURL(/start=\d+/);
  // The fixture serves the same body for any start, so the overlay re-boots on
  // page 1 — the point is that navigation leaves a working overlay behind.
  await expect(page.locator(CARDS).first()).toBeVisible({ timeout: 60_000 });
});

test('跳转框：超界页码 clamp 到末页，空输入不导航', async ({ extContext, extPage }) => {
  await setStoredLanguage(extPage, 'zh-CN');
  const page = await openSearchPage(extContext);
  const lastHref = (await page
    .locator(`${OVERLAY} a.umm-page-link:has-text("末页")`)
    .getAttribute('href')) as string | null;
  expect(lastHref, 'the fixture must expose a last-page link').toBeTruthy();

  const input = page.locator(`${OVERLAY} .umm-page-input`);
  await input.fill('999');
  await page.locator(`${OVERLAY} .umm-page-go`).click();
  await expect(page).toHaveURL(new RegExp(`start=${new URL(lastHref!).searchParams.get('start')}`));

  // Back to a known page, then an empty jump box must not navigate at all.
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(CARDS).first()).toBeVisible({ timeout: 60_000 });
  await page.locator(`${OVERLAY} .umm-page-input`).fill('');
  await page.locator(`${OVERLAY} .umm-page-go`).click();
  await expect(page).toHaveURL(/subject_search/);
  expect(page.url()).not.toContain('start=');
  await expect(page.locator(CARDS).first()).toBeVisible();
});
