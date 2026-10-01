/**
 * X91 — the dynamic island's SEARCH side, in a real browser with the real built
 * extension.
 *
 * Why this surface and not another render assertion: `UmmDynamicIsland.vue` is
 * the one shared component whose behaviour is deliberately untested everywhere
 * else — `tests/unit/umm-page-layout.spec.ts` replaces it with a props-stub and
 * says so in its own header ("NOT the island's own rendering … the vapor-mode
 * island needs the production pipeline to hydrate"), and
 * `tests/unit/search-normalizer.spec.ts` only exercises the pure function. So
 * the wiring in between — keystroke → collapse → debounce → caret, and submit →
 * per-channel URL — had no owner at all. X44 drove the 5 nav buttons; the input
 * and the submit button were still 0 operations.
 *
 * What is pinned, and why each choice is the discriminating one:
 *  - the two NORMALIZATION PATHS have different timings (instant space-collapse
 *    vs ~400 ms debounced full normalization). Asserting "collapsed already,
 *    dots still present" at t<200 ms and "dots gone" afterwards is what makes a
 *    merged/removed debounce visible; a single settled-state assertion is not.
 *  - IME composition must SUSPEND the debounced rewrite and re-arm after. Tested
 *    as the same input under the two timings, so it cannot pass by accident.
 *  - `open()` branches on `newTab`: a channel page must open a NEW tab, the game
 *    page must navigate in THIS tab and keep its own query string. The game
 *    branch also returns before the cat lookup, so `catMap.game` is unreachable
 *    — asserted as "the URL is never search.douban.com/game".
 *  - the cat ids are Douban's own channel ids (movie 1002 / music 1003 / book
 *    1001), i.e. site truth, deliberately hardcoded here so a silent edit of the
 *    table in the component is a test failure rather than a silent redirect.
 *  - the 800 ms search window must show a disabled/spinning submit button, keep a
 *    second Enter from opening a second tab, then release the button. (This is
 *    the *affordance* contract; `doSearch`'s own guard is not observable through
 *    the keyboard — implicit submission needs an enabled default button, measured.)
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const INPUT = '.umm-island-input';
const SUBMIT = '.umm-island-submit';

const DETAIL_URL = 'https://movie.douban.com/subject/1292052/';
const MUSIC_URL = 'https://music.douban.com/people/88990011/';
const BOOK_URL = 'https://book.douban.com/people/unforgetmemory/collect?sort=time&status=finish';
const GAME_URL = 'https://www.douban.com/game/explore?sort=hot';

const RULES: Record<string, DoubanFixtureRule> = {
  movie: { host: 'movie.douban.com', match: '/subject/1292052', fixture: 'detail-movie' },
  music: { host: 'music.douban.com', match: '/people/88990011', fixture: 'music-profile' },
  book: {
    host: 'book.douban.com',
    match: '/people/unforgetmemory/collect',
    fixture: 'book-collect',
  },
  game: { host: 'www.douban.com', match: '/game/explore', fixture: 'game-explore-dom' },
};

/** Douban's own channel ids for the per-type subject_search endpoint. */
const CAT = { movie: '1002', music: '1003', book: '1001' } as const;

async function openIsland(
  extContext: BrowserContext,
  key: keyof typeof RULES,
  url: string,
): Promise<Page> {
  const page = await openDoubanFixturePage(extContext, RULES[key]!, url);
  await expect(page.locator(INPUT)).toBeVisible({ timeout: 60_000 });
  return page;
}

/** URLs of tabs that appeared after the snapshot (popups the island opened). */
function freshTabs(ctx: BrowserContext, known: Set<Page>): Page[] {
  return ctx.pages().filter((p) => !known.has(p) && p.url() !== 'about:blank');
}

async function waitTabs(ctx: BrowserContext, known: Set<Page>, budgetMs = 4_000): Promise<Page[]> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const fresh = freshTabs(ctx, known);
    if (fresh.length > 0) return fresh;
    await new Promise((r) => setTimeout(r, 50));
  }
  return [];
}

async function closeAll(pages: Page[]): Promise<void> {
  for (const p of pages) await p.close();
}

test.describe('导航岛搜索：两条归一时序 / 分频道跳转 / IME / loading 门', () => {
  test('打字即时折叠多余空格，完整归一延后到防抖之后（两条路径时序不同）', async ({
    extContext,
  }) => {
    const page = await openIsland(extContext, 'movie', DETAIL_URL);
    const input = page.locator(INPUT);
    await input.click();
    // Two spaces AND dots: the collapse is instantaneous, the dot rewrite is
    // debounced ~400 ms — so a single assertion could not tell the paths apart.
    await input.pressSequentially('Mean.Streets  1973', { delay: 0 });

    const early = await input.inputValue();
    expect(early, `即时折叠未生效：${JSON.stringify(early)}`).not.toContain('  ');
    expect(early, `防抖归一抢跑了（<400ms 就改写了点号）：${JSON.stringify(early)}`).toContain('.');

    await expect
      .poll(() => input.inputValue(), {
        message: '防抖完整归一未落地',
        timeout: 4_000,
      })
      .toMatch(/^Mean Streets 1973$/);
  });

  // The end-of-input caret is NOT a proof: setting `input.value` programmatically
  // leaves the caret at the end anyway, so an assertion there passes with
  // `restoreCursor()` deleted (measured). Mid-edit is the case that separates the
  // two — the rewrite has to delete characters BEFORE the caret.
  //
  // Sequenced so no debounce is pending across the setup steps: let the first
  // edit settle, then place the caret, then make the second edit shorten the
  // prefix. Every premise (caret placement, post-typing value) is asserted, so a
  // failure names which assumption broke rather than faking a conclusion.
  test('归一缩短了光标之前的文本时，光标留在原位（而非跳到末尾）', async ({ extContext }) => {
    const page = await openIsland(extContext, 'movie', DETAIL_URL);
    const input = page.locator(INPUT);
    const caretOf = () => input.evaluate((el) => (el as HTMLInputElement).selectionStart ?? -1);

    await input.click();
    await input.pressSequentially('Mean..Streets', { delay: 0 });
    await expect
      .poll(() => input.inputValue(), { message: '首次归一未落地', timeout: 4_000 })
      .toBe('Mean Streets');

    await input.evaluate((el) => (el as HTMLInputElement).setSelectionRange(4, 4));
    expect(await caretOf(), '光标未被放到 Mean 之后').toBe(4);

    // The dot lands before the caret, so the debounced rewrite shortens the
    // prefix by one char: 5 → still 5 with a restore, 12 (end) without one.
    await page.keyboard.press('.');
    expect(await input.inputValue(), '插入未落在光标处').toBe('Mean. Streets');
    expect(await caretOf(), '键入后光标不在插入点之后').toBe(5);

    await expect
      .poll(() => input.inputValue(), { message: '第二次归一未落地', timeout: 4_000 })
      .toBe('Mean Streets');
    expect(
      await caretOf(),
      '归一删掉了光标之前的字符，光标却被甩到末尾 ⇒ restoreCursor 未生效',
    ).toBe(5);
  });

  for (const [key, url, cat] of [
    ['movie', DETAIL_URL, CAT.movie],
    ['music', MUSIC_URL, CAT.music],
    ['book', BOOK_URL, CAT.book],
  ] as const) {
    test(`${key} 页回车：新标签落在 ${key} 频道自己的 subject_search，cat 为豆瓣频道号`, async ({
      extContext,
    }) => {
      const page = await openIsland(extContext, key, url);
      const input = page.locator(INPUT);
      const known = new Set(extContext.pages());

      await input.click();
      await input.fill('Mean Streets 1973');
      // Submit uses the (already normalized) field value; comparing the two is
      // what proves the URL is built from state rather than a stale copy.
      const typed = await input.inputValue();
      await input.press('Enter');

      const opened = await waitTabs(extContext, known);
      expect(opened.length, '回车没有开新标签').toBe(1);
      const target = new URL(opened[0]!.url());
      await closeAll(opened);

      expect(target.hostname).toBe('search.douban.com');
      expect(target.pathname, '搜索必须落在本页频道下').toBe(`/${key}/subject_search`);
      expect(target.searchParams.get('search_text'), 'search_text 与输入框当前值不一致').toBe(
        typed,
      );
      expect(target.searchParams.get('cat'), `cat 不是豆瓣给 ${key} 分配的频道号`).toBe(cat);
    });
  }

  test('游戏页回车在当前标签跳转，保留原有查询参数，且不走 subject_search', async ({
    extContext,
  }) => {
    const page = await openIsland(extContext, 'game', GAME_URL);
    const input = page.locator(INPUT);
    const known = new Set(extContext.pages());

    // The island's copy is now locale-resolved (X101 extracted the last bare
    // Chinese strings here), so pinning a literal language would make this case
    // depend on the harness browser's `navigator.language`. Assert the invariant
    // instead: both affordances are derived from THIS channel's label, read back
    // from the island's own active nav button.
    const channelLabel = await page
      .locator('.umm-island-nav-link--active .umm-island-nav-label')
      .first()
      .innerText();
    expect(channelLabel.trim().length, '导航岛没标出当前频道').toBeGreaterThan(0);
    const placeholder = (await input.getAttribute('placeholder')) ?? '';
    const searchAria = (await input.getAttribute('aria-label')) ?? '';
    const label = channelLabel.trim().toLowerCase();
    expect(placeholder.toLowerCase(), `占位文案没有落在本频道（${channelLabel}）上`).toContain(
      label,
    );
    expect(searchAria.toLowerCase(), `aria-label 没有落在本频道（${channelLabel}）上`).toContain(
      label,
    );

    await input.click();
    await input.fill('hades');
    await input.press('Enter');

    await page.waitForURL(/\/game\/explore\?/, { timeout: 15_000 });
    const after = new URL(page.url());
    expect(after.hostname).toBe('www.douban.com');
    expect(after.pathname).toBe('/game/explore');
    expect(after.searchParams.get('q'), '查询词没有并入 q').toBe('hades');
    expect(after.searchParams.get('sort'), '跳转丢掉了页面原有的查询参数').toBe('hot');
    // `type === 'game'` returns before the cat lookup, so `catMap.game` ('3114')
    // is unreachable by construction. The hostname + pathname pair above is what
    // carries that claim (a fall-through would land on
    // `search.douban.com/game/subject_search`); an extra
    // `not.toContain('search.douban.com')` on the already-pinned URL was deleted
    // here as unsatisfiable, i.e. dead weight that only looked like coverage.
    expect(
      extContext.pages().filter((p) => !known.has(p)).length,
      '游戏页应同标签跳转，不该开新标签',
    ).toBe(0);
  });

  test('空查询与纯空白回车：不开标签、不跳转、不进入 loading', async ({ extContext }) => {
    const page = await openIsland(extContext, 'movie', DETAIL_URL);
    const input = page.locator(INPUT);
    const known = new Set(extContext.pages());

    await input.click();
    await input.press('Enter');
    // "不进入 loading" has to be read HERE. After the popup budget elapses the
    // 800 ms window has expired anyway, so a late read is green whether or not
    // the guard ran (measured — that is what made the earlier version vacuous).
    await expect(page.locator(SUBMIT), '空回车进了 loading 态').toBeEnabled();

    await input.fill('   ');
    await input.press('Enter');
    await expect(page.locator(SUBMIT), '纯空白回车进了 loading 态').toBeEnabled();

    // The weighted pair: delete `if (!normalized) return` from `doSearch` and
    // this opens `…/subject_search?search_text=&cat=1002`.
    expect(extContext.pages().filter((p) => !known.has(p)).length, '空查询竟发起了搜索').toBe(0);
    expect(page.url(), '空查询竟跳转了').toBe(DETAIL_URL);

    // Separate contract, asserted last on purpose: the live normalizer folds a
    // whitespace-only field to '' (the anti-lone-space invariant). It says
    // nothing about the submit guard — it holds even with the guard removed.
    await expect(input).toHaveValue('');
  });

  test('输入法组合期间挂起完整归一，组合结束后补做', async ({ extContext }) => {
    const page = await openIsland(extContext, 'movie', DETAIL_URL);
    const input = page.locator(INPUT);
    await input.click();

    const fire = (type: string): Promise<unknown> =>
      input.evaluate(
        (el, t) => el.dispatchEvent(new CompositionEvent(t, { bubbles: true, data: '蜘蛛侠' })),
        type,
      );

    await fire('compositionstart');
    await page.keyboard.insertText('蜘蛛侠.2018');
    const during = await input.inputValue();
    expect(during, '组合期输入丢失/被改写').toBe('蜘蛛侠.2018');
    // Longer than the 400 ms debounce: if composition did not suspend it, the
    // rewrite would already have happened here.
    await page.waitForTimeout(700);
    expect(await input.inputValue(), '组合期做了完整归一（会打断输入法候选会话）').toBe(during);

    await fire('compositionend');
    await expect
      .poll(() => input.inputValue(), {
        message: '组合结束后没有补做归一',
        timeout: 4_000,
      })
      .not.toContain('.');
  });

  test('搜索进行中：提交按钮禁用、回车不再产生第二个标签，800ms 后恢复', async ({ extContext }) => {
    const page = await openIsland(extContext, 'movie', DETAIL_URL);
    const input = page.locator(INPUT);
    const known = new Set(extContext.pages());

    await input.click();
    await input.fill('Mean Streets');
    await input.press('Enter');

    const opened = await waitTabs(extContext, known);
    expect(opened.length, '首次回车应开一个标签').toBe(1);
    await expect(page.locator(SUBMIT)).toBeDisabled();
    await expect(page.locator('.umm-island-spinner')).toBeVisible();

    await input.press('Enter');
    await page.waitForTimeout(600);
    // Count every new page, not just committed ones: an about:blank popup is
    // still a second `window.open` (filtering those out is what made an earlier
    // version of this assertion vacuous).
    //
    // WHAT THIS PINS, and what it does not: implicit form submission needs an
    // ENABLED default button, so it is the `:disabled="isSearching"` affordance
    // above that keeps the second Enter from searching. Measured: deleting
    // `doSearch`'s own `if (isSearching.value) return` guard left this green, so
    // no claim is made about that line — the affordance is the user-visible
    // contract, and that is what is asserted here.
    expect(
      extContext.pages().filter((p) => !known.has(p)).length,
      '搜索进行中的一次回车又开了标签（禁用态未拦住提交）',
    ).toBe(1);

    await expect
      .poll(() => page.locator(SUBMIT).isEnabled(), {
        message: '800ms 后提交按钮没有恢复可用',
        timeout: 4_000,
      })
      .toBe(true);
    await closeAll(opened);
  });
});
