/**
 * X78 — Douban VIDEO (`https://movie.douban.com/video/<id>`) in a real browser
 * with the real built extension. This is the OTHER page type no e2e ever opened:
 * `video` is a `PageType` with NO page dir and NO mount key — `main.ts:131-132`
 * redirects it to the trailer mount:
 *
 *     const pageKey = pageType.type === 'video' ? 'trailer' : pageType.type;
 *     const mountFn = registry.getMountFn(pageKey);   // getMountFn('video') ⇒ undefined
 *
 * Because `PAGE_MOUNTS` has no `video` key, the ONLY way a `/video/` URL produces
 * any overlay app is that redirect executing at runtime. Remove it and
 * `getMountFn('video')` returns undefined → `if (mountFn)` skips → the
 * document_start shell stays in its loading state forever. So "a mounted trailer
 * app renders on a /video/ URL" is a direct proof of main.ts:131-132.
 *
 * CONTRACT PINNED (stated as the brief demands):
 *   a `/video/<id>` URL still mounts the trailer overlay shell (`#umm-trailer-
 *   overlay`, shadow root + shadow `<style>`) AND the trailer app's OWN content,
 *   because `pages/trailer/config.ts` extracts the same playlist DOM a real
 *   /video/ detail page carries (`#video-list ul.video-list-col`, reused here
 *   byte-for-byte from `tests/fixtures/douban/trailer-detail.html`, whose header
 *   documents "also reused at /video/{id}/").
 *
 * The extractor's detail branch derives the card TYPE from `location.pathname`
 * (`startsWith('/video/') ? 'video_review' : 'trailer'`), so the /video/ URL must
 * render 视频评论 while the byte-identical /trailer/ URL renders 预告片 — a
 * URL-derived value the code-under-test does not hardcode. Expected titles/header
 * are read off the host DOM (`#content h1`, `#video-list … strong`), never from
 * `trailer-data.ts`.
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

const VIDEO_URL = 'https://movie.douban.com/video/130123/';
const TRAILER_URL = 'https://movie.douban.com/trailer/130123/';

const videoRule = (transform?: (html: string) => string): DoubanFixtureRule => ({
  host: 'movie.douban.com',
  match: '/video/',
  fixture: 'trailer-detail',
  ...(transform ? { transform } : {}),
});
const trailerRule: DoubanFixtureRule = {
  host: 'movie.douban.com',
  match: '/trailer/',
  fixture: 'trailer-detail',
};

/** The playlist rows the extractor treats as items: an `li` with an `a.pr-video`. */
interface HostClip {
  name: string;
  hasLink: boolean;
}
function readHostPlaylist(page: Page): Promise<HostClip[]> {
  return page.evaluate(() => {
    const out: HostClip[] = [];
    for (const li of Array.from(document.querySelectorAll('#video-list ul.video-list-col li'))) {
      const link = li.querySelector('a.pr-video');
      const strong = li.querySelector('strong');
      out.push({ hasLink: !!link, name: (strong?.textContent ?? '').trim() });
    }
    return out;
  });
}

/**
 * Install routes, navigate, prove the document came from the fixture, and prove
 * nothing but asset requests fell through (a typo'd document rule would leave the
 * `/video/…` pathname itself unmatched). Wait for either the mounted shell style
 * (success) or the mount-failure affordance (control), per `mode`.
 */
async function open(
  extContext: BrowserContext,
  rules: DoubanFixtureRule[],
  url: string,
  mode: 'mounted' | 'failed',
): Promise<{ page: Page; routes: DoubanFixtureRoutes }> {
  const routes = await installDoubanFixtureRoutes(extContext, rules);
  const page = await extContext.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  for (const rule of rules) {
    expect(routes.served(), `fixture "${rule.fixture}" answered the document`).toContain(
      rule.fixture,
    );
  }
  const strays = routes.unmatched().filter((p) => !ASSET_RE.test(p));
  expect(strays, `only asset requests may fall through on ${url}`).toEqual([]);

  if (mode === 'mounted') {
    await page.waitForFunction(
      (id) => !!document.getElementById(id)?.shadowRoot?.querySelector('style'),
      SHELL_ID,
      { timeout: 30_000 },
    );
  } else {
    await page.waitForFunction(() => !!document.getElementById('umm-mount-failure'), undefined, {
      timeout: 30_000,
    });
  }
  return { page, routes };
}

test.describe('douban /video/ URL mounts the trailer overlay (main.ts alias)', () => {
  test('the alias renders real trailer-app content, not a stuck loading shell', async ({
    extContext,
  }) => {
    const { page } = await open(extContext, [videoRule()], VIDEO_URL, 'mounted');

    // Failure affordance (light-DOM, mount-failure.ts) must be absent: the mount
    // completed. It is what shows when extractTrailerData returns null.
    await expect(page.locator('#umm-mount-failure')).toHaveCount(0);
    await expect(page.locator(OVERLAY)).toHaveCount(1);

    // A /video/ URL is a detail page: `isDetail()` true → detail variant rendered.
    await expect(page.locator(`${OVERLAY} .umm-trailer-root--detail`).first()).toBeVisible({
      timeout: 60_000,
    });
    // If the alias were gone, the app never mounts and the spinner would remain.
    await expect(page.locator(`${OVERLAY} .ov-loading`)).toHaveCount(0);

    // Header title is the host h1 text, not a recomputed string.
    const hostTitle = (await page.locator('#content h1').innerText()).replace(/\s+/g, ' ').trim();
    await expect(page.locator(`${OVERLAY} .umm-trailer-title`).first()).toHaveText(hostTitle);
  });

  test('playlist cards pair to the host playlist and the /video/ URL sets the type label', async ({
    extContext,
    extPage,
  }) => {
    // X108：类型标签（预告片/视频评论）已入词典，渲染语言取决于设置——本组按中文
    // 断言「URL 决定标签」这条契约，故先钉 zh-CN（同 book-home-live-refresh 的处置）。
    await setStoredLanguage(extPage, 'zh-CN');
    const { page } = await open(extContext, [videoRule()], VIDEO_URL, 'mounted');
    const cards = page.locator(`${OVERLAY} .umm-trailer-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });

    const hosts = await readHostPlaylist(page);
    const linked = hosts.filter((h) => h.hasLink && h.name);
    // The fixture carries a dead `li` (no a.pr-video) the extractor must skip, so
    // the host playlist is larger than the rendered set — a leak or a drop fails.
    expect(hosts.length, 'host playlist has a non-link row to skip').toBeGreaterThan(linked.length);
    expect(linked.length, 'host playlist has link-bearing rows').toBeGreaterThanOrEqual(2);

    await expect(cards, 'rendered clips === host link-bearing playlist rows').toHaveCount(
      linked.length,
    );
    const renderedNames = (await cards.locator('.umm-trailer-name').allInnerTexts()).map((t) =>
      t.replace(/\s+/g, ' ').trim(),
    );
    for (const clip of linked) {
      const name = clip.name.replace(/\s+/g, ' ').trim();
      expect(
        renderedNames.includes(name),
        `host clip ${JSON.stringify(name)} absent from overlay: ${renderedNames.join(' | ')}`,
      ).toBe(true);
    }

    // The whole point of the /video/ alias: the card type is derived from the
    // pathname (`startsWith('/video/') → 'video_review' → 视频评论`).
    const typeLabels = await cards.locator('.umm-trailer-type').allInnerTexts();
    for (const label of typeLabels) {
      // X108 复审：期望按 zh-CN 词典取（原先字面量在「回退硬编码」时仍全绿）。
      expect(label.trim(), 'a /video/ page labels its clips as 视频评论').toBe(
        locales['zh-CN']['douban.video_review'],
      );
    }
    expect(typeLabels.length).toBe(linked.length);
  });

  // ── reverse-verification 1: URL is what flips the label (same bytes) ─────
  // Serve the byte-identical fixture at a /trailer/ URL. The extractor's detail
  // branch runs, but `startsWith('/video/')` is now false → every label becomes
  // 预告片. Proves the 视频评论 assertion above tracks location.pathname (the
  // alias target) and is not a hardcoded overlay string.
  test('REVERSE: identical bytes at /trailer/ label as 预告片 (the label is URL-derived)', async ({
    extContext,
    extPage,
  }) => {
    // 同上：契约是「/trailer/ 路径 → 预告片」，先钉 zh-CN 再断具体串。
    await setStoredLanguage(extPage, 'zh-CN');
    const { page } = await open(extContext, [trailerRule], TRAILER_URL, 'mounted');
    const cards = page.locator(`${OVERLAY} .umm-trailer-card`);
    await expect(cards.first()).toBeVisible({ timeout: 60_000 });

    const typeLabels = await cards.locator('.umm-trailer-type').allInnerTexts();
    expect(typeLabels.length, 'the trailer listing rendered clips').toBeGreaterThanOrEqual(2);
    for (const label of typeLabels) {
      expect(label.trim(), 'a /trailer/ page labels its clips as 预告片').toBe(
        locales['zh-CN']['douban.trailer_word'],
      );
    }
    // And the video URL is NOT what we are on — the 视频评论 label must be absent.
    await expect(cards.filter({ hasText: locales['zh-CN']['douban.video_review']! })).toHaveCount(
      0,
    );
  });

  // ── reverse-verification 2: the mount actually attempted the extractor ───
  // Strip every `a.pr-video` from the served fixture. extractTrailerData's detail
  // branch now finds no items → returns null → config throws → the light-DOM
  // `#umm-mount-failure` appears AND no trailer app content ever renders.
  //
  // This is the opposite-signed proof that the trailer mount RAN on /video/: only
  // main.ts's `pageKey = 'video' ? 'trailer'` redirect reaches `mountTrailer`, and
  // a mount that was never attempted would leave the spinner up WITHOUT a failure
  // panel (the panel is emitted from `mountUmmOverlay`'s catch). So "failure panel
  // present on /video/" can only mean the alias executed the trailer extractor.
  //
  // NOTE: the `#umm-trailer-overlay` DOM element is deliberately NOT asserted away.
  // `removeOverlayShell` keys a module-local `shells` Map that the document_start
  // (early) content script populated; the document_idle (main) script is a separate
  // content-script instance whose Map never saw that id, so it cannot find/remove
  // the element. Asserting teardown here would pin harness internals, not the alias.
  test('REVERSE: a /video/ page whose playlist is empty throws → failure panel, no app', async ({
    extContext,
  }) => {
    const stripped = (html: string): string => {
      const next = html.replace(/class="pr-video"/g, 'class="pr-video-removed"');
      if (next.includes('class="pr-video"')) {
        throw new Error('[e2e] pr-video strip transform did not land');
      }
      return next;
    };
    const { page } = await open(extContext, [videoRule(stripped)], VIDEO_URL, 'failed');

    // The trailer extractor ran and threw → the mount-failure affordance is up.
    await expect(page.locator('#umm-mount-failure')).toBeVisible();
    // And the failed mount took the wall with it: since the shell record travels
    // on the shell element (cross-bundle rollback), the opaque loading shell and
    // its body scroll lock are undone rather than stranded. Asserting the shell
    // itself is gone is strictly stronger than asserting "no app content inside
    // it", which a stranded wall would also satisfy vacuously.
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    // Contrast case kept explicit: a stuck spinner with no panel is the OLD
    // failure signature; neither half of it is acceptable now.
    await expect(page.locator(`${OVERLAY} .ov-loading`)).toHaveCount(0);
  });
});
