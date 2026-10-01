/**
 * X27-B — Douban movie-adjacent & game overlays in a real browser with the
 * real built extension: page types photos / trailer list / celebrities /
 * movie-profile / game-detail / game-collect / game-explore,
 * each served from its DOM-faithful fixture under tests/fixtures/douban
 * (every fixture used here has a passing unit extraction spec).
 *
 * Expected values never come from the extractor under test: they are
 * re-derived from the light DOM the overlay never writes to — readHostSubjects
 * for /subject/ shapes, per-page host predicates for game/trailer/photo markup.
 * Where a value is computable (card counts, title↔id pairing, URLs) it is
 * asserted exactly, never approximately.
 */

import type { BrowserContext, Page } from '@playwright/test';
import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';
import { readHostSubjects } from './fixtures/douban-host-subjects';

interface HostPair {
  title: string;
  href: string;
}

const PHOTOS_OVERLAY = '#umm-photos-overlay';
const TRAILER_OVERLAY = '#umm-trailer-overlay';
const CELEBRITIES_OVERLAY = '#umm-celebrities-overlay';
const SHELL_OVERLAY = '#umm-douban-overlay';

const PHOTOS_URL = 'https://movie.douban.com/subject/1292052/photos?type=S';
const TRAILER_LIST_URL = 'https://movie.douban.com/subject/1292052/trailer';
const CELEBRITIES_URL = 'https://movie.douban.com/subject/1292052/celebrities';
const MOVIE_PROFILE_URL = 'https://movie.douban.com/people/27235071/';
const GAME_DETAIL_URL = 'https://www.douban.com/game/35317744/';
const GAME_COLLECT_URL = 'https://www.douban.com/people/unforgetmemory/games?action=collect';
const GAME_EXPLORE_URL = 'https://www.douban.com/game/explore';

const sorted = (list: string[]): string[] => [...list].sort();
const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Route the fixture onto its real host URL, open the page, prove the body came from it. */
/** Alias of the shared helper (this spec does not wait for the shell). */
const openFixture = (ctx: BrowserContext, rule: DoubanFixtureRule, url: string): Promise<Page> =>
  openDoubanFixturePage(ctx, rule, url);

/** The i-th overlay card for a host title, by exact title (uniqueness asserted first). */
function cardByTitle(page: Page, cardSel: string, titleSel: string, title: string) {
  return page
    .locator(cardSel)
    .filter({ has: page.locator(titleSel, { hasText: new RegExp(`^${escapeRe(title)}$`) }) });
}

test.describe('douban photos overlay (photos-gallery fixture)', () => {
  test('renders exactly the cover-bearing photo cards and nothing the host does not show', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'movie.douban.com', match: '/subject/1292052/photos', fixture: 'photos-gallery' },
      PHOTOS_URL,
    );
    // Host truth: li[data-id] entries that actually carry a cover link + a real
    // (or lazy) image — the two markup-dead entries must appear in neither set.
    const host = await page.evaluate(() => {
      const keep: { id: string; name: string }[] = [];
      for (const li of Array.from(
        document.querySelectorAll('ul[class*="poster-col"] li[data-id]'),
      )) {
        const a = li.querySelector('.cover a');
        const img = li.querySelector<HTMLImageElement>('.cover img');
        if (!a || !img) continue;
        const src = img.getAttribute('src') ?? '';
        if (src.startsWith('data:') && !img.getAttribute('data-src')) continue;
        keep.push({
          id: li.getAttribute('data-id') ?? '',
          name: li.querySelector('.name')?.textContent?.trim() ?? '',
        });
      }
      return { keep, header: document.querySelector('#content h1')?.textContent?.trim() ?? '' };
    });
    expect(host.keep.length, 'host gallery keeps at least two cards').toBeGreaterThanOrEqual(2);

    const cards = page.locator(`${PHOTOS_OVERLAY} .umm-photo-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await expect(cards).toHaveCount(host.keep.length);
    await expect(page.locator(`${PHOTOS_OVERLAY} .umm-photos-title`)).toHaveText(host.header);

    // Every rendered caption must be a fragment of its own host .name text
    // (the host name also carries the comment-count link text).
    const captions = (
      await page.locator(`${PHOTOS_OVERLAY} .umm-photo-caption`).allInnerTexts()
    ).map((t) => t.trim());
    expect(captions.length, 'every kept card has a caption').toBe(host.keep.length);
    for (const caption of captions) {
      expect(
        host.keep.some((k) => k.name.includes(caption)),
        `caption not in host DOM: ${JSON.stringify(caption)}`,
      ).toBe(true);
    }
  });

  test('a card click opens the gallery whose counter totals exactly the cards, no navigation', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'movie.douban.com', match: '/subject/1292052/photos', fixture: 'photos-gallery' },
      PHOTOS_URL,
    );
    const cards = page.locator(`${PHOTOS_OVERLAY} .umm-photo-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    const n = await cards.count();
    const firstCaption = (await cards.first().locator('.umm-photo-caption').innerText()).trim();

    await expect(page.locator(`${PHOTOS_OVERLAY} .umm-gallery-overlay`)).toHaveCount(0);
    await cards.first().click();
    await expect(page.locator(`${PHOTOS_OVERLAY} .umm-gallery-overlay`)).toHaveCount(1);
    // The gallery belongs to the clicked card and totals the whole grid.
    await expect(page.locator(`${PHOTOS_OVERLAY} .umm-gallery-img`)).toHaveAttribute(
      'alt',
      firstCaption,
    );
    await expect(page.locator(`${PHOTOS_OVERLAY} .umm-gallery-counter-total`)).toHaveText(
      ` / ${String(n)}`,
    );
    await page.locator(`${PHOTOS_OVERLAY} .umm-gallery-close`).click();
    await expect(page.locator(`${PHOTOS_OVERLAY} .umm-gallery-overlay`)).toHaveCount(0);
    expect(page.url()).toBe(PHOTOS_URL);
  });
});

test.describe('douban trailer listing overlay (trailer-list fixture)', () => {
  // The listing pairs (title → trailer URL) live in `li` blocks that carry BOTH
  // a cover anchor and a title paragraph — the host-dead entries do not.
  const readHostVideos = (page: Page): Promise<HostPair[]> =>
    page.evaluate(() => {
      const out: { title: string; href: string }[] = [];
      for (const li of Array.from(document.querySelectorAll('#content .mod ul > li'))) {
        const cover = li.querySelector('a.pr-video');
        const titleA = li.querySelector<HTMLAnchorElement>('p a');
        const title = titleA?.textContent?.trim() ?? '';
        if (!cover || !titleA || !title) continue;
        out.push({ title, href: titleA.href });
      }
      return out;
    });

  test('renders exactly the advertised videos; the out-of-scope sidebar never leaks', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'movie.douban.com', match: '/subject/1292052/trailer', fixture: 'trailer-list' },
      TRAILER_LIST_URL,
    );
    const host = await readHostVideos(page);
    const names = page.locator(`${TRAILER_OVERLAY} .umm-trailer-name`);
    await expect(names.first()).toBeVisible({ timeout: 60_000 });
    await expect(names).toHaveCount(host.length);
    expect(host.length).toBeGreaterThanOrEqual(2);
    expect(sorted(await names.allInnerTexts()).map((t) => t.trim())).toEqual(
      sorted(host.map((h) => h.title)),
    );
    // Header shows the subject name the h1 anchor itself carries.
    await expect(page.locator(`${TRAILER_OVERLAY} .umm-trailer-title`)).toHaveText(
      (await page.locator('#content h1 a').innerText()).trim(),
    );
    // #aside recommendation anchor sits outside #content — must not be rendered.
    await expect(
      page.locator(`${TRAILER_OVERLAY} .umm-trailer-name`, { hasText: '推荐电影' }),
    ).toHaveCount(0);
  });

  test('a card click opens exactly the trailer URL the host pairs with that title', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'movie.douban.com', match: '/subject/1292052/trailer', fixture: 'trailer-list' },
      TRAILER_LIST_URL,
    );
    const host = await readHostVideos(page);
    const names = page.locator(`${TRAILER_OVERLAY} .umm-trailer-name`);
    await expect(names.first()).toBeVisible({ timeout: 60_000 });
    const title = (await names.first().innerText()).trim();
    const hits = host.filter((h) => h.title === title);
    expect(hits.length, `ambiguous host pair for ${JSON.stringify(title)}`).toBe(1);
    const popupPromise = extContext.waitForEvent('page');
    await names.first().click();
    expect((await popupPromise).url()).toBe(hits[0]?.href ?? '');
  });
});

test.describe('douban celebrities overlay (celebrities fixture)', () => {
  test('cards, group headings and work tags match the host list exactly', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'movie.douban.com', match: '/subject/1292052/celebrities', fixture: 'celebrities' },
      CELEBRITIES_URL,
    );
    const host = await page.evaluate(() => {
      const names: string[] = [];
      const headings: string[] = [];
      const works: string[] = [];
      for (const wrapper of Array.from(document.querySelectorAll('#celebrities .list-wrapper'))) {
        let valid = 0;
        for (const li of Array.from(wrapper.querySelectorAll('.celebrities-list .celebrity'))) {
          const nameA = li.querySelector('.info .name a[href*="/personage/"]');
          const name = nameA?.textContent?.trim() ?? '';
          if (!name) continue;
          valid += 1;
          names.push(name);
          for (const a of Array.from(li.querySelectorAll('.works a[title]'))) {
            works.push(a.getAttribute('title') ?? '');
          }
        }
        const h2 = valid > 0 ? wrapper.querySelector('h2')?.textContent?.trim() : undefined;
        if (h2) headings.push(h2);
      }
      return { names, headings, works };
    });
    expect(host.names.length).toBeGreaterThanOrEqual(3);

    const cards = page.locator(`${CELEBRITIES_OVERLAY} .umm-celebrity-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await expect(cards).toHaveCount(host.names.length);
    expect(
      sorted(await page.locator(`${CELEBRITIES_OVERLAY} .umm-celebrity-name`).allInnerTexts()),
    ).toEqual(sorted(host.names));
    await expect(page.locator(`${CELEBRITIES_OVERLAY} .umm-celebrity-group-heading`)).toHaveCount(
      host.headings.length,
    );
    const works = page.locator(`${CELEBRITIES_OVERLAY} .umm-celebrity-work-tag`);
    await expect(works).toHaveCount(host.works.length);
    expect(
      sorted(await works.evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))),
    ).toEqual(sorted(host.works));
  });

  test('a work-tag click opens exactly the subject URL the host pairs with that title', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'movie.douban.com', match: '/subject/1292052/celebrities', fixture: 'celebrities' },
      CELEBRITIES_URL,
    );
    const works = page.locator(`${CELEBRITIES_OVERLAY} .umm-celebrity-work-tag`);
    await expect(works.first()).toBeVisible({ timeout: 60_000 });
    // Independent pairing source: the host anchors themselves (title attr + href).
    const hosts = await readHostSubjects(page);
    const title = (await works.first().innerText()).trim();
    const hits = hosts.filter((h) => h.title === title);
    expect(hits.length, `ambiguous host subject for ${JSON.stringify(title)}`).toBe(1);
    const popupPromise = extContext.waitForEvent('page');
    await works.first().click();
    expect((await popupPromise).url()).toBe(hits[0]?.href ?? '');
  });
});

test.describe('douban movie-profile overlay (movie-profile fixture)', () => {
  test('dash cards pair 1:1 with the host subject covers and a card click navigates there', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'movie.douban.com', match: '/people/27235071', fixture: 'movie-profile' },
      MOVIE_PROFILE_URL,
    );
    // Host truth per the shelf grids: cover links to /subject/ whose image names
    // itself via alt or title. readHostSubjects cannot serve this fixture — the
    // 霸王别姬 cell labels its image via img[title] only.
    const host = await page.evaluate(() => {
      const cards: { title: string; href: string }[] = [];
      for (const a of Array.from(
        document.querySelectorAll('#db-movie-mine .list-s li a.cover[href*="/subject/"]'),
      )) {
        const img = a.querySelector('img');
        const title = (img?.getAttribute('alt') ?? img?.getAttribute('title') ?? '').trim();
        if (title) cards.push({ title, href: (a as HTMLAnchorElement).href });
      }
      const doulists = Array.from(document.querySelectorAll('.aside .mod ul.list-m li p a'))
        .map((a) => a.textContent?.trim() ?? '')
        .filter((t) => t.length > 1);
      return { cards, doulists };
    });
    expect(host.cards.length).toBeGreaterThanOrEqual(3);

    const titles = page.locator(`${SHELL_OVERLAY} .umm-dash-card-title`);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });
    await expect(titles).toHaveCount(host.cards.length);
    expect(sorted(await titles.allInnerTexts())).toEqual(sorted(host.cards.map((c) => c.title)));
    const doulist = page.locator(`${SHELL_OVERLAY} .umm-movie-profile-doulist-title`);
    await expect(doulist).toHaveCount(host.doulists.length);
    expect(sorted(await doulist.allInnerTexts())).toEqual(sorted(host.doulists));

    const title = (await titles.first().innerText()).trim();
    const hits = host.cards.filter((c) => c.title === title);
    expect(hits.length, `ambiguous host pair for ${JSON.stringify(title)}`).toBe(1);
    const popupPromise = extContext.waitForEvent('page');
    await titles.first().click();
    expect((await popupPromise).url()).toBe(hits[0]?.href ?? '');
  });
});

test.describe('douban game-detail overlay (game-detail fixture)', () => {
  // Host truth for this page shape: recommendation dls need dt img + dd a, a
  // comment needs a user name or a short text; both exclude the placeholder rows.
  const readHostGame = (page: Page) =>
    page.evaluate(() => {
      const recs: { title: string; href: string }[] = [];
      for (const dl of Array.from(
        document.querySelectorAll('#recommendations .recommendations-bd dl'),
      )) {
        const img = dl.querySelector('dt img');
        const a = dl.querySelector('dd a');
        const title = a?.textContent?.trim() ?? '';
        if (!img || !a || !title) continue;
        recs.push({ title, href: (a as HTMLAnchorElement).href });
      }
      const comments = Array.from(document.querySelectorAll('.comment-list .comment-item')).filter(
        (li) => {
          const user = li.querySelector('.user-info a')?.textContent?.trim() ?? '';
          const short = li.querySelector('.short')?.textContent?.trim() ?? '';
          return user.length > 0 || short.length > 0;
        },
      ).length;
      return {
        recs,
        comments,
        header: document.querySelector('#content h1')?.textContent?.trim() ?? '',
        rating: document.querySelector('.ll.rating_num')?.textContent?.trim() ?? '',
      };
    });

  test('rebuilds only data the host advertises: title, rating, rec pairings, comment count', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'www.douban.com', match: '/game/35317744', fixture: 'game-detail' },
      GAME_DETAIL_URL,
    );
    const host = await readHostGame(page);
    expect(host.recs.length).toBeGreaterThanOrEqual(2);

    const recCards = page.locator(`${SHELL_OVERLAY} .umm-rec-item`);
    await expect(recCards.first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(`${SHELL_OVERLAY} .umm-detail-title`)).toHaveText(host.header);
    await expect(page.locator(`${SHELL_OVERLAY} .umm-rating-score`)).toHaveText(host.rating);
    await expect(recCards).toHaveCount(host.recs.length);
    expect(sorted(await page.locator(`${SHELL_OVERLAY} .umm-rec-title`).allInnerTexts())).toEqual(
      sorted(host.recs.map((r) => r.title)),
    );
    await expect(page.locator(`${SHELL_OVERLAY} .umm-comment-item`)).toHaveCount(host.comments);
  });

  test('a rec-card click opens exactly that game URL the host pairs with its title', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'www.douban.com', match: '/game/35317744', fixture: 'game-detail' },
      GAME_DETAIL_URL,
    );
    const host = await readHostGame(page);
    const titles = page.locator(`${SHELL_OVERLAY} .umm-rec-title`);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });
    const title = (await titles.first().innerText()).trim();
    const hits = host.recs.filter((r) => r.title === title);
    expect(hits.length, `ambiguous host pair for ${JSON.stringify(title)}`).toBe(1);
    const popupPromise = extContext.waitForEvent('page');
    await titles.first().click();
    expect((await popupPromise).url()).toBe(hits[0]?.href ?? '');
  });

  // Game badges derive from the live record map (UmmRecSection + useRecordCache),
  // so a write/delete repaints inside the same document — no re-mount crutch.
  // A reload here would prove nothing: it re-reads whatever the mount already read.
  test('a wish record marks exactly the paired rec card; a delete clears the badge', async ({
    extContext,
    extPage,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'www.douban.com', match: '/game/35317744', fixture: 'game-detail' },
      GAME_DETAIL_URL,
    );
    const host = await readHostGame(page);
    const recCards = page.locator(`${SHELL_OVERLAY} .umm-rec-item`);
    await expect(recCards.first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator(`${SHELL_OVERLAY} .umm-status--wish`)).toHaveCount(0);

    const title = (await recCards.locator('.umm-rec-title').first().innerText()).trim();
    const paired = host.recs.find((r) => r.title === title);
    expect(paired, `host has no rec pair for ${JSON.stringify(title)}`).toBeDefined();
    const id = /\/game\/(\d+)/.exec(paired?.href ?? '')?.[1] ?? '';
    expect(id, 'the paired host rec URL carries a numeric game id').not.toBe('');
    const key = `game::${id}`;

    const put = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key,
      record: makeStoreRecord(`https://www.douban.com/game/${id}/`, 1, 0),
    });
    expect(put.success).toBe(true);
    // Exactly the paired card — a prefix/id mix-up would mark more than one.
    await expect(page.locator(`${SHELL_OVERLAY} .umm-status--wish`)).toHaveCount(1);
    await expect(
      cardByTitle(page, `${SHELL_OVERLAY} .umm-rec-item`, '.umm-rec-title', title).locator(
        '.umm-status--wish',
      ),
    ).toHaveCount(1);

    const del = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key,
    });
    expect(del.success).toBe(true);
    await expect(page.locator(`${SHELL_OVERLAY} .umm-status--wish`)).toHaveCount(0);
    // Every card is back to "none" — the delete did not just lose the marker.
    await expect(recCards.locator('.umm-status--none')).toHaveCount(await recCards.count());
    expect(page.url()).toBe(GAME_DETAIL_URL);
  });
});

test.describe('douban game-collect overlay (game-collect fixture)', () => {
  test('renders exactly the .game-list shelf (sidebar decoy excluded) and a title click navigates', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'www.douban.com', match: '/people/unforgetmemory/games', fixture: 'game-collect' },
      GAME_COLLECT_URL,
    );
    const host = await page.evaluate(() => {
      const out: { title: string; href: string }[] = [];
      for (const a of Array.from(
        document.querySelectorAll('.game-list .common-item .title a[href*="/game/"]'),
      )) {
        const title = a.textContent?.trim() ?? '';
        const href = a.getAttribute('href') ?? '';
        if (title && /\/game\/\d+/.test(href)) out.push({ title, href });
      }
      return out;
    });
    expect(host.length).toBeGreaterThanOrEqual(2);

    const cards = page.locator(`${SHELL_OVERLAY} .umm-gc-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await expect(cards).toHaveCount(host.length);
    expect(sorted(await page.locator(`${SHELL_OVERLAY} .umm-gc-title`).allInnerTexts())).toEqual(
      sorted(host.map((h) => h.title)),
    );
    // The .aside .common-item decoy sits outside .game-list on the host.
    await expect(
      page.locator(`${SHELL_OVERLAY} .umm-gc-title`, { hasText: '侧栏推荐游戏' }),
    ).toHaveCount(0);

    const title = (await page.locator(`${SHELL_OVERLAY} .umm-gc-title`).first().innerText()).trim();
    const hits = host.filter((h) => h.title === title);
    expect(hits.length, `ambiguous host pair for ${JSON.stringify(title)}`).toBe(1);
    const popupPromise = extContext.waitForEvent('page');
    await cardByTitle(page, `${SHELL_OVERLAY} .umm-gc-card`, '.umm-gc-title', title)
      .first()
      .locator('.umm-gc-title')
      .click();
    expect((await popupPromise).url()).toBe(hits[0]?.href ?? '');
  });
});

test.describe('douban game-explore overlay (game-explore-dom fixture)', () => {
  // Fixture choice: URL classification (src/scenario/douban/shared/url-detector.ts
  // isGameExplorePage) accepts both /game/explore fixtures, but only the DOM-shaped
  // one lets the test re-derive (title, url) pairs from the light DOM the overlay
  // never writes to. With the script-shaped fixture the expected values would have
  // to be re-parsed out of an inline GlobalData JSON blob — a second implementation
  // of the extractor, not an independent host source.
  const readHostGames = (page: Page): Promise<HostPair[]> =>
    page.evaluate(() => {
      const out: { title: string; href: string }[] = [];
      for (const li of Array.from(document.querySelectorAll('.game-list > li'))) {
        const poster = li.querySelector('a.game-poster');
        const titleA = li.querySelector('.game-title a');
        const title = titleA?.textContent?.trim() ?? '';
        if (
          !poster ||
          !titleA ||
          !title ||
          !/\/game\/\d+\/?$/.test(poster.getAttribute('href') ?? '')
        )
          continue;
        out.push({ title, href: (titleA as HTMLAnchorElement).href });
      }
      return out;
    });

  test('renders exactly the host list and an item click opens its own game page', async ({
    extContext,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'www.douban.com', match: '/game/explore', fixture: 'game-explore-dom' },
      GAME_EXPLORE_URL,
    );
    const host = await readHostGames(page);
    expect(host.length).toBeGreaterThanOrEqual(2);

    const items = page.locator(`${SHELL_OVERLAY} .umm-game-list-item`);
    await expect(items.first()).toBeVisible({ timeout: 60_000 });
    await expect(items).toHaveCount(host.length);
    const titles = page.locator(`${SHELL_OVERLAY} .umm-game-item-title`);
    expect(sorted(await titles.allInnerTexts())).toEqual(sorted(host.map((h) => h.title)));

    const title = (await titles.first().innerText()).trim();
    const hits = host.filter((h) => h.title === title);
    expect(hits.length, `ambiguous host pair for ${JSON.stringify(title)}`).toBe(1);
    const popupPromise = extContext.waitForEvent('page');
    await titles.first().click();
    expect((await popupPromise).url()).toBe(hits[0]?.href ?? '');
  });

  test('an external write marks exactly that item live and an external delete clears it, without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openFixture(
      extContext,
      { host: 'www.douban.com', match: '/game/explore', fixture: 'game-explore-dom' },
      GAME_EXPLORE_URL,
    );
    const host = await readHostGames(page);
    const titles = page.locator(`${SHELL_OVERLAY} .umm-game-item-title`);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });

    const title = (await titles.first().innerText()).trim();
    const hits = host.filter((h) => h.title === title);
    expect(hits.length, `ambiguous host pair for ${JSON.stringify(title)}`).toBe(1);
    const id = /\/game\/(\d+)/.exec(hits[0]?.href ?? '')?.[1] ?? '';
    expect(id, 'the paired host URL carries a numeric game id').not.toBe('');
    // The visible-list ids feed useRecordCache('game', …) → store key game::<id>.
    const key = `game::${id}`;
    const ownCard = cardByTitle(
      page,
      `${SHELL_OVERLAY} .umm-game-list-item`,
      '.umm-game-item-title',
      title,
    );
    await expect(ownCard).toHaveCount(1);
    const wish = page.locator(`${SHELL_OVERLAY} .umm-status--wish`);

    const del = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key,
    });
    expect(del.success).toBe(true);
    await expect(wish).toHaveCount(0, { timeout: 30_000 });

    const put = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key,
      record: makeStoreRecord(`https://www.douban.com/game/${id}/`, 1, 0),
    });
    expect(put.success).toBe(true);
    // Broadcast → cache reload → badge on exactly this item's card, nowhere else.
    await expect(ownCard.locator('.umm-status--wish')).toHaveCount(1, { timeout: 30_000 });
    await expect(wish).toHaveCount(1);

    const del2 = await sendRuntimeMessage(extPage, 'DB_DELETE', {
      storeName: DOUBAN_STORE,
      key,
    });
    expect(del2.success).toBe(true);
    await expect(wish).toHaveCount(0, { timeout: 30_000 });

    // Same document throughout — no reload happened between write and mark.
    expect(page.url()).toBe(GAME_EXPLORE_URL);
  });
});
