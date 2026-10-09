/**
 * X27-B — Douban MUSIC overlays, real browser + real built extension.
 *
 * Page types covered (classification in
 * src/scenario/douban/shared/url-detector.ts, shells under
 * src/scenario/douban/pages/<page>/): music-homepage, albums, artists-overview,
 * music-collect, music-profile, genre.
 *
 * Each host body is the crawled fixture the node-side extraction specs parse,
 * served under the REAL host URL so `manifest.matches` still injects. Expected
 * values are read out of the HOST light DOM — the labels, hrefs and counts the
 * page itself advertises — never from the extractor under test, so an overlay
 * that invents, drops or mis-pairs cards fails even while that extractor's own
 * unit tests stay green.
 */

import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect, setStoredLanguage, test } from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  type DoubanFixtureRule,
} from './fixtures/douban-crawl-fixtures';
import { liveRecordRoundTrip } from './fixtures/douban-live-record';

const OVERLAY = '#umm-douban-overlay';
const MUSIC = 'music.douban.com';

/** Page type → fixture + the real host URL whose body it replaces. */
const PAGES = {
  home: { url: `https://${MUSIC}/`, fixture: 'music-homepage' },
  albums: { url: `https://${MUSIC}/albums/30080001`, fixture: 'albums' },
  artists: { url: `https://${MUSIC}/artists`, fixture: 'artists-overview' },
  genre: { url: `https://${MUSIC}/artists/genre_page/10`, fixture: 'genre' },
  collect: { url: `https://${MUSIC}/people/unforgetmemory/collect`, fixture: 'music-collect' },
  profile: { url: `https://${MUSIC}/people/88990011/`, fixture: 'music-profile' },
} as const;

type PageKey = keyof typeof PAGES;

/** One repeated card shape, as the host page itself writes it. */
interface HostShape {
  item: string;
  container?: string;
  /** Label node inside the item (blank → the item itself). */
  name?: string;
  /** Read this attribute of the label node instead of its text (e.g. `alt`). */
  nameAttr?: string;
  /** Link node inside the item (blank → the item itself when it is an `<a>`). */
  href?: string;
  itemIdPattern?: string;
  /** Item must contain a node with an inline `background-image` (lazy art). */
  needBgImage?: boolean;
  requireHref?: boolean;
  /** Drop items whose link is not a `/subject/<digits>/` link. */
  requireSubject?: boolean;
}

interface HostPair {
  name: string;
  href: string;
  id: string;
}

/** Card shape whose label node and link node are the same element. */
function sh(c: string, i: string, n: string, o: Partial<HostShape>): HostShape {
  return { container: c, item: i, name: n, href: n, ...o };
}

/** (label, absolute href, subject id) triples the HOST DOM advertises. */
async function readHostItems(page: Page, cfg: HostShape): Promise<HostPair[]> {
  return page.evaluate((conf: HostShape): HostPair[] => {
    const scope = conf.container ? document.querySelector(conf.container) : document.body;
    if (!scope) return [];
    const nz = (v: string | null): string => (v ?? '').replace(/\s+/g, ' ').trim();
    const out: HostPair[] = [];
    const seen = new Set<string>();
    for (const el of Array.from(scope.querySelectorAll(conf.item))) {
      if (conf.itemIdPattern && !new RegExp(conf.itemIdPattern).test(el.id)) continue;
      if (conf.needBgImage && !el.querySelector('[style*="background-image"]')) continue;
      const label = conf.name ? el.querySelector(conf.name) : el;
      if (!label) continue;
      const name = nz(conf.nameAttr ? label.getAttribute(conf.nameAttr) : label.textContent);
      if (!name) continue;
      const inner = conf.href ? el.querySelector(conf.href) : null;
      const anchor =
        inner instanceof HTMLAnchorElement ? inner : el instanceof HTMLAnchorElement ? el : null;
      const raw = anchor?.getAttribute('href') ?? '';
      const href = raw ? new URL(raw, location.href).href : '';
      if (conf.requireHref && !href) continue;
      const id = /\/subject\/(\d+)/.exec(href)?.[1] ?? '';
      if (conf.requireSubject && !id) continue;
      const key = `${name}\u0000${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, href, id });
    }
    return out;
  }, cfg);
}

/** Collapsed text of the first host node matching `selector`. */
function hostText(page: Page, selector: string): Promise<string> {
  return page.evaluate(
    (sel: string): string =>
      (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    selector,
  );
}

function norm(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function texts(page: Page, selector: string): Promise<string[]> {
  return page
    .locator(selector)
    .allInnerTexts()
    .then((all) => all.map(norm));
}

async function firstText(page: Page, selector: string): Promise<string> {
  return (await texts(page, selector))[0] ?? '';
}

async function attrs(page: Page, selector: string, name: string): Promise<string[]> {
  const loc = page.locator(selector);
  const out: string[] = [];
  const count = await loc.count();
  for (let i = 0; i < count; i++) out.push((await loc.nth(i).getAttribute(name)) ?? '');
  return out;
}

/** The one card whose title node is exactly `title` (never a substring hit). */
function byName(page: Page, card: string, titleSel: string, title: string): Locator {
  const exact = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  return page.locator(card).filter({ has: page.locator(titleSel, { hasText: exact }) });
}

/** The host URL paired with a card name — empty when the host pairs none. */
function urlOf(pairs: HostPair[], name: string): string {
  return pairs.find((p) => p.name === name)?.href ?? '';
}

async function openPage(extContext: BrowserContext, key: PageKey): Promise<Page> {
  const target = PAGES[key];
  const rule: DoubanFixtureRule = {
    host: MUSIC,
    match: new URL(target.url).pathname,
    fixture: target.fixture,
  };
  const routes = await installDoubanFixtureRoutes(extContext, [rule]);
  const page = await extContext.newPage();
  await page.goto(target.url, { waitUntil: 'domcontentloaded' });
  // The document must come from the fixture, not from the empty catch-all net.
  expect(routes.served(), 'fixture bytes served under the real host URL').toContain(rule.fixture);
  // document_start shell: host + open shadow root already carrying a <style>.
  await page.waitForFunction(
    () => !!document.getElementById('umm-douban-overlay')?.shadowRoot?.querySelector('style'),
    undefined,
    { timeout: 30_000 },
  );
  return page;
}

/** A card click must open a tab on exactly the URL the host pairs with that card. */
async function opensTab(page: Page, trigger: Locator, expected: string): Promise<void> {
  const ctx = page.context();
  expect(expected, 'the host advertises a URL for this card').not.toBe('');
  const opened = ctx.waitForEvent('page');
  await trigger.click();
  const tab = await opened;
  await tab.waitForURL(expected);
  expect(tab.url(), 'the overlay click opened the host-paired URL').toBe(expected);
  await tab.close();
  await page.bringToFront();
}

/** Click the card named `name`; the tab it opens must carry the host's URL. */
async function openName(page: Page, card: string, sel: string, name: string, pairs: HostPair[]) {
  await opensTab(page, byName(page, card, sel, name), urlOf(pairs, name));
}

/** Write → mark → delete → unmark lives in ./fixtures/douban-live-record.ts. */

test.describe('douban music homepage overlay (crawled fixture)', () => {
  const ALBUM_SHAPE = sh('[data-react-component="NewAlbums"]', '.album-item', '.album-title a', {
    requireSubject: true,
  });
  // The host writes both artist tabs under .popular-artists; 本周流行 is the
  // grid the overlay surfaces.
  const ARTIST_SHAPE = sh('.popular-artists .artists', '.artist-item', 'a.title', {
    needBgImage: true,
    requireHref: true,
  });
  const CARD = `${OVERLAY} .umm-rec-item`;
  const TITLE = `${CARD} .umm-rec-title`;
  const ARTIST_CARD = `${OVERLAY} .umm-artist-card`;

  test('renders exactly the albums and artists the host grids advertise', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'home');
    const albums = await readHostItems(page, ALBUM_SHAPE);
    const artists = await readHostItems(page, ARTIST_SHAPE);
    // Non-vacuity: an empty host map would make every comparison below trivially true.
    expect(albums.length, 'host new-album carousel advertises subjects').toBeGreaterThan(1);
    expect(new Set(albums.map((a) => a.id)).size, 'host album ids distinct').toBe(albums.length);
    expect(artists.length, 'host artist tiles carry a name and a picture').toBeGreaterThan(1);

    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await expect(cards).toHaveCount(albums.length);
    expect(await texts(page, TITLE)).toEqual(albums.map((a) => a.name));
    await expect(page.locator(ARTIST_CARD)).toHaveCount(artists.length);
    expect(await texts(page, `${OVERLAY} .umm-artist-name`)).toEqual(artists.map((a) => a.name));
    expect(await attrs(page, ARTIST_CARD, 'href')).toEqual(artists.map((a) => a.href));
  });

  test('clicking an album card opens its subject, an artist card its site page', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'home');
    const albums = await readHostItems(page, ALBUM_SHAPE);
    const artists = await readHostItems(page, ARTIST_SHAPE);
    const titles = page.locator(TITLE);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });
    // Album cards are divs wired through openExternalUrl, so the title is the
    // only join key — the host id behind it is what the new tab must carry.
    const albumTitle = (await texts(page, TITLE))[0] ?? '';
    await opensTab(page, titles.first(), urlOf(albums, albumTitle));
    // The artist section renders after the album section, so reading its first
    // name without waiting can return [] — the empty join key then surfaced as
    // "the host advertises no URL" several frames away from the real cause.
    const artistNames = page.locator(`${OVERLAY} .umm-artist-name`);
    await expect(artistNames.first()).toBeVisible({ timeout: 60_000 });
    const artistName = (await artistNames.allInnerTexts())[0]?.trim() ?? '';
    expect(artistName, 'overlay 未渲染任何艺人名，本例的联键不存在').not.toBe('');
    await openName(page, ARTIST_CARD, '.umm-artist-name', artistName, artists);
    expect(page.url(), 'the host document never navigated').toBe(PAGES.home.url);
  });

  test('an external write marks exactly that album card and a delete clears it, without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openPage(extContext, 'home');
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 60_000 });
    const title = (await texts(page, TITLE))[0] ?? '';
    const id = (await readHostItems(page, ALBUM_SHAPE)).find((a) => a.name === title)?.id ?? '';
    expect(id, `host grid advertises no subject for ${JSON.stringify(title)}`).not.toBe('');
    await liveRecordRoundTrip(
      extPage,
      page,
      `music::${id}`,
      `https://${MUSIC}/subject/${id}/`,
      byName(page, CARD, '.umm-rec-title', title),
    );
    expect(page.url(), 'same document: no reload between write and mark').toBe(PAGES.home.url);
  });
});

test.describe('douban albums (version list) overlay (crawled fixture)', () => {
  // Only entries whose `li` carries a numeric id are versions of this release;
  // the host also links a recommendation block and a non-numeric id.
  const VERSION_SHAPE = sh('ul.cover-container', 'li.dlist', 'a.pl2', {
    itemIdPattern: '^\\d+$',
    requireSubject: true,
  });
  const CARD = `${OVERLAY} .umm-album-card`;

  test('renders the host album title, the host version count and one card per version', async ({
    extContext,
    extPage,
  }) => {
    // X109：版本计数文案（「N 个版本」）已入词典 ⇒ 钉 zh-CN 再断原串。
    await setStoredLanguage(extPage, 'zh-CN');
    const page = await openPage(extContext, 'albums');
    const versions = await readHostItems(page, VERSION_SHAPE);
    expect(versions.length, 'host lists several numeric-id version entries').toBeGreaterThan(1);
    expect(new Set(versions.map((v) => v.id)).size, 'host version ids distinct').toBe(
      versions.length,
    );

    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    expect(await firstText(page, `${OVERLAY} .umm-albums-title`)).toBe(await hostText(page, 'h1'));
    await expect(cards).toHaveCount(versions.length);
    expect(await firstText(page, `${OVERLAY} .umm-albums-count`)).toBe(`${versions.length} 个版本`);
    expect(await texts(page, `${OVERLAY} .umm-album-card-title`)).toEqual(
      versions.map((v) => v.name),
    );
    expect(await attrs(page, CARD, 'href')).toEqual(versions.map((v) => v.href));
  });

  test('clicking a version card opens that version, not an identically named sibling', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'albums');
    const versions = await readHostItems(page, VERSION_SHAPE);
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    // Every version shares the album name, so only the href pins which entry
    // was clicked: the middle card must open the middle host entry.
    const middle = versions[Math.floor(versions.length / 2)]?.href ?? '';
    await opensTab(page, cards.nth(versions.findIndex((v) => v.href === middle)), middle);
  });

  test('an external write marks that version card and a delete clears it, without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openPage(extContext, 'albums');
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 60_000 });
    const target = (await readHostItems(page, VERSION_SHAPE))[0];
    expect(target?.id, 'host advertises a first version subject').toBeTruthy();
    // The card is the anchor itself, so its href attribute is the only join key.
    await liveRecordRoundTrip(
      extPage,
      page,
      `music::${target?.id ?? ''}`,
      target?.href ?? '',
      page.locator(`${OVERLAY} .umm-album-card[href="${target?.href ?? ''}"]`),
    );
    expect(page.url(), 'same document: no reload between write and mark').toBe(PAGES.albums.url);
  });
});

test.describe('douban artists-overview overlay (crawled fixture)', () => {
  const ARTIST_SHAPE = sh('#guess-artists', 'li', '.artist-name a', { requireHref: true });
  const EVENT_SHAPE = sh('#artists-events', 'li', '.pic a', { name: '.desc', requireHref: true });
  // Here the item itself is the anchor, so the shape names no inner nodes.
  const GENRE_SHAPE: HostShape = { container: '.genre-nav .bd', item: 'a', requireHref: true };
  const ARTIST_CARD = `${OVERLAY} .umm-artist-card`;

  test('every section renders the entries the host advertises, nothing more', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'artists');
    const artists = await readHostItems(page, ARTIST_SHAPE);
    const events = await readHostItems(page, EVENT_SHAPE);
    const genres = await readHostItems(page, GENRE_SHAPE);
    expect(artists.length, 'host recommends artists').toBeGreaterThan(1);
    expect(new Set(artists.map((a) => a.href)).size, 'host artist links distinct').toBe(
      artists.length,
    );
    expect(events.length, 'host recommends events').toBeGreaterThan(1);
    expect(genres.length, 'host genre nav carries named links').toBeGreaterThan(1);

    const cards = page.locator(ARTIST_CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await expect(cards).toHaveCount(artists.length);
    expect(await texts(page, `${OVERLAY} .umm-artist-name`)).toEqual(artists.map((a) => a.name));
    await expect(page.locator(`${OVERLAY} .umm-event-card`)).toHaveCount(events.length);
    await expect(page.locator(`${OVERLAY} .umm-genre-tag`)).toHaveCount(genres.length);
    expect(await attrs(page, `${OVERLAY} .umm-genre-tag`, 'href')).toEqual(
      genres.map((g) => g.href),
    );
    // Event cards show the blurb only: each must be a piece of the host blurb
    // of the same entry, in host order.
    const descs = await texts(page, `${OVERLAY} .umm-event-desc`);
    expect(descs.length).toBe(events.length);
    for (const [i, evt] of events.entries()) {
      const shown = descs[i] ?? '';
      expect(shown.length > 0 && evt.name.includes(shown), `${shown} not in host blurb`).toBe(true);
    }
  });

  test('a recommended artist and a genre tag each open the host-paired URL', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'artists');
    const artists = await readHostItems(page, ARTIST_SHAPE);
    const genres = await readHostItems(page, GENRE_SHAPE);
    await expect(page.locator(ARTIST_CARD).first()).toBeVisible({ timeout: 60_000 });
    const name = (await texts(page, `${OVERLAY} .umm-artist-name`))[0] ?? '';
    await openName(page, ARTIST_CARD, '.umm-artist-name', name, artists);
    // The tag list is a separate section from the artist cards: waiting on the
    // cards does not imply the tags have rendered (same race class as above).
    const tags = page.locator(`${OVERLAY} .umm-genre-tag`);
    await expect(tags.first()).toBeVisible({ timeout: 60_000 });
    const tag = (await tags.allInnerTexts())[0]?.trim() ?? '';
    expect(tag, 'overlay 未渲染任何分类标签，本例的联键不存在').not.toBe('');
    const tagCard = page.locator(`${OVERLAY} .umm-genre-tag`).filter({ hasText: tag });
    await opensTab(page, tagCard.first(), urlOf(genres, tag));
    expect(page.url(), 'the host document never navigated').toBe(PAGES.artists.url);
  });
});

test.describe('douban music-collect overlay (crawled fixture)', () => {
  const ITEM_SHAPE = sh('.grid-view', '.item.comment-item', '.info .title a', {
    requireSubject: true,
  });
  const CARD = `${OVERLAY} .umm-mc-card`;

  test('the shelf renders one card per host item and mirrors the host user and counter', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'collect');
    const items = await readHostItems(page, ITEM_SHAPE);
    expect(items.length, 'host shelf advertises subject items').toBeGreaterThan(1);
    expect(new Set(items.map((i) => i.id)).size, 'host shelf ids distinct').toBe(items.length);

    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await expect(cards).toHaveCount(items.length);
    expect(await attrs(page, CARD, 'href')).toEqual(items.map((i) => i.href));
    // The host writes each label as one anchor (`Album / edition`), so every
    // card title must be a piece of the label of its own href.
    const titles = await texts(page, `${OVERLAY} .umm-mc-card-title`);
    expect(titles.length).toBe(items.length);
    for (const [i, item] of items.entries()) {
      expect(item.name.includes(titles[i] ?? ''), `${titles[i]} not in ${item.name}`).toBe(true);
    }
    for (const sub of await texts(page, `${OVERLAY} .umm-mc-card-subtitle`)) {
      expect(
        items.some((it) => it.name.includes(sub)),
        `subtitle ${sub} host-backed`,
      ).toBe(true);
    }
    // Identity and the visible counter are copied from the host, not recomputed.
    expect(await firstText(page, `${OVERLAY} .umm-userbar-name`)).toBe(
      await hostText(page, '#db-usr-profile h1'),
    );
    expect(await firstText(page, `${OVERLAY} .umm-mc-pageinfo`)).toBe(
      await hostText(page, '.subject-num'),
    );
  });

  test('clicking a shelf card opens the subject the host paired with it', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'collect');
    const items = await readHostItems(page, ITEM_SHAPE);
    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    const last = items.length - 1;
    await opensTab(page, cards.nth(last), items[last]?.href ?? '');
    expect(page.url(), 'the host document never navigated').toBe(PAGES.collect.url);
  });
});

test.describe('douban music-profile overlay (crawled fixture)', () => {
  // The host alt text decorates the title, so the label comes from an attribute.
  const ALBUM_SHAPE = sh('#db-music-mine', 'li', 'a.cover', {
    name: 'a.cover img',
    nameAttr: 'alt',
    requireSubject: true,
  });
  const MUSICIAN_SHAPE = sh('#musicians', 'li', '.mname a', { requireHref: true });
  const DOULIST_SHAPE = sh('.aside .mod.doulist', 'li', 'a.dl-title', { requireHref: true });
  const STAT_SHAPE: HostShape = {
    container: '.number-accumulated',
    item: '.number-item',
    name: '.number-label',
  };
  const MORE_SHAPE: HostShape = { container: '#db-music-mine h2', item: 'a', requireHref: true };
  const CARD = `${OVERLAY} .umm-mp-card`;

  test('hero, stats, albums, musicians and doulists all match the host sections', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'profile');
    const albums = await readHostItems(page, ALBUM_SHAPE);
    const musicians = await readHostItems(page, MUSICIAN_SHAPE);
    const doulists = await readHostItems(page, DOULIST_SHAPE);
    const stats = await readHostItems(page, STAT_SHAPE);
    expect(albums.length, 'host album grid advertises subjects').toBeGreaterThan(1);
    expect(musicians.length, 'host musician list advertises links').toBeGreaterThan(1);
    expect(doulists.length, 'host doulist list advertises titled links').toBeGreaterThan(1);
    expect(stats.length, 'host stat bar advertises labelled counts').toBeGreaterThan(1);

    const cards = page.locator(CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    expect(await firstText(page, `${OVERLAY} .umm-mp-hero-name`)).toBe(
      await hostText(page, '.music-user-profile .username'),
    );
    await expect(cards).toHaveCount(albums.length);
    expect(await attrs(page, CARD, 'href')).toEqual(albums.map((a) => a.href));
    // Each card label must be a piece of exactly one host alt — a shared alt
    // would not pin a subject id.
    const titles = await texts(page, `${OVERLAY} .umm-mp-card-title`);
    expect(titles.length).toBe(albums.length);
    for (const title of titles) {
      expect(albums.filter((a) => a.name.includes(title)).length, `alt for ${title} unique`).toBe(
        1,
      );
    }
    await expect(page.locator(`${OVERLAY} .umm-mp-musician`)).toHaveCount(musicians.length);
    expect(await texts(page, `${OVERLAY} .umm-mp-musician`)).toEqual(musicians.map((m) => m.name));
    expect(await attrs(page, `${OVERLAY} .umm-mp-musician`, 'href')).toEqual(
      musicians.map((m) => m.href),
    );
    await expect(page.locator(`${OVERLAY} .umm-mp-doulist-title`)).toHaveCount(doulists.length);
    expect(await texts(page, `${OVERLAY} .umm-mp-doulist-title`)).toEqual(
      doulists.map((d) => d.name),
    );
    await expect(page.locator(`${OVERLAY} .umm-statbar-item`)).toHaveCount(stats.length);
    expect(await texts(page, `${OVERLAY} .umm-statbar-lbl`)).toEqual(stats.map((s) => s.name));
    expect(await attrs(page, `${OVERLAY} .umm-mp-section-more`, 'href')).toEqual(
      (await readHostItems(page, MORE_SHAPE)).map((m) => m.href),
    );
  });

  test('clicking an album card opens the subject the host paired with it', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'profile');
    const albums = await readHostItems(page, ALBUM_SHAPE);
    await expect(page.locator(CARD).first()).toBeVisible({ timeout: 60_000 });
    const title = (await texts(page, `${OVERLAY} .umm-mp-card-title`))[0] ?? '';
    const hits = albums.filter((a) => a.name.includes(title));
    expect(hits.length, `host alt for ${JSON.stringify(title)} must be unique`).toBe(1);
    await opensTab(page, byName(page, CARD, '.umm-mp-card-title', title), hits[0]?.href ?? '');
    expect(page.url(), 'the host document never navigated').toBe(PAGES.profile.url);
  });
});

test.describe('douban genre (artist list) overlay (crawled fixture)', () => {
  const NAV_SHAPE: HostShape = { container: '.link_list', item: 'a,span' };
  const PAGE_SHAPE: HostShape = { container: '.paginator', item: 'a[href]', requireHref: true };
  const ARTIST_SHAPE = sh('.photo-root', 'li', 'img.artist_s', {
    nameAttr: 'alt',
    href: 'a',
    requireHref: true,
  });
  const ARTIST_CARD = `${OVERLAY} .umm-artist-card`;

  test('renders the current genre, its nav and the artist grid the host advertises', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'genre');
    const artists = await readHostItems(page, ARTIST_SHAPE);
    const nav = await readHostItems(page, NAV_SHAPE);
    const hostCurrent = await hostText(page, '.link_list span');
    expect(hostCurrent, 'host marks the current genre with a span').not.toBe('');
    expect(artists.length, 'host artist grid advertises linked pictures').toBeGreaterThan(1);
    expect(new Set(artists.map((a) => a.name)).size, 'host artist names distinct').toBe(
      artists.length,
    );
    expect(nav.length, 'host genre nav advertises its entries').toBeGreaterThan(1);

    const cards = page.locator(ARTIST_CARD);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    await expect(cards).toHaveCount(artists.length);
    expect(await texts(page, `${OVERLAY} .umm-artist-name`)).toEqual(artists.map((a) => a.name));
    expect(await attrs(page, ARTIST_CARD, 'href')).toEqual(artists.map((a) => a.href));
    // The current genre surfaces once as the heading and once inside the nav —
    // both must be the word the host marked with a span.
    expect(await firstText(page, `${OVERLAY} .umm-genre-title`)).toBe(hostCurrent);
    await expect(page.locator(`${OVERLAY} .umm-genre-nav-current`)).toHaveCount(1);
    expect(await firstText(page, `${OVERLAY} .umm-genre-nav-current`)).toBe(hostCurrent);
    await expect(page.locator(`${OVERLAY} .umm-genre-nav a`)).toHaveCount(nav.length);
    expect(await texts(page, `${OVERLAY} .umm-genre-nav a`)).toEqual(nav.map((n) => n.name));
    // Page counter: the current page is the host's own marker, the total the
    // highest page number its paginator links point at.
    const hostPage = await hostText(page, '.paginator .thispage');
    expect(hostPage, 'host marks the current page').not.toBe('');
    const links = (await readHostItems(page, PAGE_SHAPE)).map((p) =>
      Number(/\/(\d+)\/?$/.exec(p.href)?.[1] ?? Number.NaN),
    );
    expect(links.length, 'host paginator links to numbered pages').toBeGreaterThan(1);
    expect(await firstText(page, `${OVERLAY} .umm-page-info`)).toBe(
      `${hostPage} / ${Math.max(...links)}`,
    );
  });

  test('clicking a genre artist opens the site page the host paired with that name', async ({
    extContext,
  }) => {
    const page = await openPage(extContext, 'genre');
    const artists = await readHostItems(page, ARTIST_SHAPE);
    await expect(page.locator(ARTIST_CARD).first()).toBeVisible({ timeout: 60_000 });
    const names = await texts(page, `${OVERLAY} .umm-artist-name`);
    const name = names[names.length - 1] ?? '';
    expect(artists.filter((a) => a.name === name).length, `host entry ${name} unique`).toBe(1);
    await openName(page, ARTIST_CARD, '.umm-artist-name', name, artists);
    expect(page.url(), 'the host document never navigated').toBe(PAGES.genre.url);
  });
});
