/**
 * X96 — the personage page's secondary links, driven in a real browser.
 *
 * `pages/personage/App.vue` carries nine interaction bindings. X41 drove two of
 * them (the biography and awards expand toggles); the other SEVEN are all
 * `openUrl(...)` navigations — photo thumbs, award name, award work, unreleased
 * work, partner card, and the two "更多影视作品" buttons — and none had ever been
 * clicked. That is the exact gap X83 named as "personage secondary links".
 *
 * Two claims per link, because one alone is weak:
 *  - the popup target equals the element's OWN `href` — so the click handler and
 *    the rendered link cannot drift apart;
 *  - that `href` is one of the URLs the HOST page actually lists — so the overlay
 *    cannot invent destinations.
 *
 * Plus a page-level one that only a real browser can show: every one of these is
 * an `<a href>` with `@click.prevent`, so the overlay tab itself must NOT
 * navigate. Drop the `.prevent` and the page is replaced by the target — a
 * failure mode no unit test of `openUrl` can see.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures/extension-harness';
import { openDoubanFixturePage } from './fixtures/douban-crawl-fixtures';

const PERSONAGE_URL = 'https://www.douban.com/personage/90000001/';
const OVERLAY = '#umm-personage-overlay';

async function openPersonage(ctx: BrowserContext): Promise<Page> {
  const page = await openDoubanFixturePage(
    ctx,
    { host: 'www.douban.com', match: '/personage/', fixture: 'personage' },
    PERSONAGE_URL,
    { shell: 'umm-personage-overlay' },
  );
  await expect(page.locator(`${OVERLAY} .umm-section`).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

/** Every absolute URL the host page itself links to. Three carriers, because
 *  Douban puts the photo-strip target in an inline `background-image` rather
 *  than in an `href`/`src`, and the overlay navigates to exactly that value.
 *  Returned as an array because a `Set` does not survive the evaluate
 *  boundary — it arrives de-serialized. */
async function hostUrls(page: Page): Promise<Set<string>> {
  const list = await page.evaluate(() => {
    const out = new Set<string>();
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      if (a.href) out.add(a.href);
    }
    for (const img of Array.from(document.querySelectorAll<HTMLImageElement>('img[src]'))) {
      if (img.src) out.add(img.src);
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[style]'))) {
      for (const m of (el.getAttribute('style') ?? '').matchAll(/url\(\s*['"]?([^'")\s]+)/g)) {
        const raw = m[1];
        if (raw) out.add(new URL(raw, location.href).href);
      }
    }
    return Array.from(out);
  });
  return new Set(list);
}

/** Scoped variant of {@link hostUrls}: the URLs the HOST offers *inside one
 *  section*. A document-wide set cannot catch an overlay that swaps two hrefs
 *  belonging to the same page, so each link kind is checked against the section
 *  it is rendered from. */
async function hostUrlsIn(page: Page, rootSelector: string): Promise<Set<string>> {
  const list = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const out = new Set<string>();
    if (!root) return Array.from(out);
    for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      if (a.href) out.add(a.href);
    }
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img[src]'))) {
      if (img.src) out.add(img.src);
    }
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[style]'))) {
      for (const m of (el.getAttribute('style') ?? '').matchAll(/url\(\s*['"]?([^'")\s]+)/g)) {
        const raw = m[1];
        if (raw) out.add(new URL(raw, location.href).href);
      }
    }
    return Array.from(out);
  }, rootSelector);
  return new Set(list);
}

function overlayLinks(page: Page, selector: string) {
  return page.locator(`${OVERLAY} ${selector}`);
}

async function clickAndCapture(
  ctx: BrowserContext,
  page: Page,
  target: ReturnType<Page['locator']>,
): Promise<{ opened: string[]; pageUrl: string }> {
  const known = new Set(ctx.pages());
  await target.click();
  const deadline = Date.now() + 4_000;
  let fresh = ctx.pages().filter((p) => !known.has(p));
  while (Date.now() < deadline && fresh.length === 0) {
    await new Promise((r) => setTimeout(r, 50));
    fresh = ctx.pages().filter((p) => !known.has(p));
  }
  const opened = fresh.map((p) => p.url());
  for (const p of fresh) await p.close();
  return { opened, pageUrl: page.url() };
}

test.describe('personage 次级链接（X83 缺口：9 个挂点里 7 个从未被点过）', () => {
  test('奖项名与奖项作品各开一个标签，目标等于自身 href 且来自奖项区宿主', async ({
    extContext,
  }) => {
    const page = await openPersonage(extContext);
    const host = await hostUrls(page);
    expect(host.size, '宿主页面没有任何可对照的链接').toBeGreaterThan(3);

    for (const cls of ['.umm-award-name', '.umm-award-work']) {
      const links = overlayLinks(page, cls);
      const count = await links.count();
      expect(count, `奖项区没有渲染 ${cls}`).toBeGreaterThan(0);
      for (let i = 0; i < Math.min(count, 2); i++) {
        const link = links.nth(i)!;
        const href = (await link.getAttribute('href')) ?? '';
        expect(href.length, `${cls}[${i}] 没有 href`).toBeGreaterThan(0);
        expect(host.has(href), `${cls}[${i}] 的 ${href} 不在宿主链接里`).toBe(true);

        const { opened, pageUrl } = await clickAndCapture(extContext, page, link);
        expect(opened.length, `点击 ${cls}[${i}] 没有开标签`).toBe(1);
        expect(opened[0], `${cls}[${i}] 开的不是自己的 href`).toBe(href);
        expect(pageUrl, `点击 ${cls}[${i}] 把本页导航走了（@click.prevent 失效）`).toBe(
          PERSONAGE_URL,
        );
      }
    }
  });

  test('未上映作品与合作人物同样只开自己的链接，本页不动', async ({ extContext }) => {
    const page = await openPersonage(extContext);
    const scoped = await Promise.all([
      hostUrlsIn(page, '#work-collections-sortby-time ul.unreleased'),
      hostUrlsIn(page, '#partners'),
    ]);

    for (const [k, cls] of ['.umm-unreleased-item', '.umm-partner-card'].entries()) {
      const host = scoped[k]!;
      const links = overlayLinks(page, cls);
      const count = await links.count();
      expect(count, `未渲染 ${cls}`).toBeGreaterThan(0);
      const hrefs = await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
      for (const href of hrefs) {
        expect(host.has(href), `${cls} 的 ${href} 不在宿主链接里`).toBe(true);
      }
      const { opened, pageUrl } = await clickAndCapture(extContext, page, links.first()!);
      expect(opened, `${cls} 点击后没有开标签`).toEqual([hrefs[0]]);
      expect(pageUrl, `${cls} 点击把本页导航走了`).toBe(PERSONAGE_URL);
    }
  });

  test('图片缩略图点击打开的是宿主那张图的地址', async ({ extContext }) => {
    const page = await openPersonage(extContext);
    const thumbs = overlayLinks(page, '.umm-photo-thumb');
    const count = await thumbs.count();
    expect(count, '图片条没渲染出来').toBeGreaterThan(0);

    const host = await hostUrlsIn(page, 'section.subject-picture');
    const { opened } = await clickAndCapture(extContext, page, thumbs.first()!);
    expect(opened.length, '点击缩略图没有开标签').toBe(1);
    expect(host.has(opened[0]!), `打开的 ${opened[0]} 不是宿主列出的图片地址`).toBe(true);
    // The strip paints from the same value it navigates to — pinning that pairing
    // is what makes "opened an image URL" more than a coincidence.
    const bg = await thumbs.first()!.evaluate((el) => (el as HTMLElement).style.backgroundImage);
    expect(bg, `背景图 ${bg} 与点击目标不一致`).toContain(opened[0]!);
  });

  test('两个「更多影视作品」按钮各跳所属区段自己的 more 链接', async ({ extContext }) => {
    const page = await openPersonage(extContext);
    // DOM order: [0] sits under 热门作品 (collect-sorted section), [1] under
    // 未上映作品 (time-sorted section). Each must carry its OWN section's host
    // link — the fixture really has two different `creations?sortby=…` anchors,
    // and until this wave both buttons were wired to the time one.
    const buttons = overlayLinks(page, '.umm-personage-btn');
    const count = await buttons.count();
    expect(count, '「更多影视作品」按钮未渲染（夹具可能没有 more 链接）').toBe(2);

    const hostMore = (sectionId: string) =>
      page.evaluate(
        (id) =>
          document.querySelector(`${id} a[href*="creations?sortby"]`)?.getAttribute('href') ?? '',
        sectionId,
      );
    const collectHref = await hostMore('#work-collections-sortby-collect');
    const timeHref = await hostMore('#work-collections-sortby-time');
    expect(collectHref, '夹具丢了热门作品的 more 链接').not.toBe('');
    expect(timeHref, '夹具丢了近期作品的 more 链接').not.toBe('');
    expect(
      new URL(collectHref, PERSONAGE_URL).href,
      '夹具的两条 more 链接相同，本例无法分辨',
    ).not.toBe(new URL(timeHref, PERSONAGE_URL).href);

    const expected = [
      new URL(collectHref, PERSONAGE_URL).href,
      new URL(timeHref, PERSONAGE_URL).href,
    ];
    for (let i = 0; i < count; i++) {
      const { opened, pageUrl } = await clickAndCapture(extContext, page, buttons.nth(i)!);
      expect(opened.length, `按钮 ${i} 没有开标签`).toBe(1);
      expect(opened[0], `按钮 ${i} 没有跳到所属区段自己的 more 链接`).toBe(expected[i]);
      expect(pageUrl, `按钮 ${i} 把本页导航走了`).toBe(PERSONAGE_URL);
    }
  });

  test('反向：宿主没有那条链接时，overlay 不得凭空造出目标', async ({ extContext }) => {
    // Same page, but strip the partner section from the served document. The
    // overlay must then show no partner cards at all — an overlay that kept
    // rendering them would be inventing URLs the host never offered.
    const page = await openDoubanFixturePage(
      extContext,
      {
        host: 'www.douban.com',
        match: '/personage/',
        fixture: 'personage',
        transform: (html) => {
          // `#partners` is a div holding `li.partners-mod-item` rows; dropping
          // the rows (not the wrapper) keeps the rest of the document intact.
          const next = html.replace(/<li class="partners-mod-item"[\s\S]*?<\/li>/g, '');
          if (next === html) throw new Error('[e2e] partner-row strip did not land');
          return next;
        },
      },
      PERSONAGE_URL,
      { shell: 'umm-personage-overlay' },
    );
    await expect(page.locator(`${OVERLAY} .umm-section`).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator(`${OVERLAY} .umm-partner-card`)).toHaveCount(0);
    // The rest of the page is unaffected: the strip removed one section, not the mount.
    await expect(page.locator(`${OVERLAY} .umm-award-item`).first()).toBeVisible();
  });
});
