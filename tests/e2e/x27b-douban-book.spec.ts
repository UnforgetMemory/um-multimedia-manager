/**
 * X27-B — Douban book-family + review-detail overlays, in a real browser with
 * the real built extension, host bodies replaced by the same fixtures the
 * node-side extraction specs already parse: book-collect, book-authors,
 * book-reviews, review-detail, book-review-detail, series.
 *
 * Expected values come from the HOST light DOM (the markup the page itself
 * ships), never from the extractor under test: the overlay must show exactly
 * the entries the page advertises, in the page's own order, each linked to the
 * subject its own title names. `readHostSubjects` supplies the (title, id)
 * pairs and the per-page scoped queries supply the counts, so an overlay that
 * invents an item, absorbs an out-of-scope one, or mis-pairs title↔id fails.
 */

import type { BrowserContext, Locator, Page } from '@playwright/test';
import {
  DOUBAN_STORE,
  expect,
  makeStoreRecord,
  sendRuntimeMessage,
  setStoredLanguage,
  test,
} from './fixtures/extension-harness';
import { openDoubanFixturePage, type DoubanFixtureRule } from './fixtures/douban-crawl-fixtures';
import { readHostSubjects, type HostSubject } from './fixtures/douban-host-subjects';

const OVERLAY = '#umm-douban-overlay';

/** A list row the page itself presents as a bookable subject. */
interface HostEntry {
  id: string;
  href: string;
  title: string;
}

/**
 * Douban names one subject two ways on the same page (`活着` in the list
 * anchor's text, `活着 (豆瓣)` in the cover anchor's `title`), and
 * `readHostSubjects` keeps the first anchor per id — pairing must strip the
 * decoration the way the page itself would.
 */
function normalize(text: string): string {
  return text
    .replace(/[《》\s]/g, '')
    .replace(/[（(]豆瓣[)）]/g, '')
    .trim();
}

/** Whitespace-insensitive compare (host text nodes keep newlines, Vue does not). */
function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function resolve(base: string, href: string): string {
  return new URL(href, base).href;
}

/** Subject id behind an href (`/subject/{digits}/`), empty when not a subject link. */
function subjectIdOf(href: string | null): string {
  return /\/subject\/(\d+)/.exec(href ?? '')?.[1] ?? '';
}

/** The host pair for a rendered title, but only while that pair is unambiguous. */
function uniqueHostId(hosts: HostSubject[], renderedTitle: string): string | undefined {
  const hits = hosts.filter((h) => normalize(h.title) === renderedTitle);
  return hits.length === 1 ? hits[0]?.id : undefined;
}

/**
 * Thin alias of the shared helper: this spec always waits for the
 * document_start shell, so that default stays here instead of in every call.
 */
const openFixture = (ctx: BrowserContext, rule: DoubanFixtureRule, url: string): Promise<Page> =>
  openDoubanFixturePage(ctx, rule, url, { shell: 'umm-douban-overlay' });

/** href attributes of every match of `links`, in render order. */
async function hrefsOf(links: Locator): Promise<string[]> {
  const count = await links.count();
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push((await links.nth(i).getAttribute('href')) ?? '');
  return out;
}

/** Normalized innerText of every match of `selector`. */
async function texts(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(selector).allInnerTexts()).map(normalize);
}

/**
 * Click a link inside the injected UI, require the new tab to land exactly on
 * `expected`, and require the overlay page to still sit on `url` (no reload).
 */
async function clickOpens(
  page: Page,
  extContext: BrowserContext,
  target: Locator,
  expected: string,
  url: string,
): Promise<void> {
  const popupPromise = extContext.waitForEvent('page');
  await target.click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url(), { timeout: 15_000 }).toBe(expected);
  await popup.close();
  expect(page.url(), 'the overlay page never navigated').toBe(url);
}

/** The href the review-detail aside gives for its subject, as an absolute URL. */
async function asideSubjectUrl(page: Page, url: string): Promise<string> {
  const href = await page.evaluate(
    () => document.querySelector('.subject-title a')?.getAttribute('href') ?? '',
  );
  expect(href, 'the aside names the subject URL').not.toBe('');
  const expected = resolve(url, href);
  expect(await page.locator(`${OVERLAY} .umm-rd-subject-title a`).getAttribute('href')).toBe(
    expected,
  );
  return expected;
}

// ==================== book-collect ====================

const BC_URL = 'https://book.douban.com/people/unforgetmemory/collect?sort=time&status=finish';
const BC_RULE: DoubanFixtureRule = {
  host: 'book.douban.com',
  match: '/people/unforgetmemory/collect',
  fixture: 'book-collect',
};
const BC_CARD = `${OVERLAY} .umm-bc-card`;
const BC_TITLE = `${BC_CARD} .umm-bc-title`;

/**
 * Shelf entries only: `li.subject-item` also appears in the aside recommend
 * block, whose `/subject/` link the overlay must not absorb; the last list row
 * is a deregistered entry with no subject link at all.
 */
async function hostShelf(page: Page): Promise<HostEntry[]> {
  return page.evaluate(() => {
    const out: HostEntry[] = [];
    for (const li of Array.from(document.querySelectorAll('ul.interest-list > li.subject-item'))) {
      const a = li.querySelector('h2.title a[href*="/subject/"]');
      const href = a?.getAttribute('href') ?? '';
      const id = /\/subject\/(\d+)/.exec(href)?.[1];
      if (a && id) out.push({ id, href, title: (a.textContent ?? '').trim() });
    }
    return out;
  });
}

test.describe('douban book-collect overlay (fixture)', () => {
  test('renders exactly the shelf entries and a title click opens its own subject', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, BC_RULE, BC_URL);
    const shelf = await hostShelf(page);
    expect(shelf.length, 'fixture shelf holds link-bearing entries').toBeGreaterThanOrEqual(3);
    expect(new Set(shelf.map((s) => s.id)).size, 'shelf ids distinct').toBe(shelf.length);

    const hosts = await readHostSubjects(page);
    const offList = hosts.filter((h) => !shelf.some((s) => s.id === h.id));
    expect(offList.length, 'the aside promo is a host subject outside the shelf').toBe(1);

    const cards = page.locator(BC_CARD);
    await expect(cards).toHaveCount(shelf.length, { timeout: 60_000 });
    const titles = await texts(page, BC_TITLE);
    const links = await hrefsOf(page.locator(BC_TITLE));
    // One assertion covers both directions: nothing invented, nothing dropped.
    expect(
      links
        .map((h) => subjectIdOf(h))
        .sort()
        .join(','),
      'rendered ids === shelf ids',
    ).toBe(
      shelf
        .map((s) => s.id)
        .sort()
        .join(','),
    );

    for (const [i, entry] of shelf.entries()) {
      const rendered = titles[i] ?? '';
      expect(rendered, 'card order follows the host list').toBe(normalize(entry.title));
      expect(links[i], 'card links the subject its own title names').toBe(
        resolve(BC_URL, entry.href),
      );
      // Independent confirmation from the page-wide host map.
      expect(uniqueHostId(hosts, rendered), `unique host pair for ${rendered}`).toBe(entry.id);
    }
    expect(titles, 'promo subject must not leak into the list').not.toContain(
      normalize(offList[0]?.title ?? '__absent__'),
    );

    const first = page.locator(BC_TITLE).first();
    await clickOpens(page, extContext, first, resolve(BC_URL, shelf[0]?.href ?? ''), BC_URL);
  });
});

// ==================== book-authors ====================

const BA_URL = 'https://book.douban.com/people/renji/authors';
const BA_RULE: DoubanFixtureRule = {
  host: 'book.douban.com',
  match: '/people/renji/authors',
  fixture: 'book-authors',
};
const BA_CARD = `${OVERLAY} .umm-authors-card`;

test.describe('douban book-authors overlay (fixture)', () => {
  test('one card per linked author, works as the host names them, click opens it', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, BA_RULE, BA_URL);
    const hostAuthors = await page.evaluate(() => {
      const out: Array<{ href: string; text: string; works: string[] }> = [];
      for (const item of Array.from(document.querySelectorAll('.grid-view .item'))) {
        const a = item.querySelector('.title a[href]');
        if (!a) continue;
        out.push({
          href: a.getAttribute('href') ?? '',
          text: (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
          works: Array.from(item.querySelectorAll('.intro a[href*="/subject/"]')).map((w) =>
            (w.textContent ?? '').trim(),
          ),
        });
      }
      return out;
    });
    expect(hostAuthors.length, 'link-less grid item skipped').toBeGreaterThanOrEqual(3);

    const cards = page.locator(BA_CARD);
    await expect(cards).toHaveCount(hostAuthors.length, { timeout: 60_000 });
    const links = await hrefsOf(cards);
    const names = await texts(page, `${BA_CARD} .umm-authors-name`);
    for (const [i, entry] of hostAuthors.entries()) {
      expect(links[i], 'the card IS the author link the host item carries').toBe(
        resolve(BA_URL, entry.href),
      );
      const name = names[i] ?? '';
      expect(name.length, 'card names the author').toBeGreaterThan(1);
      expect(entry.text.includes(name), `name absent from host: ${name}`).toBe(true);
    }

    // Works: the overlay shows the host's subject links, no more and no fewer.
    // The template renders the ' / ' separator INSIDE each span, so it has to
    // come off before comparing against the host's own labels.
    const renderedWorks = (await texts(page, `${BA_CARD} .umm-authors-works span`)).map((t) =>
      t.replace(/\/+$/, ''),
    );
    const hostWorks = hostAuthors.flatMap((a) => a.works.map(normalize));
    expect(renderedWorks.sort().join('|'), 'rendered works === host works').toBe(
      hostWorks.sort().join('|'),
    );
    const hosts = await readHostSubjects(page);
    expect(hosts.length, 'every host work is its own subject').toBe(hostWorks.length);
    for (const w of renderedWorks) {
      expect(uniqueHostId(hosts, w), `work absent from host map: ${w}`).toBeDefined();
    }

    await clickOpens(
      page,
      extContext,
      cards.first(),
      resolve(BA_URL, hostAuthors[0]?.href ?? ''),
      BA_URL,
    );
  });
});

// ==================== book-reviews ====================

const BR_URL = 'https://book.douban.com/people/reader01/reviews';
const BR_RULE: DoubanFixtureRule = {
  host: 'book.douban.com',
  match: '/people/reader01/reviews',
  fixture: 'book-reviews',
};
const BR_CARD = `${OVERLAY} .umm-reviews-card`;
const BR_TITLE = `${BR_CARD} .umm-reviews-review-title a`;

test.describe('douban book-reviews overlay (fixture)', () => {
  test('one card per host review, only host subjects labelled, click opens the review', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, BR_RULE, BR_URL);
    const hostReviews = await page.evaluate((): HostEntry[] => {
      const seen = new Map<string, HostEntry>();
      for (const a of Array.from(document.querySelectorAll('.article a[href*="/review/"]'))) {
        const href = a.getAttribute('href') ?? '';
        const id = /\/review\/(\d+)/.exec(href)?.[1];
        const title = (a.textContent ?? '').trim();
        if (id && title && !seen.has(id)) seen.set(id, { id, href, title });
      }
      return Array.from(seen.values());
    });
    expect(hostReviews.length, 'host advertises review entries').toBeGreaterThanOrEqual(3);

    const cards = page.locator(BR_CARD);
    await expect(cards).toHaveCount(hostReviews.length, { timeout: 60_000 });
    const titles = await texts(page, BR_TITLE);
    const links = await hrefsOf(page.locator(BR_TITLE));
    for (const [i, entry] of hostReviews.entries()) {
      expect(titles[i], 'card order follows the host review list').toBe(normalize(entry.title));
      expect(links[i], 'card links the review its own title names').toContain(
        `/review/${entry.id}/`,
      );
    }

    // readHostSubjects sees the one book the list advertises; the overlay must
    // not print a book title the page never names.
    const hosts = await readHostSubjects(page);
    expect(hosts.length, 'the fixture names exactly one subject beside the reviews').toBe(1);
    const renderedSubjects = (await texts(page, `${BR_CARD} .umm-reviews-subject a`)).filter(
      (t) => t.length > 0,
    );
    expect(renderedSubjects, 'non-empty subject labels === host subjects').toEqual(
      hosts.map((h) => normalize(h.title)),
    );

    // The fixture ships a promo `.tlst` with no review id: it may not become a card.
    expect(
      await page.evaluate(() => document.body.textContent?.includes('推广位') ?? false),
      'fixture keeps its promo block',
    ).toBe(true);
    const cardTexts = await cards.allInnerTexts();
    expect(
      cardTexts.some((t) => t.includes('推广位')),
      'promo reached the overlay',
    ).toBe(false);

    await clickOpens(
      page,
      extContext,
      page.locator(BR_TITLE).first(),
      resolve(BR_URL, hostReviews[0]?.href ?? ''),
      BR_URL,
    );
  });
});

// ==================== review-detail (movie) / book-review-detail ====================

/**
 * Shared provenance body: both review-detail pages mount the same template, so
 * the same host-derived claims apply — title verbatim, paragraphs verbatim and
 * in order, stats numbers the page printed, one subject link to the id the
 * page advertises, and every meta word off the page's own sidebar.
 */
async function assertReviewDetailProvenance(
  extContext: BrowserContext,
  rule: DoubanFixtureRule,
  url: string,
  extPage: Page,
): Promise<Page> {
  // X109：meta 行的标签（导演/主演/N页）已入词典 ⇒ 「每个 token 都来自宿主侧栏」
  // 这条契约只有在 zh-CN 下才成立（宿主是中文页），故先钉语言。
  await setStoredLanguage(extPage, 'zh-CN');
  const page = await openFixture(extContext, rule, url);
  const host = await page.evaluate(() => {
    const text = (el: Element | null | undefined) =>
      (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      title: text(document.querySelector('span[property="v:summary"]')),
      subjectText: text(document.querySelector('.subject-title a')),
      paragraphs: Array.from(document.querySelectorAll('.review-content p'))
        .map((p) => text(p))
        .filter((t) => t.length > 0),
      infoText: Array.from(document.querySelectorAll('.subject-info .info-item'))
        .map((el) => text(el))
        .join(' | '),
      numbers: Array.from(
        document.querySelectorAll('.main-author .pl, .useful_count .count, .useless_count .count'),
      ).map((el) => text(el)),
    };
  });
  expect(host.title, 'fixture names the review').not.toBe('');
  expect(host.paragraphs.length, 'fixture holds non-empty paragraphs').toBeGreaterThanOrEqual(2);

  const title = page.locator(`${OVERLAY} .umm-rd-title`);
  await expect(title).toHaveCount(1, { timeout: 60_000 });
  await expect(title).toHaveText(host.title);

  const paragraphs = page.locator(`${OVERLAY} .umm-rd-article p`);
  await expect(paragraphs).toHaveCount(host.paragraphs.length);
  expect((await paragraphs.allInnerTexts()).map(squash), 'paragraphs === host').toEqual(
    host.paragraphs,
  );

  // Every number the overlay prints is a number the page printed.
  const stats = await page.locator(`${OVERLAY} .umm-rd-stats`).innerText();
  for (const n of host.numbers) {
    const value = /(\d[\d,]*)/.exec(n)?.[1];
    if (value) expect(stats, `stats bar lost host number ${value}`).toContain(value);
  }

  const hosts = await readHostSubjects(page);
  expect(hosts.length, 'the review page advertises exactly one subject').toBe(1);
  const link = page.locator(`${OVERLAY} .umm-rd-subject-title a`);
  await expect(link).toHaveCount(1);
  expect(subjectIdOf(await link.getAttribute('href')), 'card → host subject').toBe(
    hosts[0]?.id ?? '',
  );
  const renderedSubject = normalize(await link.innerText());
  expect(renderedSubject.length, 'the subject card is labelled').toBeGreaterThan(1);
  expect(squash(host.subjectText), 'invented subject title').toContain(renderedSubject);

  // Which keys the card prints is a UI choice, so the traceable claim is that
  // every word of each meta line came off the page's own sidebar.
  const meta = (await page.locator(`${OVERLAY} .umm-rd-subj-item`).allInnerTexts()).map(squash);
  expect(meta.length, 'the card carries subject meta').toBeGreaterThanOrEqual(3);
  for (const line of meta) {
    for (const token of line.replace(/页$/, '').split(' ')) {
      if (token.length < 2) continue;
      expect(host.infoText, `meta token absent: ${token}`).toContain(token);
    }
  }
  return page;
}

const RD_URL = 'https://movie.douban.com/review/26732313/';
const RD_RULE: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/review/',
  fixture: 'review-detail',
};

test.describe('douban review-detail overlay (fixture)', () => {
  test('title, body, stats and subject card trace to the page; card click navigates', async ({
    extContext,
    extPage,
  }) => {
    const page = await assertReviewDetailProvenance(extContext, RD_RULE, RD_URL, extPage);
    const expected = await asideSubjectUrl(page, RD_URL);
    await clickOpens(
      page,
      extContext,
      page.locator(`${OVERLAY} .umm-rd-subject-title a`),
      expected,
      RD_URL,
    );
  });
});

const BRD_URL = 'https://book.douban.com/review/15432198/';
const BRD_RULE: DoubanFixtureRule = {
  host: 'book.douban.com',
  match: '/review/',
  fixture: 'book-review-detail',
};

test.describe('douban book-review-detail overlay (fixture)', () => {
  test('book meta traces to the aside and the host names the subject by title', async ({
    extContext,
    extPage,
  }) => {
    const page = await assertReviewDetailProvenance(extContext, BRD_RULE, BRD_URL, extPage);
    // Unlike the movie fixture (an inline body link re-uses the same id with a
    // person's name), this page's single host pair is unambiguous by title too.
    const hosts = await readHostSubjects(page);
    const link = page.locator(`${OVERLAY} .umm-rd-subject-title a`);
    expect(normalize(await link.innerText()), 'subject title === host title').toBe(
      normalize(hosts[0]?.title ?? ''),
    );
    await clickOpens(page, extContext, link, await asideSubjectUrl(page, BRD_URL), BRD_URL);
  });
});

// ==================== series ====================

const SERIES_URL = 'https://book.douban.com/series/16390/';
const SERIES_RULE: DoubanFixtureRule = {
  host: 'book.douban.com',
  match: '/series/16390',
  fixture: 'series-list',
};
const SERIES_ITEM = `${OVERLAY} .umm-series-item`;
const SERIES_TITLE = `${SERIES_ITEM} .umm-series-item-title`;

/**
 * A list row is a book only while its cover anchor carries a numbered subject
 * id — the fixture ships a cover-less row and a `/subject/` row without digits,
 * and both must stay out of the overlay.
 */
async function hostSeriesItems(page: Page): Promise<HostEntry[]> {
  return page.evaluate(() => {
    const out: HostEntry[] = [];
    for (const li of Array.from(document.querySelectorAll('ul.subject-list li.subject-item'))) {
      const href = li.querySelector('.pic a.nbg[href]')?.getAttribute('href') ?? '';
      const id = /\/subject\/(\d+)/.exec(href)?.[1];
      if (!id) continue;
      out.push({ id, href, title: (li.querySelector('.info h2 a')?.textContent ?? '').trim() });
    }
    return out;
  });
}

test.describe('douban series overlay (fixture)', () => {
  test('renders the cover-linked volumes verbatim and clicking a title opens it', async ({
    extContext,
  }) => {
    const page = await openFixture(extContext, SERIES_RULE, SERIES_URL);
    const items = await hostSeriesItems(page);
    expect(items.length, 'fixture holds cover-linked volumes').toBeGreaterThanOrEqual(3);
    const headTitle = await page.evaluate(() =>
      (document.querySelector('h1')?.textContent ?? '').trim(),
    );
    expect(headTitle, 'fixture names the series').not.toBe('');

    const cards = page.locator(SERIES_ITEM);
    await expect(cards).toHaveCount(items.length, { timeout: 60_000 });
    await expect(page.locator(`${OVERLAY} .umm-series-title`)).toHaveText(headTitle);

    const titles = await texts(page, SERIES_TITLE);
    const links = await hrefsOf(page.locator(SERIES_TITLE));
    expect(
      links
        .map((h) => subjectIdOf(h))
        .sort()
        .join(','),
      'rendered ids === host ids',
    ).toBe(
      items
        .map((i) => i.id)
        .sort()
        .join(','),
    );
    for (const [i, entry] of items.entries()) {
      expect(titles[i], 'card order follows the host list').toBe(normalize(entry.title));
      expect(links[i], 'card links the subject its own title names').toBe(
        resolve(SERIES_URL, entry.href),
      );
    }

    // readHostSubjects is cover-blind: it also counts the cover-less row.
    const hosts = await readHostSubjects(page);
    expect(hosts.length, 'host advertises one row the overlay must skip').toBe(items.length + 1);
    const skipped = hosts.find((h) => !items.some((i) => i.id === h.id));
    expect(skipped, 'the cover-less row is the extra host id').toBeDefined();
    expect(titles, 'skipped row stays out').not.toContain(normalize(skipped?.title ?? ''));

    await clickOpens(
      page,
      extContext,
      page.locator(SERIES_TITLE).first(),
      resolve(SERIES_URL, items[0]?.href ?? ''),
      SERIES_URL,
    );
  });

  test('an external write marks one volume and a delete unmarks it, without reload', async ({
    extContext,
    extPage,
  }) => {
    const page = await openFixture(extContext, SERIES_RULE, SERIES_URL);
    const cards = page.locator(SERIES_ITEM);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });
    const title = normalize(await cards.first().locator('.umm-series-item-title').innerText());
    const id = uniqueHostId(await readHostSubjects(page), title);
    expect(id, `ambiguous or missing host pair for ${title}`).toBeDefined();
    // src/scenario/douban/pages/series/App.vue seeds useRecordCache('book', …),
    // so `book::<id>` is the only key this overlay can read back.
    const key = `book::${id}`;

    const del = await sendRuntimeMessage(extPage, 'DB_DELETE', { storeName: DOUBAN_STORE, key });
    expect(del.success).toBe(true);
    await expect(page.locator(`${OVERLAY} .umm-series-status`)).toHaveCount(0, { timeout: 30_000 });

    const put = await sendRuntimeMessage(extPage, 'DB_PUT', {
      storeName: DOUBAN_STORE,
      key,
      record: makeStoreRecord(`https://book.douban.com/subject/${id}/`, 1, 0),
    });
    expect(put.success).toBe(true);
    // Exactly the written volume, with the status-1 modifier — a prefix or id
    // mix-up would light a second card or the wrong modifier.
    await expect(page.locator(`${OVERLAY} .umm-series-status--wish`)).toHaveCount(1, {
      timeout: 30_000,
    });
    await expect(page.locator(`${OVERLAY} .umm-series-status--done`)).toHaveCount(0);
    await expect(cards.first().locator('.umm-series-status--wish')).toHaveCount(1);
    await expect(cards.nth(1).locator('.umm-series-status')).toHaveCount(0);

    const del2 = await sendRuntimeMessage(extPage, 'DB_DELETE', { storeName: DOUBAN_STORE, key });
    expect(del2.success).toBe(true);
    await expect(page.locator(`${OVERLAY} .umm-series-status`)).toHaveCount(0, { timeout: 30_000 });
    expect(page.url(), 'no reload happened between write and mark').toBe(SERIES_URL);
  });
});
