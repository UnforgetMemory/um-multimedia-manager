/**
 * X27-B (user surfaces) — the `user-profile`, `user-media`, `user-celebrities`,
 * `user-reviews`, `doulists` (www + movie branches) and `doulist-detail`
 * overlays, in a real browser with the real built extension, each host body
 * replaced by the fixture the node-side extraction spec already parses.
 * Expected values come out of the HOST light DOM only (`readHostSubjects` plus
 * the scoped `page.evaluate` readers below): the overlay lives in a shadow root
 * so it cannot feed them, and lists are compared exactly and in host order —
 * which fails an overlay that invents a card, drops one, or mis-pairs a title
 * with someone else's URL.
 * Live record refresh is asserted for `doulist-detail` alone, the only one of
 * these six apps that mounts `useRecordCache`
 * (src/scenario/douban/pages/doulist-detail/App.vue); the other five render no
 * per-item status badge, so there is no badge to flip without a reload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  test,
} from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';
import { readHostSubjects, type HostSubject } from './fixtures/douban-host-subjects';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY = '#umm-douban-overlay';

/** Bytes the fixture handed the host URL — the ultimate provenance source. */
function fixtureText(name: string): string {
  return fs.readFileSync(path.resolve(HERE, '..', 'fixtures', 'douban', `${name}.html`), 'utf8');
}

/** Whitespace-insensitive compare (host text nodes keep newlines, Vue does not). */
function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function resolve(base: string, href: string): string {
  return new URL(href, base).href;
}

/** Alias of the shared helper; keeps this spec's rule-array call shape. */
const openFixture = (ctx: BrowserContext, rules: DoubanFixtureRule[], url: string): Promise<Page> =>
  openDoubanFixturePage(ctx, rules, url, { shell: 'umm-douban-overlay' });

type HostLink = { label: string; href: string };

/**
 * Labels + hrefs the HOST prints for `selector`. A link is named by its own
 * `<em>`, else by an `<img alt>`, else by its text — the three ways Douban
 * labels one and the same card, read here without touching the extractor.
 */
async function hostLinks(page: Page, selector: string): Promise<HostLink[]> {
  return page.evaluate((sel) => {
    const out: HostLink[] = [];
    // Whitespace runs collapse to one space, exactly like `squash` does on this
    // side — page-side code cannot call back into the Node test module.
    const clean = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>(sel))) {
      const alt = a.querySelector('img[alt]')?.getAttribute('alt') ?? '';
      const em = clean(a.querySelector('em')?.textContent);
      const label = em || clean(alt) || clean(a.textContent);
      if (label.length > 0) out.push({ label, href: a.getAttribute('href') ?? '' });
    }
    return out;
  }, selector);
}

/** InnerText of every overlay match, squashed for pairing. */
async function rendered(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(`${OVERLAY} ${selector}`).allInnerTexts()).map(squash);
}

/** href of every overlay match, resolved the way a click would resolve it. */
async function renderedHrefs(page: Page, selector: string, base: string): Promise<string[]> {
  const links = page.locator(`${OVERLAY} ${selector}`);
  const count = await links.count();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(resolve(base, (await links.nth(i).getAttribute('href')) ?? ''));
  }
  return out;
}

/**
 * Index of `label` among the rendered titles. A duplicate label would make the
 * index an unusable join key, so it is rejected here instead of silently
 * pointing at the wrong card.
 */
function indexOfLabel(labels: string[], label: string): number {
  const first = labels.indexOf(label);
  const missing = `overlay renders no card labelled ${JSON.stringify(label)}`;
  expect(first, missing).toBeGreaterThanOrEqual(0);
  expect(labels.lastIndexOf(label), `label ${JSON.stringify(label)} is ambiguous`).toBe(first);
  return first;
}

/**
 * Click an overlay anchor and require the new tab to land exactly on `expected`.
 * These cards are plain `target="_blank"` anchors, so the tab URL is the href
 * the overlay itself bound; comparing it against the href the HOST printed for
 * the same title proves the pairing survived extraction.
 */
async function clickOpens(page: Page, ctx: BrowserContext, target: Locator, expected: string) {
  const origin = page.url();
  expect(expected.length, 'the host named a URL to open').toBeGreaterThan(8);
  const popupPromise = ctx.waitForEvent('page');
  await target.click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url(), { timeout: 15_000 }).toBe(expected);
  await popup.close();
  expect(page.url(), 'the overlay tab never moved').toBe(origin);
}

/** Nothing the overlay prints may be absent from the bytes the host served. */
async function assertNothingInvented(page: Page, raw: string, selectors: string[]): Promise<void> {
  const squashed = squash(raw);
  const labels = (await Promise.all(selectors.map((s) => rendered(page, s))))
    .flat()
    .filter((t) => t.length > 0);
  expect(labels.length, 'the sweep saw a real overlay body').toBeGreaterThanOrEqual(8);
  for (const label of labels) {
    expect(squashed.includes(label), `invented overlay label: ${label}`).toBe(true);
  }
}

const PROFILE_URL = 'https://www.douban.com/people/unforgetmemory/';
const PROFILE_RULES: DoubanFixtureRule[] = [
  { host: 'www.douban.com', match: '/people/unforgetmemory', fixture: 'user-profile' },
];

test.describe('douban user-profile overlay (fixture user-profile)', () => {
  test('dashboard cards, reviews and friends equal the host entries', async ({ extContext }) => {
    const page = await openFixture(extContext, PROFILE_RULES, PROFILE_URL);
    await expect(page.locator(`${OVERLAY} .umm-dash-card`).first()).toBeVisible({
      timeout: 60_000,
    });

    // One card per anchor inside `li.aob`; the fixture's text-only placeholder
    // li carries no anchor and must never become a card.
    const hosts = await hostLinks(page, 'li.aob a[href]');
    expect(hosts.length, 'host dashboard rows advertise several links').toBeGreaterThanOrEqual(5);
    expect(await page.locator(`${OVERLAY} .umm-dash-card`).count()).toBe(hosts.length);
    expect(await rendered(page, '.umm-dash-card-title')).toEqual(hosts.map((h) => h.label));

    // Only the two `li.pl2` anchors pointing at /review/NN are reviews: the
    // third ul links a /subject/ page, and the trailing div is not a ul.tlst.
    const reviewHosts = await hostLinks(page, '#review > ul.tlst li.pl2 a[href*="/review/"]');
    expect(reviewHosts.length, 'the host prints two review headings').toBe(2);
    expect(await rendered(page, '.umm-review-title')).toEqual(reviewHosts.map((h) => h.label));

    // The fourth friend <dl> has a picture but no name link → 3 cards.
    const friendHosts = await hostLinks(page, '#friend dl.obu dd a[href]');
    expect(friendHosts.length, 'the host names three friends').toBe(3);
    expect(await rendered(page, '.umm-friend-name')).toEqual(friendHosts.map((h) => h.label));

    // The doulist/feed sections have no pair to join on here (a title's "(N)"
    // becomes its own count node), so they are provenance-checked as substrings
    // of the bytes the host served instead.
    await assertNothingInvented(page, fixtureText('user-profile'), [
      '.umm-hero-name',
      '.umm-dash-card-title',
      '.umm-doulist-item-title',
      '.umm-review-title',
      '.umm-review-subject',
      '.umm-friend-name',
      '.umm-status-target',
    ]);
  });

  test('a dashboard card click opens the URL the host printed for it', async ({ extContext }) => {
    const page = await openFixture(extContext, PROFILE_RULES, PROFILE_URL);
    const titles = page.locator(`${OVERLAY} .umm-dash-card-title`);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });
    const hosts = await hostLinks(page, 'li.aob a[href]');
    const shown = await rendered(page, '.umm-dash-card-title');
    expect(shown).toEqual(hosts.map((h) => h.label));
    // The music dashboard row and the status feed name the same album, so the
    // join runs over the ordered equality asserted above.
    const idx = indexOfLabel(shown, '拉威尔');
    const href = hosts[idx]?.href ?? '';
    expect(squash(href), 'the host anchor carries the music subject URL').toContain(
      'music.douban.com/subject/36728012/',
    );
    await clickOpens(page, extContext, titles.nth(idx), resolve(PROFILE_URL, href));
  });
});

const MEDIA_URL = 'https://movie.douban.com/people/xingxing/collect';
const MEDIA_RULES: DoubanFixtureRule[] = [
  { host: 'movie.douban.com', match: '/people/xingxing/collect', fixture: 'user-media' },
];

test.describe('douban user-media overlay (fixture user-media)', () => {
  test('one card per host subject; the non-subject entry stays out', async ({ extContext }) => {
    const page = await openFixture(extContext, MEDIA_RULES, MEDIA_URL);
    const cards = page.locator(`${OVERLAY} .umm-dash-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    // `.grid-view .item a[href*="/subject/"]` is the page's own definition of a
    // shelf entry; the 4th item only links /annual/2023, so it is not one.
    const hosts = await hostLinks(page, '.grid-view .item a[href*="/subject/"]');
    expect(hosts.length, 'three host items advertise a subject').toBe(3);
    const shown = await rendered(page, '.umm-dash-card-title');
    expect(shown).toEqual(hosts.map((h) => h.label));
    await expect(cards).toHaveCount(hosts.length);
    expect(shown, 'the entry without a subject link must not become a card').not.toContain(
      '年度报告入口',
    );
    expect(await renderedHrefs(page, '.umm-dash-card', MEDIA_URL)).toEqual(
      hosts.map((h) => resolve(MEDIA_URL, h.href)),
    );
  });

  test('a card click opens its own item subject, not a neighbour', async ({ extContext }) => {
    const page = await openFixture(extContext, MEDIA_RULES, MEDIA_URL);
    const titles = page.locator(`${OVERLAY} .umm-dash-card-title`);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });
    const shown = await rendered(page, '.umm-dash-card-title');
    expect(new Set(shown).size, 'titles unique so an index joins safely').toBe(shown.length);
    const subjects = await readHostSubjects(page);
    const idx = indexOfLabel(shown, '违规建筑暂名');
    const hits = subjects.filter((s) => squash(s.title) === shown[idx]);
    expect(hits.length, 'that label pairs with exactly one host subject').toBe(1);
    await clickOpens(page, extContext, titles.nth(idx), hits[0]?.href ?? '');
    expect(hits[0]?.id ?? '', 'the opened subject is the one the host named').toBe('1291544');
  });
});

const CELEBS_URL = 'https://movie.douban.com/people/xingxing/celebrities';
const CELEBS_RULES: DoubanFixtureRule[] = [
  { host: 'movie.douban.com', match: '/people/xingxing/celebrities', fixture: 'user-celebrities' },
];

test.describe('douban user-celebrities overlay (fixture user-celebrities)', () => {
  test('every linked celebrity appears as the host names it, in order', async ({ extContext }) => {
    const page = await openFixture(extContext, CELEBS_RULES, CELEBS_URL);
    const cards = page.locator(`${OVERLAY} .umm-celebrities-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    // A card exists where the host item carries a `.title a`; the fixture's
    // picture-only item stays out.
    const hosts = await hostLinks(page, '.grid-view .item .title a[href]');
    expect(hosts.length, 'three host items are linked celebrities').toBe(3);
    await expect(cards).toHaveCount(hosts.length);
    expect(await rendered(page, '.umm-celebrities-name')).toEqual(hosts.map((h) => h.label));
    expect(await renderedHrefs(page, '.umm-celebrities-card', CELEBS_URL)).toEqual(
      hosts.map((h) => resolve(CELEBS_URL, h.href)),
    );

    // Works are the page's own /subject/ anchors: every one must show up, and
    // nothing rendered may be absent from the served bytes. The template glues
    // the works of one card together with a " / " suffix on every but the last.
    const workLabels = (await rendered(page, '.umm-celebrities-works span')).map((t) =>
      t.replace(/\s\/$/, ''),
    );
    const subjects = await readHostSubjects(page);
    expect(subjects.length, 'the host advertises three work subjects').toBe(3);
    for (const s of subjects) {
      expect(
        workLabels.includes(s.title),
        `host work absent from the overlay: ${JSON.stringify(s.title)}`,
      ).toBe(true);
    }
    const raw = squash(fixtureText('user-celebrities'));
    for (const w of workLabels) {
      expect(raw.includes(w), `invented work title: ${JSON.stringify(w)}`).toBe(true);
    }
  });

  test('a celebrity card click opens that celebrity page, per the host anchor', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, CELEBS_RULES, CELEBS_URL);
    const cards = page.locator(`${OVERLAY} .umm-celebrities-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    const hosts = await hostLinks(page, '.grid-view .item .title a[href]');
    // This one has no cover image at all in the fixture: the card exists purely
    // because the host item links it.
    const name = '宫崎骏 Hayao Miyazaki';
    const hostIdx = indexOfLabel(
      hosts.map((h) => h.label),
      name,
    );
    const idx = indexOfLabel(await rendered(page, '.umm-celebrities-name'), name);
    expect(hosts[hostIdx]?.href, 'the host anchor names the celebrity URL').toContain(
      '/celebrity/1002007/',
    );
    await clickOpens(
      page,
      extContext,
      cards.nth(idx),
      resolve(CELEBS_URL, hosts[hostIdx]?.href ?? ''),
    );
  });
});

const REVIEWS_URL = 'https://movie.douban.com/people/unforgetmemory/reviews';
const REVIEWS_RULES: DoubanFixtureRule[] = [
  { host: 'movie.douban.com', match: '/people/unforgetmemory/reviews', fixture: 'user-reviews' },
];

test.describe('douban user-reviews overlay (fixture user-reviews)', () => {
  test('one card per host review entry, with the subject labels the page prints', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, REVIEWS_RULES, REVIEWS_URL);
    const cards = page.locator(`${OVERLAY} .umm-reviews-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    // The third item-list row carries no `id^=review_`, so the page itself does
    // not present it as a review entry.
    const hosts = await hostLinks(page, 'li[id^="review_"] .nlst h3 a[href*="/review/"]');
    expect(hosts.length, 'two entries carry an id and a review link').toBe(2);
    await expect(cards).toHaveCount(hosts.length);
    expect(await rendered(page, '.umm-reviews-review-title a')).toEqual(hosts.map((h) => h.label));

    // The films these reviews are about, exactly as the page labels them.
    const subjects = await readHostSubjects(page);
    expect(subjects.length, 'one advertised subject per review').toBe(hosts.length);
    expect(await rendered(page, '.umm-reviews-subject a')).toEqual(
      subjects.map((s) => squash(s.title)),
    );
    // The orphan row's title may never leak in as a third card.
    expect(
      await page.locator(`${OVERLAY} .umm-reviews-review-title a`).nth(2).count(),
      'the id-less row stays out of the list',
    ).toBe(0);
  });

  test('a review card subject link opens that subject URL', async ({ extContext }) => {
    const page = await openFixture(extContext, REVIEWS_RULES, REVIEWS_URL);
    const subjectLinks = page.locator(`${OVERLAY} .umm-reviews-subject a`);
    await expect(subjectLinks.first()).toBeVisible({ timeout: 60_000 });
    const subjects = await readHostSubjects(page);
    const idx = indexOfLabel(await rendered(page, '.umm-reviews-subject a'), '宇宙探索编辑部');
    const hits = subjects.filter((s) => squash(s.title) === '宇宙探索编辑部');
    expect(hits.length, 'that label is unambiguous on the page').toBe(1);
    expect(hits[0]?.id, 'the label belongs to the subject the review is about').toBe('30236198');
    await clickOpens(page, extContext, subjectLinks.nth(idx), hits[0]?.href ?? '');
  });
});

const DOULISTS_WWW_URL = 'https://www.douban.com/people/1234567/doulists';
const DOULISTS_WWW_RULES: DoubanFixtureRule[] = [
  { host: 'www.douban.com', match: '/people/1234567/doulists', fixture: 'doulists-www' },
];
const DOULISTS_MOVIE_URL = 'https://movie.douban.com/people/li4/doulists';
const DOULISTS_MOVIE_RULES: DoubanFixtureRule[] = [
  { host: 'movie.douban.com', match: '/people/li4/doulists', fixture: 'doulists-movie' },
];
const DOULIST_CARD = `${OVERLAY} .umm-doulist-card`;

test.describe('douban doulists overlay (fixtures doulists-www + doulists-movie)', () => {
  test('www branch: exactly the lists the page links, and clicking a card opens its own doulist', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, DOULISTS_WWW_RULES, DOULISTS_WWW_URL);
    await expect(page.locator(DOULIST_CARD).first()).toBeVisible({ timeout: 60_000 });
    // A row is a list when its host heading links a /doulist/ or a
    // /subject_collection/ target — the mixed-in /topic/ row is neither.
    const hosts = await hostLinks(
      page,
      'ul.doulist-list li h3 a[href*="/doulist/"], ul.doulist-list li h3 a[href*="/subject_collection/"]',
    );
    expect(hosts.length, 'three of the four rows name a list').toBe(3);
    const shown = await rendered(page, '.umm-doulist-title');
    expect(shown).toEqual(hosts.map((h) => h.label));
    await expect(page.locator(DOULIST_CARD)).toHaveCount(hosts.length);
    expect(shown, 'the /topic/ row must not become a card').not.toContain(
      '小组热帖（非豆列，混入列表）',
    );
    expect(await renderedHrefs(page, '.umm-doulist-card', DOULISTS_WWW_URL)).toEqual(
      hosts.map((h) => resolve(DOULISTS_WWW_URL, h.href)),
    );

    // Real interaction, not just a bound attribute: the card opens its own list.
    const idx = indexOfLabel(shown, '华语犯罪片单');
    expect(hosts[idx]?.href, 'the host links that slot to its doulist').toBe(
      'https://www.douban.com/doulist/1500001/',
    );
    await clickOpens(page, extContext, page.locator(DOULIST_CARD).nth(idx), hosts[idx]?.href ?? '');
  });

  test('movie branch: table rows become cards and a relative href lands absolutely', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, DOULISTS_MOVIE_RULES, DOULISTS_MOVIE_URL);
    await expect(page.locator(DOULIST_CARD).first()).toBeVisible({ timeout: 60_000 });
    // Row 3 is a plain <span> recommendation slot: no anchor, no card. The
    // count sits in a sibling <em>, so it must not bleed into the title.
    const hosts = await hostLinks(page, '#doulist-content table.list-b td > a[href]');
    expect(hosts.length, 'two list rows carry a link').toBe(2);
    await expect(page.locator(DOULIST_CARD)).toHaveCount(hosts.length);
    const shown = await rendered(page, '.umm-doulist-title');
    expect(shown).toEqual(hosts.map((h) => h.label));
    expect(shown[0] ?? '', 'the [28] count stayed out of the title').toBe('是枝裕和剧场');

    // Row 2's href is relative to the people URL the page is served at: the card
    // must open its own doulist, not the shelf it came from.
    const idx = indexOfLabel(shown, '夜航片单');
    expect(hosts[idx]?.href, 'the host href really is relative').toBe('/doulist/1450003/');
    await clickOpens(
      page,
      extContext,
      page.locator(DOULIST_CARD).nth(idx),
      'https://movie.douban.com/doulist/1450003/',
    );
  });
});

const DOULIST_URL = 'https://www.douban.com/doulist/1500001/';
const DOULIST_RULES: DoubanFixtureRule[] = [
  { host: 'www.douban.com', match: '/doulist/1500001', fixture: 'doulist-detail' },
];
const DLIST_ITEM = `${OVERLAY} .umm-dlist-item`;

/**
 * The store-key prefix a badge lookup uses follows the subject URL's own host
 * (src/scenario/douban/shared/subject-keys.ts): music → `music::`,
 * book → `book::`, movie/www → `movie::`. A movie/www subject is additionally
 * looked up under a sibling `tv::<id>` key, and nothing in the host DOM names
 * that row — it is therefore deliberately left unprobed here; only the prefix
 * the URL itself implies is written, so a wrong prefix cannot be masked by the
 * fallback.
 */
function subjectPrefix(subject: HostSubject): 'music' | 'book' | 'movie' {
  const host = new URL(subject.href, DOULIST_URL).hostname;
  if (host.startsWith('music.')) return 'music';
  if (host.startsWith('book.')) return 'book';
  return 'movie';
}

function pickSubject(hosts: HostSubject[], want: 'music' | 'book' | 'movie'): HostSubject {
  const hit = hosts.find((h) => subjectPrefix(h) === want);
  if (!hit) throw new Error(`the page advertises no ${want}.douban.com subject`);
  return hit;
}

function recordKeyOf(subject: HostSubject): string {
  return `${subjectPrefix(subject)}::${subject.id}`;
}

test.describe('douban doulist-detail overlay (fixture doulist-detail)', () => {
  test('header, counts and items trace back to the page; the ad block stays out', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, DOULIST_RULES, DOULIST_URL);
    await expect(page.locator(DLIST_ITEM).first()).toBeVisible({ timeout: 60_000 });

    const head = await page.evaluate(() => {
      const clean = (t: string | null | undefined): string => (t ?? '').replace(/\s+/g, ' ').trim();
      const active = document.querySelector('.doulist-filter a.active')?.textContent;
      return {
        title: clean(document.querySelector('#content h1')?.textContent),
        // The active filter tab prints the list size itself: "全部(35)".
        total: /[(（](\d+)[)）]/.exec(clean(active))?.[1] ?? '',
        blocks: Array.from(document.querySelectorAll('.doulist-item')).filter((el) =>
          el.querySelector('a[href*="/subject/"]'),
        ).length,
      };
    });
    expect(head.title.length, 'the page names the doulist').toBeGreaterThan(3);
    expect(head.total, 'the active filter tab prints a count').not.toBe('');
    expect(head.blocks, 'only blocks advertising a subject are entries').toBeGreaterThanOrEqual(3);

    await expect(page.locator(`${OVERLAY} .umm-dlist-title`)).toHaveText(head.title);
    const stats = page.locator(`${OVERLAY} .umm-dlist-stat-value`);
    await expect(stats).toHaveCount(2);
    await expect(stats.nth(0)).toHaveText(head.total);
    await expect(stats.nth(1)).toHaveText(String(head.blocks));

    const hosts = await readHostSubjects(page);
    expect(hosts.length, 'the page advertises one subject per entry').toBe(head.blocks);
    expect(new Set(hosts.map((h) => h.id)).size, 'host subject ids are distinct').toBe(
      hosts.length,
    );
    await expect(page.locator(DLIST_ITEM)).toHaveCount(head.blocks);
    expect(await rendered(page, '.umm-dlist-item-title')).toEqual(
      hosts.map((h) => squash(h.title)),
    );
  });

  test('an item title opens its own subject on that subject host', async ({ extContext }) => {
    const page = await openFixture(extContext, DOULIST_RULES, DOULIST_URL);
    const titles = page.locator(`${OVERLAY} .umm-dlist-item-title`);
    await expect(titles.first()).toBeVisible({ timeout: 60_000 });
    const hosts = await readHostSubjects(page);
    const idx = indexOfLabel(await rendered(page, '.umm-dlist-item-title'), '范特西');
    const hits = hosts.filter((h) => squash(h.title) === '范特西');
    expect(hits.length, 'that title is printed once on the page').toBe(1);
    // The doulist mixes media: this entry lives on the music host, so the card
    // must not carry the page's own (www) origin.
    expect(hits[0]?.href ?? '', 'the album entry points at music.douban.com').toBe(
      'https://music.douban.com/subject/1078062/',
    );
    await clickOpens(page, extContext, titles.nth(idx), hits[0]?.href ?? '');
  });

  test('an external write marks exactly one entry per subject host and a delete undoes it, without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openFixture(extContext, DOULIST_RULES, DOULIST_URL);
    const items = page.locator(DLIST_ITEM);
    await expect(items.first()).toBeVisible({ timeout: 60_000 });
    const hosts = await readHostSubjects(page);
    const labels = await rendered(page, '.umm-dlist-item-title');
    const wish = page.locator(`${OVERLAY} .umm-status--wish`);
    const done = page.locator(`${OVERLAY} .umm-status--done`);

    const movie = pickSubject(hosts, 'movie');
    const music = pickSubject(hosts, 'music');
    expect(movie.id, 'the two entries are different subjects').not.toBe(music.id);
    const movieKey = recordKeyOf(movie);
    const musicKey = recordKeyOf(music);
    expect(movieKey.startsWith('movie::')).toBe(true);
    expect(musicKey.startsWith('music::')).toBe(true);
    const movieIdx = indexOfLabel(labels, squash(movie.title));
    const musicIdx = indexOfLabel(labels, squash(music.title));

    const wipe = async (key: string): Promise<void> => {
      const del = await sendRuntimeMessage(extPage, 'DB_DELETE', { storeName: DOUBAN_STORE, key });
      expect(del.success).toBe(true);
    };
    await wipe(movieKey);
    await wipe(musicKey);
    await expect(wish).toHaveCount(0, { timeout: 30_000 });
    await expect(done).toHaveCount(0);

    // status 1 → the wish badge, on the movie entry only.
    const put1 = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key: movieKey,
      record: makeStoreRecord(movie.href, 1, 0),
    });
    expect(put1.success).toBe(true);
    await expect(wish).toHaveCount(1, { timeout: 30_000 });
    await expect(items.nth(movieIdx).locator('.umm-status--wish')).toHaveCount(1);
    await expect(items.nth(musicIdx).locator('.umm-status')).toHaveCount(0);

    await wipe(movieKey);
    await expect(wish).toHaveCount(0, { timeout: 30_000 });

    // status 2 → the done badge on the album. Written under the prefix its own
    // URL implies: had the page keyed the album as a movie row, this stays dark.
    const put2 = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key: musicKey,
      record: makeStoreRecord(music.href, 2, 9),
    });
    expect(put2.success).toBe(true);
    await expect(done).toHaveCount(1, { timeout: 30_000 });
    await expect(items.nth(musicIdx).locator('.umm-status--done')).toHaveCount(1);
    await expect(items.nth(movieIdx).locator('.umm-status')).toHaveCount(0);
    await expect(wish).toHaveCount(0);

    await wipe(musicKey);
    await expect(done).toHaveCount(0, { timeout: 30_000 });
    expect(page.url(), 'same document throughout — no reload between write and badge').toBe(
      DOULIST_URL,
    );
  });
});
