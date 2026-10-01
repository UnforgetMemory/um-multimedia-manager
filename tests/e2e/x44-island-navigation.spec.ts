/**
 * X27-C 第五波 — 顶栏导航岛（UmmDynamicIsland 的 5 个导航点击位）与详情页
 * 合成跳转（影人 / 预告片 / 全部图片 / 海报链接）。
 *
 * 两点刻意的设计：
 *  1. 断言只看 **URL**，不看可见文案 —— 这样既不受 content i18n 四种 locale 影响，
 *     也把「导航到底去了哪」这条真正会被写坏的契约钉住（`open()` 里有
 *     `newTab` 与 `safeHref` 两条分支，任何一条退化都会静默改变跳转方式）。
 *  2. 同一个导航岛在 `newTab=true`（默认）与 `newTab=false`（搜索页）下分别验一次：
 *     前者必须开新 tab、后者必须在当前 tab 跳转，这是两条不同的代码路径。
 *
 * 详情页那几个「合成出来的」跳转地址（celebrities / trailer / all_photos）必须等于
 * 由宿主 subject id 推出的官方路径，而不是提取器随手拼出来的字符串。
 */

import { expect, test } from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';

const SUBJECT_ID = '1292052';
const PHOTOS_URL = `https://movie.douban.com/subject/${SUBJECT_ID}/photos?type=S`;
const SEARCH_URL = 'https://search.douban.com/movie/subject_search?search_text=E2E&cat=1002';
const DETAIL_URL = `https://movie.douban.com/subject/${SUBJECT_ID}/`;
const DETAIL_OVERLAY = '#umm-detail-mask';

const PHOTOS_RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/subject/1292052/photos',
  fixture: 'photos-gallery',
};
const SEARCH_RULE: DoubanFixtureRule = {
  host: 'search.douban.com',
  match: '/movie/subject_search',
  fixture: 'search',
};
const DETAIL_RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/subject/1292052',
  fixture: 'detail-movie',
};

/** The island's five nav buttons, in DOM order, with the URL each must open. */
const NAV_TARGETS = [
  'https://movie.douban.com/',
  'https://music.douban.com/',
  'https://book.douban.com/',
  'https://www.douban.com/game/explore',
  'https://www.douban.com/mine',
] as const;

async function openWith(
  extContext: Parameters<typeof openDoubanFixturePage>[0],
  rule: DoubanFixtureRule,
  url: string,
) {
  const page = await openDoubanFixturePage(extContext, rule, url);
  await expect(page.locator('.umm-island-nav-link').first()).toBeVisible({ timeout: 60_000 });
  return page;
}

test.describe('导航岛跳转', () => {
  test('newTab=true（默认）：五个导航位各开一个指向对应频道的 tab', async ({ extContext }) => {
    const page = await openWith(extContext, PHOTOS_RULE, PHOTOS_URL);
    const links = page.locator('.umm-island-nav-link');
    expect(await links.count(), 'the island exposes five nav buttons').toBe(NAV_TARGETS.length);

    for (const [index, target] of NAV_TARGETS.entries()) {
      const popupPromise = extContext.waitForEvent('page');
      await links.nth(index).click();
      const popup = await popupPromise;
      expect(popup.url(), `nav #${index + 1} opened the wrong channel`).toBe(target);
      await popup.close();
    }

    // The current channel is marked, and it must be the movie island on a movie page.
    await expect(page.locator('.umm-island-nav-link--active')).toHaveCount(1);
    expect(
      await page
        .locator('.umm-island-nav-link')
        .nth(0)
        .evaluate((el) => el.className),
    ).toContain('umm-island-nav-link--active');
  });

  test('newTab=false（搜索页）：导航在当前 tab 跳转，且开新 tab 数必须为零', async ({
    extContext,
  }) => {
    const page = await openWith(extContext, SEARCH_RULE, SEARCH_URL);
    let popups = 0;
    extContext.on('page', () => {
      popups += 1;
    });

    const musicNav = page.locator('.umm-island-nav-link').nth(1);
    await musicNav.click({ noWaitAfter: true });
    await expect(page).toHaveURL('https://music.douban.com/', { timeout: 30_000 });
    expect(popups, 'newTab=false must not spawn a tab').toBe(0);
  });
});

test.describe('详情页合成跳转', () => {
  test('影人 / 预告片 / 全部图片的跳转都落在本页 subject 作用域内', async ({ extContext }) => {
    const page = await openDoubanFixturePage(extContext, DETAIL_RULE, DETAIL_URL);
    await expect(page.locator(`${DETAIL_OVERLAY} .umm-section-link`).first()).toBeVisible({
      timeout: 60_000,
    });

    // Host truth for the subject id these synthetic paths must be built on.
    const hostSubject = await page.evaluate(() => {
      const match = /\/subject\/(\d+)/.exec(location.pathname);
      return match?.[1] ?? '';
    });
    expect(hostSubject, 'fixture URL must carry a subject id').toBe(SUBJECT_ID);

    const links = page.locator(
      `${DETAIL_OVERLAY} .umm-section-link span[style*="cursor: pointer"]`,
    );
    const count = await links.count();
    expect(count, 'the detail page exposes no synthetic section links').toBeGreaterThan(0);

    const opened: string[] = [];
    for (const index of Array.from({ length: count }, (_, i) => i)) {
      const popupPromise = extContext.waitForEvent('page');
      await links.nth(index).click();
      const popup = await popupPromise;
      opened.push(popup.url());
      await popup.close();
    }

    // Composition contract: same subject scope, douban host only, one of the
    // documented section paths (safeHref must not let another origin through),
    // and no duplicated entry.
    const SECTION_PATHS = ['/celebrities', '/trailer', '/all_photos'] as const;
    const seen = new Set<string>();
    for (const url of opened) {
      const parsed = new URL(url);
      expect(parsed.hostname).toBe('movie.douban.com');
      expect(
        parsed.pathname.startsWith(`/subject/${hostSubject}/`),
        `link left the subject scope: ${url}`,
      ).toBe(true);
      const section = SECTION_PATHS.find((suffix) => parsed.pathname.endsWith(suffix));
      expect(section, `unexpected section path: ${parsed.pathname}`).toBeTruthy();
      expect(seen.has(parsed.pathname), `duplicated section link: ${parsed.pathname}`).toBe(false);
      seen.add(parsed.pathname);
    }
  });
});
