/**
 * X104 — the two pagers nobody ever pressed: genre (`‹ 前页` / `后页 ›`) and
 * search (首页 / 上一页 / numeric / 下一页 / 末页).
 *
 * Why these two: `genre/App.vue` carries exactly two interaction hooks and no
 * spec referenced the genre page at all (the class `.umm-page-btn` appears
 * nowhere in `tests/e2e`); `search/App.vue` renders five pager anchors of which
 * X38 pressed only 下一页 plus the jump box. Both are navigation surfaces, so a
 * silently wrong target is a user who lands on the wrong page — and both derive
 * their URLs from host markup, which makes the host the only admissible oracle.
 *
 * Oracle discipline (each deviation was measured, not assumed):
 *  - genre prev/next targets are read from the host `.paginator .prev a` /
 *    `.next a` in the same page, then compared after the click;
 *  - the page-info text is compared against the host `.thispage` value and the
 *    LAST numeric anchor. In this fixture `data-total-page` coincides with that
 *    anchor, so this leg does NOT discriminate the two total sources — stated
 *    here so nobody later reads it as if it did;
 *  - search expectations are derived from the fixture's own `__DATA__`
 *    (`count` = per-page, `start` = offset) rather than from `pageUrl()`'s
 *    source, so a rewritten URL builder has to disagree with the arithmetic.
 *
 * Two legs are negative and carry their own premises:
 *  - with the host `.prev` block removed, genre's 前页 must be disabled AND a
 *    click must not navigate — while 后页 still navigates (otherwise "disable and
 *    break everything" would pass);
 *  - search's active page number is rendered as an `<a>` with no href and no
 *    handler; clicking it must leave the URL untouched, which is what pins the
 *    `v-if="p === currentPage"` branch.
 */

import type { BrowserContext, Page } from '@playwright/test';
import locales from '@/entrypoints/content/i18n/locales';
import { expect, setStoredLanguage, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const GENRE_URL = 'https://music.douban.com/artists/genre_page/10';
const GENRE_OVERLAY = '#umm-douban-overlay';
const GENRE_BTN = `${GENRE_OVERLAY} .umm-page-btn`;

const SEARCH_HOST = 'search.douban.com';
/** The fixture's own `__DATA__.text`; the URL is encoded from it, never hand-typed. */
const SEARCH_TEXT = '流浪地球';
const SEARCH_BASE = `https://${SEARCH_HOST}/movie/subject_search?search_text=${encodeURIComponent(SEARCH_TEXT)}&cat=1002`;
const SEARCH_OVERLAY = '#umm-search-overlay';
const SEARCH_LINK = `${SEARCH_OVERLAY} .umm-page-link`;

const GENRE_RULE: DoubanFixtureRule = {
  host: 'music.douban.com',
  match: '/artists/genre_page/10',
  fixture: 'genre',
};

/** Genre rule with the host `prev` block stripped — the disabled-button branch. */
const GENRE_RULE_NO_PREV: DoubanFixtureRule = {
  ...GENRE_RULE,
  transform: (html) => {
    const out = html.replace(/<span class="prev">[\s\S]*?<\/span>/, '');
    if (out === html) throw new Error('夹具里找不到 .paginator .prev，改造未落地');
    return out;
  },
};

/**
 * Search body widened to 6 pages with the viewport parked on page 3
 * (`count` 20, `start` 40). Page 3 is deliberate: at page 2 the 首页 and
 * 上一页 targets coincide, which would hide a swapped handler.
 */
const SEARCH_RULE_MID_PAGE: DoubanFixtureRule = {
  host: SEARCH_HOST,
  match: '/movie/subject_search',
  fixture: 'search',
  transform: (html) => {
    const widened = html.replace('"total": 24,', '"total": 120,');
    const parked = widened.replace('"start": 0,', '"start": 40,');
    if (parked === html || parked === widened) {
      throw new Error('夹具 __DATA__ 形状变了（total/start 未被改写）');
    }
    return parked;
  },
};

async function open(
  extContext: BrowserContext,
  rule: DoubanFixtureRule,
  url: string,
  first: string,
): Promise<Page> {
  const page = await openDoubanFixturePage(extContext, rule, url);
  await expect(page.locator(first).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

function hostGenrePager(page: Page) {
  return page.evaluate(() => {
    const hrefOf = (sel: string): string =>
      document.querySelector<HTMLAnchorElement>(sel)?.href ?? '';
    const numbers = Array.from(document.querySelectorAll<HTMLAnchorElement>('.paginator a'))
      .map((a) => (a.textContent ?? '').trim())
      .filter((t) => /^\d+$/.test(t))
      .map((t) => Number(t));
    return {
      current: (document.querySelector('.paginator .thispage')?.textContent ?? '').trim(),
      lastAnchor: numbers.length ? String(Math.max(...numbers)) : '',
      prev: hrefOf('.paginator .prev a'),
      next: hrefOf('.paginator .next a'),
    };
  });
}

test.describe('genre 与 search 的分页交互', () => {
  test('genre：前/后页各跳宿主 pager 自己列出的那条链接，页码文案跟随宿主', async ({
    extContext,
  }) => {
    const page = await open(extContext, GENRE_RULE, GENRE_URL, GENRE_BTN);
    const host = await hostGenrePager(page);
    expect(host.current, '夹具 pager 形状变了（.thispage 空）').not.toBe('');
    expect(host.prev, '夹具没有 prev 链接，本例无从判别').not.toBe('');
    expect(host.next, '夹具没有 next 链接，本例无从判别').not.toBe('');

    await expect(page.locator(`${GENRE_OVERLAY} .umm-page-info`)).toHaveText(
      `${host.current} / ${host.lastAnchor}`,
    );

    const next = page.locator(GENRE_BTN).nth(1)!;
    await next.click();
    await expect(page).toHaveURL(host.next, { timeout: 30_000 });

    // After navigation the same fixture is served again, so the prev button is
    // live once more — click it and demand its OWN host href, not the next one.
    await page.locator(GENRE_BTN).first()!.click();
    await expect(page).toHaveURL(host.prev, { timeout: 30_000 });
    await page.close();
  });

  test('genre：宿主没有 prev 时前页禁用且点了不跳，后页仍可跳', async ({ extContext }) => {
    const page = await open(extContext, GENRE_RULE_NO_PREV, GENRE_URL, GENRE_BTN);
    const host = await hostGenrePager(page);
    expect(host.prev, '改造后宿主仍有 prev（transform 没生效）').toBe('');
    expect(host.next, '改造把 next 也弄丢了，禁用判据会空转').not.toBe('');

    const prev = page.locator(GENRE_BTN).first()!;
    await expect(prev, '宿主无 prev 却出了个可点的前页按钮').toBeDisabled();
    const before = page.url();
    await prev.click({ force: true });
    await page.waitForTimeout(600);
    expect(page.url(), '禁用的前页按钮仍然把用户跳走了').toBe(before);

    await page.locator(GENRE_BTN).nth(1)!.click();
    await expect(page).toHaveURL(host.next, { timeout: 30_000 });
    await page.close();
  });

  test('search：五个页码链接各跳各的 URL，且都等于按夹具算术推出的那条', async ({
    extContext,
    extPage,
  }) => {
    // X108：分页文案已入词典 ⇒ 本例的标签断言先钉 zh-CN（夹具是中文页）。
    await setStoredLanguage(extPage, 'zh-CN');
    const searchUrl = `${SEARCH_BASE}&start=40`;
    const page = await open(extContext, SEARCH_RULE_MID_PAGE, searchUrl, SEARCH_LINK);

    // Premise: the served body really is the search the URL claims — otherwise
    // pageUrl() would legitimately differ from anything this test encodes.
    expect(
      await page.evaluate(
        () => (window as unknown as { __DATA__?: { text?: string } }).__DATA__?.text,
      ),
      '夹具 __DATA__.text 与导航用的查询词不一致',
    ).toBe(SEARCH_TEXT);

    const links = page.locator(SEARCH_LINK);
    expect(await links.count(), '页码链接数量不对（窗口应含 6 个数字页 + 四个导航位）').toBe(10);

    const texts = await links.allInnerTexts();
    // X108 复审：标签期望按 zh-CN 词典取（字面量会让「回退硬编码」也全绿）。
    const L = locales['zh-CN'];
    expect(
      texts.map((t) => t.trim()),
      '页码窗口内容不符',
    ).toEqual([
      L['douban.search.first'],
      L['douban.search.prev'],
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      L['douban.search.next'],
      L['douban.search.last'],
    ]);

    // Arithmetic over the fixture's own total/count, never the component's string
    // template. Note the route answers every navigation with the SAME body
    // (`start` 40 ⇒ currentPage 3), so each target is computed from page 3:
    // 首页 1, 上一页 2, 下一页 4, 末页 6 — four distinct URLs out of one document,
    // which is also what makes a swapped handler impossible to hide.
    const per = 20;
    const expectUrl = (p: number): string =>
      p > 1 ? `${SEARCH_BASE}&start=${(p - 1) * per}` : SEARCH_BASE;

    const jump = async (label: string, target: number): Promise<void> => {
      const link = page.locator(`${SEARCH_LINK}:has-text("${label}")`).first()!;
      const href = (await link.getAttribute('href')) ?? '';
      expect(href, `${label} 的 href 与算术结果不一致`).toBe(expectUrl(target));
      await link.click();
      await expect(page).toHaveURL(expectUrl(target), { timeout: 30_000 });
    };

    await jump(L['douban.search.last']!, 6);
    await jump(L['douban.search.next']!, 4);
    await jump(L['douban.search.prev']!, 2);
    await jump(L['douban.search.first']!, 1);
    await page.close();
  });

  test('search：当前页码是无 href 的锚点，点了不跳（v-if 分支的负控）', async ({ extContext }) => {
    const searchUrl = `${SEARCH_BASE}&start=40`;
    const page = await open(extContext, SEARCH_RULE_MID_PAGE, searchUrl, SEARCH_LINK);

    const active = page.locator(`${SEARCH_OVERLAY} .umm-page-link--active`)!;
    await expect(active).toHaveText('3');
    expect(await active.getAttribute('href'), '当前页竟然带 href').toBeNull();

    const before = page.url();
    await active.click();
    await page.waitForTimeout(600);
    expect(page.url(), '点当前页码把自己跳走了（重复加载同一页）').toBe(before);
    await page.close();
  });
});
