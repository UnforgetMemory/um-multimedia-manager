/**
 * X57 — game-explore filter chips + sort buttons (3 click sites).
 *
 * Evidence caveat: `game-explore-dom` is a **synthetic** fixture (its own header
 * says so, authored for `game-explore-data.spec.ts`), so nothing here claims
 * "matches what Douban does". What is claimed are the component's own
 * invariants — the ones that break silently:
 *  - a chip click changes exactly ONE facet, by exactly ONE value, and the
 *    "全部×" option of that same facet is exclusive (it lights up only when the
 *    facet has no values left, and goes away as soon as one is added);
 *  - re-clicking a chip withdraws that value instead of appending it;
 *  - unrelated params (q / sort) survive every filter click, and a sort click
 *    leaves the facets intact.
 */

import { expect, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const OVERLAY = '#umm-douban-overlay';
const GROUP = `${OVERLAY} .umm-game-filter-group`;
const CHIP = '.umm-game-filter-chip';
const ACTIVE_CHIP = '.umm-game-filter-chip--active';
const SORT_BTN = `${OVERLAY} .umm-game-sort-btn`;

const RULE: DoubanFixtureRule = {
  host: 'www.douban.com',
  match: '/game/explore',
  fixture: 'game-explore-dom',
};

function facetValues(url: string, facet: string): string[] {
  return (new URL(url).searchParams.get(facet) ?? '').split(',').filter(Boolean);
}

async function openExplore(extContext: Parameters<typeof openDoubanFixturePage>[0], url: string) {
  const page = await openDoubanFixturePage(extContext, RULE, url);
  await expect(page.locator(`${CHIP}`).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

const settle = (ms = 700): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('加一个值只动一个 facet；同组的「全部」随之选取消散', async ({ extContext }) => {
  const page = await openExplore(
    extContext,
    'https://www.douban.com/game/explore?q=eos&sort=rating&genres=1',
  );
  const genres = page.locator(GROUP).first();

  await expect(genres.locator(ACTIVE_CHIP)).toHaveCount(1);
  const before = new URL(page.url()).searchParams;

  // Target the concrete non-unique option (the "全部" chip is exclusive and would
  // clear the facet instead of adding to it).
  await genres.locator(CHIP, { hasText: '冒险' }).click();
  await settle();

  const after = new URL(page.url()).searchParams;
  expect(after.get('q'), 'keyword must survive').toBe(before.get('q'));
  expect(after.get('sort'), 'sort must survive').toBe(before.get('sort'));
  expect(facetValues(page.url(), 'genres')).toEqual(['1', '7']);
  expect(facetValues(page.url(), 'platforms'), 'other facets untouched').toEqual([]);
  await expect(genres.locator(ACTIVE_CHIP)).toHaveCount(2);
  await page.close();
});

test('清空一个 facet 后该组的「全部」重新亮起，再选原值只留那一个', async ({ extContext }) => {
  const page = await openExplore(extContext, 'https://www.douban.com/game/explore?genres=1');
  const genres = page.locator(GROUP).first();
  const selected = genres.locator(ACTIVE_CHIP);
  await expect(selected).toHaveCount(1);
  const label = (await selected.first().innerText()).trim();

  await selected.first().click();
  await settle();
  expect(facetValues(page.url(), 'genres')).toEqual([]);
  // Exclusive "全部×" takes over for the emptied facet.
  await expect(genres.locator(ACTIVE_CHIP)).toHaveCount(1);
  await expect(genres.locator(ACTIVE_CHIP)).toHaveText(/^全部/);

  await genres.locator(CHIP, { hasText: label }).click();
  await settle();
  expect(facetValues(page.url(), 'genres')).toEqual(['1']);
  await expect(genres.locator(ACTIVE_CHIP)).toHaveCount(1);
  await page.close();
});

test('点同组的「全部」是清空该 facet（与「追加一个值」走不同分支）', async ({ extContext }) => {
  // Discriminating case for the `isUnique` branch: the normal path would append
  // an empty value and leave 动作 selected, so only the unique branch clears the
  // facet. Without this test the two branches are observationally identical and
  // a regression in `isUnique` handling passes silently.
  const page = await openExplore(
    extContext,
    'https://www.douban.com/game/explore?genres=1&sort=rating',
  );
  const genres = page.locator(GROUP).first();
  await expect(genres.locator(ACTIVE_CHIP)).toHaveText(/^动作/);

  await genres.locator(CHIP, { hasText: /^全部/ }).click();
  await settle();

  expect(facetValues(page.url(), 'genres'), '"全部" must clear the facet').toEqual([]);
  expect(
    new URL(page.url()).searchParams.get('genres'),
    'the facet param must be present-but-empty, not "1,"',
  ).toBe('');
  expect(new URL(page.url()).searchParams.get('sort'), 'sort survives').toBe('rating');
  await expect(genres.locator(ACTIVE_CHIP)).toHaveText(/^全部/);
  await page.close();
});

test('排序按钮切换 sort，并保留已有筛选；active 只有一个且跟着 URL', async ({ extContext }) => {
  const page = await openExplore(
    extContext,
    'https://www.douban.com/game/explore?genres=1&sort=rating',
  );

  await expect(page.locator(`${SORT_BTN}--active`)).toHaveCount(1);
  await page.locator(`${SORT_BTN}:not(.umm-game-sort-btn--active)`).first().click();
  await settle();

  const after = new URL(page.url()).searchParams;
  expect(after.get('sort'), 'sort must change').not.toBe('rating');
  expect(after.get('sort')).toBe('original_release_date');
  expect(facetValues(page.url(), 'genres'), 'facets must survive a sort switch').toEqual(['1']);
  await expect(page.locator(`${SORT_BTN}--active`)).toHaveCount(1);
  await expect(page.locator(SORT_BTN)).toHaveCount(2);
  await page.close();
});
