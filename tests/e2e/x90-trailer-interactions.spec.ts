/**
 * X90 — the trailer/video overlay's own interaction hooks, driven in a real
 * browser with the real built extension.
 *
 * WHY: `pages/trailer/App.vue` carries 3 `@click` bindings and 1 `@error`
 * binding, and the interaction matrix measured them as **0 driven operations**
 * for the `video` page type (ADR-026 需求 8 / X83). Every earlier spec only
 * proved the overlay *rendered*. Un-clicked bindings are where the class of bug
 * this spec now pins lives: a handler whose DOM lookup silently finds nothing.
 *
 * Expectations come from the host DOM, never from `App.vue`:
 *  - clip target  ← each playlist row's resolved `a.pr-video` href
 *  - button text  ← the injected `.aside .links a` label text
 *  - button target← the injected `.aside .links a` hrefs
 * Each positive case is paired with the shape that must NOT navigate, so a
 * hardcoded URL could not pass (see the REVERSE test).
 */

import type { BrowserContext, Page } from '@playwright/test';
import locales from '@/entrypoints/content/i18n/locales';
import { expect, setStoredLanguage, test } from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  type DoubanFixtureRule,
  type DoubanFixtureRoutes,
} from './fixtures/douban-crawl-fixtures';

const OVERLAY = '#umm-trailer-overlay';
const SHELL_ID = 'umm-trailer-overlay';
const ASSET_RE = /\.(jpe?g|png|gif|webp|svg|css|js|ico|woff2?)(\?|$)/i;

/** 1×1 fully TRANSPARENT RGBA PNG, built byte-by-byte (header + IHDR + IDAT +
 *  IEND, CRC-correct) and verified: filter 0, pixel (0,0,0,0). Transparent is the
 *  stronger fixture — behind an opaque image you cannot tell "the placeholder was
 *  retired" from "the placeholder is merely covered". */
const PNG_1PX_ALPHA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

const VIDEO_URL = 'https://movie.douban.com/video/130123/';
const TRAILER_LIST_URL = 'https://movie.douban.com/subject/1292052/trailer';

/** Real Douban puts the "去 本片全部视频的页面" pair in `.aside .links`; the crawl
 *  of the detail fixture has no aside at all. `App.vue:100/116/124` reads exactly
 *  that selector, so the two nav buttons need a host to read from. The deviation
 *  is visible here rather than baked into the shared fixture. */
const ASIDE_MARKUP = `
  <div class="aside">
    <div class="links">
      <a href="/trailer/130123/">&gt; 去 本片全部视频的页面</a>
      <a href="https://movie.douban.com/subject/1292052/">&gt; 去 肖申克的救赎 的页面</a>
    </div>
  </div>
`;

function withAside(html: string): string {
  const next = html.replace('</body>', `${ASIDE_MARKUP}</body>`);
  if (!next.includes('class="aside"')) {
    throw new Error('[e2e] aside-links transform did not land');
  }
  return next;
}

const videoRule = (transform?: (html: string) => string): DoubanFixtureRule => ({
  host: 'movie.douban.com',
  match: '/video/',
  fixture: 'trailer-detail',
  ...(transform ? { transform } : {}),
});

/**
 * Install routes, navigate, prove the document came from the fixture, and wait
 * for the mounted detail variant.
 *
 * `beforeNavigate` runs after `installDoubanFixtureRoutes` and before `goto`,
 * which is the only slot where an extra route can beat the harness's
 * `*://*.doubanio.com/**` stub: Playwright resolves overlapping routes LIFO, so
 * registering one earlier loses to it.
 */
async function open(
  extContext: BrowserContext,
  rules: DoubanFixtureRule[],
  beforeNavigate?: () => Promise<unknown>,
): Promise<{ page: Page; routes: DoubanFixtureRoutes }> {
  const routes = await installDoubanFixtureRoutes(extContext, rules);
  if (beforeNavigate) await beforeNavigate();
  const page = await extContext.newPage();
  await page.goto(VIDEO_URL, { waitUntil: 'domcontentloaded' });
  for (const rule of rules) {
    expect(routes.served(), `fixture "${rule.fixture}" answered the document`).toContain(
      rule.fixture,
    );
  }
  const strays = routes.unmatched().filter((p) => !ASSET_RE.test(p));
  expect(strays, `only asset requests may fall through on ${VIDEO_URL}`).toEqual([]);
  await page.waitForFunction(
    (id) => !!document.getElementById(id)?.shadowRoot?.querySelector('style'),
    SHELL_ID,
    { timeout: 30_000 },
  );
  await expect(page.locator(`${OVERLAY} .umm-trailer-root--detail`).first()).toBeVisible({
    timeout: 60_000,
  });
  return { page, routes };
}

/**
 * What a click opened, or null when the click opened nothing. `window.open` from
 * a content-script handler is synchronous inside the click, so a bounded poll
 * reads as "no popup" instead of "we did not wait long enough".
 */
async function openedUrl(
  extContext: BrowserContext,
  page: Page,
  click: () => Promise<void>,
  budgetMs = 4_000,
): Promise<string | null> {
  const known = new Set(extContext.pages());
  await click();
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const fresh = extContext.pages().find((p) => !known.has(p) && p.url() !== 'about:blank');
    if (fresh) {
      const url = fresh.url();
      await fresh.close();
      return url;
    }
    await page.waitForTimeout(50);
  }
  // A popup that opened at about:blank and never committed is still a click
  // result; drop it so the next assertion starts from a clean page set.
  for (const p of extContext.pages()) {
    if (!known.has(p) && p.url() === 'about:blank') await p.close();
  }
  return null;
}

interface HostClip {
  /** Browser-resolved absolute href — the target the card must open. */
  href: string;
  /** Raw attribute value, to prove the relative→absolute path is exercised. */
  raw: string;
  name: string;
}

function readHostPlaylist(page: Page): Promise<HostClip[]> {
  return page.evaluate(() => {
    const out: HostClip[] = [];
    for (const li of Array.from(document.querySelectorAll('#video-list ul.video-list-col li'))) {
      const link = li.querySelector<HTMLAnchorElement>('a.pr-video');
      const strong = li.querySelector('strong');
      if (!link) continue;
      out.push({
        href: link.href,
        raw: link.getAttribute('href') ?? '',
        name: (strong?.textContent ?? '').trim(),
      });
    }
    return out;
  });
}

test.describe('douban /video/ overlay 交互钩子（X83 缺口：video 页型 0 次真实操作）', () => {
  test('卡片点击打开宿主为该行列出的片段链接', async ({ extContext }) => {
    const { page } = await open(extContext, [videoRule()]);
    const cards = page.locator(`${OVERLAY} .umm-trailer-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });

    const hosts = await readHostPlaylist(page);
    expect(hosts.length, 'host playlist has link-bearing rows').toBeGreaterThanOrEqual(2);
    // The fixture pairs a relative href with an absolute one on purpose: if every
    // expectation were already absolute, the extractor's prefixing rule would be
    // untested and a card that opened the raw attribute would still pass.
    expect(
      hosts.some((h) => !h.raw.startsWith('http')),
      'fixture lost its relative-href playlist row',
    ).toBe(true);
    await expect(cards, 'rendered clips === host link-bearing playlist rows').toHaveCount(
      hosts.length,
    );

    for (let i = 0; i < hosts.length; i++) {
      const host = hosts[i]!;
      const opened = await openedUrl(extContext, page, () => cards.nth(i)!.click());
      expect(
        opened,
        `card ${i} (${JSON.stringify(host.name)}) 点击后没有打开任何标签`,
      ).not.toBeNull();
      expect(opened, `card ${i} 打开了错误的目标`).toBe(host.href);
    }
  });

  test('详情区两个按钮跳宿主 aside 链接，按钮文案取宿主链接文字', async ({ extContext }) => {
    const { page } = await open(extContext, [videoRule(withAside)]);

    const aside = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.aside .links a')).map(
        (a) => ({ href: a.href, text: a.textContent ?? '' }),
      );
      return links;
    });
    expect(aside.length, 'injected aside lost its two links').toBe(2);

    const primary = page.locator(`${OVERLAY} .umm-detail-btn`).first();
    const secondary = page.locator(`${OVERLAY} .umm-detail-btn--secondary`).first();
    await expect(primary).toBeVisible({ timeout: 60_000 });

    // Host label text with the host's own leading "> " stripped (`App.vue:102`);
    // the template re-adds exactly one "&gt; ", so the rendered label must be
    // "> <host text minus its marker>". Without the strip it doubles to "> > …".
    const strip = (t: string): string => t.replace(/\s+/g, ' ').replace(/^>\s*/, '').trim();
    await expect(primary).toHaveText(`> ${strip(aside[0]!.text)}`);
    await expect(secondary).toHaveText(`> ${strip(aside[1]!.text)}`);

    const openedListing = await openedUrl(extContext, page, () => primary.click());
    expect(openedListing, '「去全部视频页面」按钮没有打开标签').toBe(aside[0]!.href);
    const openedSubject = await openedUrl(extContext, page, () => secondary.click());
    expect(openedSubject, '「去条目页面」按钮没有打开标签').toBe(aside[1]!.href);
  });

  // ── reverse-verification: the two button targets are READ, not baked ─────
  // Same page, no `.aside` at all. If the handlers carried a default URL, or if
  // the labels alone were decorative, a click would still navigate here. It must
  // not: with no host link to read, the correct behaviour is to do nothing.
  test('REVERSE: 宿主没有 .aside .links 时按钮不跳转（目标确实读自宿主）', async ({
    extContext,
    extPage,
  }) => {
    // X108：兜底文案已入词典 ⇒ 先钉 zh-CN 再断原串（本例如 x78 同款处置；
    // 语言覆盖由 x108 双挂载 spec 承担）。
    await setStoredLanguage(extPage, 'zh-CN');
    const { page } = await open(extContext, [videoRule()]);
    await expect(page.locator('.aside .links a')).toHaveCount(0);

    const primary = page.locator(`${OVERLAY} .umm-detail-btn`).first();
    const secondary = page.locator(`${OVERLAY} .umm-detail-btn--secondary`).first();
    await expect(primary).toBeVisible({ timeout: 60_000 });

    // The fallback labels prove the code path ran (nativeLinks[0] was undefined),
    // i.e. this is "nothing to navigate to", not "the buttons never mounted".
    const subjectTitle = await page
      .locator('#content h1 a')
      .first()
      .innerText()
      .then((t) => t.replace(/\s+/g, ' ').trim());
    expect(subjectTitle, 'fixture lost its h1 subject link').not.toBe('');
    // X108 复审：期望按 zh-CN 词典取（兜底串已词典化，字面量会失去判据牙）。
    const L = locales['zh-CN'];
    await expect(primary).toHaveText(`> ${L['douban.trailer.go_all']}`);
    await expect(secondary).toHaveText(
      `> ${L['douban.trailer.go_subject']!.replace('{{title}}', subjectTitle)}`,
    );

    expect(await openedUrl(extContext, page, () => primary.click())).toBeNull();
    expect(await openedUrl(extContext, page, () => secondary.click())).toBeNull();
  });

  // ── the cover contract: a dead thumbnail URL swaps in the placeholder ─────
  // Every doubanio image request is fulfilled as an empty text/plain body, so
  // each thumbnail here is a URL that is PRESENT BUT DEAD — the exact case a
  // real page hits when the CDN 404s. `App.vue` hides the failed `<img>` and
  // then reveals `img.nextElementSibling`, which is only the play-icon
  // placeholder if the placeholder is rendered alongside a thumbnail. If it is
  // `v-else`, nothing is revealed and the cover goes blank.
  test('缩略图加载失败的卡片显示占位图标，封面不留空白', async ({ extContext }) => {
    const { page } = await open(extContext, [videoRule()]);
    const covers = page.locator(`${OVERLAY} .umm-trailer-cover`);
    await expect(covers.first()).toBeVisible({ timeout: 60_000 });
    const count = await covers.count();
    expect(count, 'fixture playlist produced covers to check').toBeGreaterThanOrEqual(2);
    // Structural premise (not a wait): the placeholder must exist per cover.
    // Since the fix it is unconditional, so counting it can never observe the
    // decode failure — the retried visibility assertions below do that.
    await expect
      .poll(() => page.locator(`${OVERLAY} .umm-trailer-cover-fallback`).count(), {
        message: '每张封面都应有一个占位图标可显示',
        timeout: 5_000,
      })
      .toBe(count);

    for (let i = 0; i < count; i++) {
      const cover = covers.nth(i)!;
      const img = cover.locator('.umm-trailer-img');
      const placeholder = cover.locator('.umm-trailer-cover-fallback');
      // A dead `<img>` keeps a box unless the handler hides it, so "not visible"
      // is the observable proof that `@error` ran. It must be a RETRIED read:
      // decode failure is asynchronous, and a single `await img.isVisible()`
      // would race it (measured: the count poll above no longer waits for
      // anything, so it cannot serve as the settle barrier either).
      await expect(img, `cover ${i} 的失败缩略图没有让位`).not.toBeVisible({ timeout: 15_000 });
      await expect(placeholder, `cover ${i} 未显示占位图标`).toBeVisible();
      expect(await placeholder.locator('svg').count(), `cover ${i} 占位图标缺 svg`).toBe(1);
      const coverBox = await cover.boundingBox();
      const fbBox = await placeholder.boundingBox();
      expect(fbBox?.width ?? 0, `cover ${i} 占位图标未铺满封面`).toBeGreaterThan(
        (coverBox?.width ?? 0) * 0.9,
      );
    }

    // The badge is what the pre-fix handler flipped to `display:flex` instead of
    // the placeholder. `toBeVisible()` could never catch that (an absolutely
    // positioned pill is visible either way), so the assertion is on the inline
    // style the handler writes: the badge must carry none.
    const badge = covers.first().locator('.umm-trailer-duration');
    await expect(badge).toBeVisible();
    expect(
      await badge.evaluate((el) => el.getAttribute('style')),
      '时长角标被 @error 处理器写上了内联样式（说明占位图标不在图片旁边）',
    ).toBeNull();
    expect(await badge.innerText(), '时长角标文字应仍是宿主列出的时长').not.toBe('');
    expect(
      await page.locator(`${OVERLAY} .umm-trailer-card`).first().isVisible(),
      '封面故障不得让整张卡片消失',
    ).toBe(true);
  });

  // ── the other half of the same cover: a thumbnail that DOES load ─────────
  // Two phases on one page. A route that holds the PNG response open makes the
  // pre-load window observable (without it the layout claim below is a race):
  //   during load — both children fill the cover box, which only holds with
  //                 `.umm-trailer-img { position:absolute }`;
  //   after load  — the placeholder must be RETIRED, not merely covered. The
  //                 fixture is a fully transparent pixel, so "covered" and
  //                 "retired" are different DOM states here; an opaque image
  //                 could not tell them apart.
  test('缩略图成功加载：加载中两元素同框铺满，加载完成后占位图标退场', async ({ extContext }) => {
    const { page } = await open(extContext, [videoRule()], () =>
      extContext.route('**/img/trailer/small/p130123.jpg', async (route) => {
        await new Promise((r) => setTimeout(r, 2_500));
        await route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX_ALPHA });
      }),
    );

    const first = page.locator(`${OVERLAY} .umm-trailer-card`).nth(0)!;
    const img = first.locator('.umm-trailer-img');
    await expect(img).toBeVisible({ timeout: 60_000 });
    const naturalWidth = () => img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
    // Premise for everything below: the window was actually created. If the
    // response landed early, the "same box" check would pass for the wrong reason.
    expect(await naturalWidth(), 'PNG 提前解码，加载窗口没有造出来').toBe(0);

    const cover = first.locator('.umm-trailer-cover');
    const placeholder = cover.locator('.umm-trailer-cover-fallback');
    const coverBox = await cover.boundingBox();
    expect(coverBox?.width ?? 0, '封面自身没有盒子').toBeGreaterThan(0);
    for (const [name, box] of [
      ['图片', await img.boundingBox()],
      ['占位图标', await placeholder.boundingBox()],
    ] as const) {
      expect(
        box?.width ?? 0,
        `${name} 未铺满封面 —— 两个子元素并排了（.umm-trailer-img 需要 position:absolute）`,
      ).toBeGreaterThan((coverBox?.width ?? 0) * 0.9);
    }

    await img.scrollIntoViewIfNeeded();
    const topmost = await img.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const root = el.getRootNode() as ShadowRoot | Document;
      const hit = root.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === el ? 'img' : String(hit?.className || hit?.tagName || 'null');
    });
    expect(topmost, '成功加载的封面图必须盖在占位图标之上').toBe('img');

    // Phase 2: the held response lands. The placeholder must be retired, not
    // just covered — under a transparent image those two look different.
    await expect
      .poll(naturalWidth, { message: '延迟的 PNG 始终没有解码', timeout: 20_000 })
      .toBe(1);
    await expect(placeholder).not.toBeVisible({ timeout: 5_000 });

    // Same page, second card: still a dead URL, still must reveal its icon.
    const second = page.locator(`${OVERLAY} .umm-trailer-card`).nth(1)!;
    await expect(second.locator('.umm-trailer-img')).not.toBeVisible({ timeout: 15_000 });
    await expect(second.locator('.umm-trailer-cover-fallback svg')).toBeVisible();
  });

  // ── the LISTING variant shares the same cover template ───────────────────
  // `isDetail === false` renders `.umm-trailer-grid` instead of the detail
  // sidebar, but the cover block — and so the `position:absolute` change and the
  // placeholder contract — is the same markup. Every case above entered through
  // the detail branch; a grid-only layout regression would have passed unseen.
  test('列表变体（/subject/*/trailer）的封面同样遵守占位图标契约', async ({ extContext }) => {
    const routes = await installDoubanFixtureRoutes(extContext, [
      { host: 'movie.douban.com', match: '/subject/1292052/trailer', fixture: 'trailer-list' },
    ]);
    const page = await extContext.newPage();
    await page.goto(TRAILER_LIST_URL, { waitUntil: 'domcontentloaded' });
    expect(routes.served(), 'trailer-list fixture never answered').toContain('trailer-list');
    await page.waitForFunction(
      (id) => !!document.getElementById(id)?.shadowRoot?.querySelector('style'),
      SHELL_ID,
      { timeout: 30_000 },
    );

    // The listing branch must NOT be rendered as a detail page.
    await expect(page.locator(`${OVERLAY} .umm-trailer-grid`).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator(`${OVERLAY} .umm-trailer-root--detail`)).toHaveCount(0);

    const covers = page.locator(`${OVERLAY} .umm-trailer-cover`);
    const count = await covers.count();
    expect(count, 'listing fixture produced no covers').toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i++) {
      const cover = covers.nth(i)!;
      // Listing thumbnails are rewritten small→medium by the extractor, so the
      // URLs differ from the detail page's — all of them still dead stubs.
      await expect(cover.locator('.umm-trailer-img'), `列表封面 ${i} 未让位`).not.toBeVisible({
        timeout: 15_000,
      });
      const placeholder = cover.locator('.umm-trailer-cover-fallback');
      await expect(placeholder, `列表封面 ${i} 未显示占位图标`).toBeVisible();
      const coverBox = await cover.boundingBox();
      const fbBox = await placeholder.boundingBox();
      expect(fbBox?.width ?? 0, `列表封面 ${i} 占位图标未铺满`).toBeGreaterThan(
        (coverBox?.width ?? 0) * 0.9,
      );
    }
  });
});
