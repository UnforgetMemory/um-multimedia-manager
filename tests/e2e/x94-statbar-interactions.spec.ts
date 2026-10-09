/**
 * X94 — `UmmStatBar`'s two interaction bindings (`@click`, `@keydown.enter`) on
 * the four profile pages that render it, in a real browser.
 *
 * The component shows counts that look actionable, and until this wave nothing
 * had ever been clicked on any of the four pages (X83 measured the stat bar at
 * 0 driven hooks). Two of the four cases are qualitatively different from the
 * other two, and the spec says so rather than pretending on one oracle fits all:
 *
 *  - movie-profile builds each item's URL from the host's own
 *    `#db-movie-mine h2 .pl a` href, so the expectation is the HOST HREF — a
 *    precise oracle read off the page.
 *  - book-profile / user-profile synthesize their URLs (a template around the
 *    userId, or a literal), so there is no host href to compare against. Those
 *    assert the invariants that can still be wrong: exactly one tab opens, it is
 *    a Douban origin, and it carries the SAME userId the host profile itself
 *    advertises — i.e. the bar must not send you to another user's list.
 *  - music-profile's extractor sets `url: ''` for every stat, and the crawled
 *    `.number-item` blocks genuinely contain no anchor. So the correct behaviour
 *    there is INERT, and that is asserted too (including the premise that the
 *    host really offers no link, so a future crawl that adds one turns this red
 *    instead of silently keeping a clickable-looking bar dead).
 *
 * The keyboard binding matters beyond "it also works": the items are divs with
 * `role="button"` + `tabindex`, so Enter is the only way a keyboard user can
 * activate them.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, setStoredLanguage, test } from './fixtures/extension-harness';
import {
  installDoubanFixtureRoutes,
  type DoubanFixtureRule,
} from './fixtures/douban-crawl-fixtures';

const OVERLAY = '#umm-douban-overlay';
const ITEM = '.umm-statbar-item';
const CLICKABLE = '.umm-statbar-item--clickable';

interface Profile {
  name: string;
  url: string;
  rule: DoubanFixtureRule;
}

const PROFILES: Record<string, Profile> = {
  movie: {
    name: 'movie-profile',
    url: 'https://movie.douban.com/people/27235071/',
    rule: { host: 'movie.douban.com', match: '/people/27235071', fixture: 'movie-profile' },
  },
  book: {
    name: 'book-profile',
    url: 'https://book.douban.com/people/27235071/',
    rule: { host: 'book.douban.com', match: '/people/27235071', fixture: 'book-profile' },
  },
  user: {
    name: 'user-profile',
    url: 'https://www.douban.com/people/unforgetmemory/',
    rule: { host: 'www.douban.com', match: '/people/unforgetmemory', fixture: 'user-profile' },
  },
  music: {
    name: 'music-profile',
    url: 'https://music.douban.com/people/88990011/',
    rule: { host: 'music.douban.com', match: '/people/88990011', fixture: 'music-profile' },
  },
};

async function openProfile(p: Profile, ctx: BrowserContext, extPage: Page): Promise<Page> {
  // X108 复验记录（推翻 X107 的撤除）：movie-profile 的统计条现在**两条来源并存**——
  // 宿主派生标签（如「看过」，语言无关）与词典标签条（收藏的影人/我的影评，
  // 随语言渲染）。本例的配对循环要求「每个统计项都能对回宿主的计数行」，宿主行是
  // 中文 ⇒ 词典标签条必须以中文渲染才能配对，故这里**必须钉 zh-CN**（承重，不再
  // 是 X107 时那条装饰性钉子）。语言覆盖由 x107/x108 两份双挂载 spec 承担。
  await setStoredLanguage(extPage, 'zh-CN');
  await installDoubanFixtureRoutes(ctx, [p.rule]);
  const page = await ctx.newPage();
  await page.goto(p.url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(`${OVERLAY} ${ITEM}`).first()).toBeVisible({ timeout: 60_000 });
  return page;
}

function freshPages(ctx: BrowserContext, known: Set<Page>): Page[] {
  return ctx.pages().filter((x) => !known.has(x));
}

/** Wait for popups to appear (or fail to), then return their committed URLs. */
async function openedUrls(
  ctx: BrowserContext,
  known: Set<Page>,
  budgetMs = 2_500,
): Promise<string[]> {
  const deadline = Date.now() + budgetMs;
  let fresh = freshPages(ctx, known);
  while (Date.now() < deadline && fresh.length === 0) {
    await new Promise((r) => setTimeout(r, 50));
    fresh = freshPages(ctx, known);
  }
  const urls = fresh.map((p) => p.url());
  for (const p of fresh) await p.close();
  return urls;
}

/** The userId the host profile itself advertises (canonical author link). The
 *  fallback is the profile URL, not a bare id: the extractor below matches on the
 *  `/people/<id>` shape, and a bare id would silently yield ''. */
function hostUserId(page: Page, url: string): Promise<string> {
  return page.evaluate((fallback) => {
    const link =
      document.querySelector<HTMLAnchorElement>('#db-usr-profile .info a') ??
      document.querySelector<HTMLAnchorElement>('a[itemprop="author"]') ??
      document.querySelector<HTMLAnchorElement>('.user-info a');
    const href = link?.href ?? fallback;
    return (href.match(/\/people\/([^/?#]+)/)?.[1] ?? '').toLowerCase();
  }, url);
}

test.describe('UmmStatBar：四个 profile 页的点击与回车激活', () => {
  test('movie-profile：每个统计项的值与跳转目标都等于宿主 #db-movie-mine 自己列出的那条', async ({
    extContext,
    extPage,
  }) => {
    const p = PROFILES.movie!;
    const page = await openProfile(p, extContext, extPage);

    // Host oracle: label → { count, absolute href } from each section heading.
    const host = await page.evaluate(() => {
      const out: { label: string; count: string; href: string }[] = [];
      const root = document.getElementById('db-movie-mine');
      if (!root) return out;
      for (const h2 of Array.from(root.querySelectorAll('h2'))) {
        const label = (h2.textContent ?? '').replace(/[\s·]+.*$/, '').trim();
        const a = h2.querySelector<HTMLAnchorElement>('.pl a');
        if (!label || !a) continue;
        const count = (a.textContent?.match(/\d+/)?.[0] ?? '').trim();
        if (count) out.push({ label, count, href: a.href });
      }
      return out;
    });
    expect(host.length, '夹具丢了 #db-movie-mine 的计数链接').toBeGreaterThanOrEqual(2);

    const items = page.locator(`${OVERLAY} ${ITEM}`);
    const itemCount = await items.count();
    expect(itemCount, 'overlay 未渲染任何统计项').toBeGreaterThanOrEqual(1);

    let matched = 0;
    for (let i = 0; i < itemCount; i++) {
      const item = items.nth(i)!;
      const label = (await item.locator('.umm-statbar-lbl').innerText()).trim();
      const value = (await item.locator('.umm-statbar-val').innerText()).trim();
      const entry = host.find((h) => label.startsWith(h.label) || h.label.startsWith(label));
      // No item may skip: an unmatched pill is exactly the defect this loop used
      // to hide behind (`matched > 0` was the only coverage claim, and the page
      // grew a "二刷 0" pill whose URL was the bare movie homepage — a heading
      // with no host count link had been turned into a navigation).
      const row = entry;
      expect(row, `统计项 ${JSON.stringify(label)} 在宿主没有对应的计数行`).toBeTruthy();
      matched++;
      expect(value.replace(/,/g, ''), `项 ${label} 的值不等于宿主计数`).toBe(row!.count);
      await expect(item).toHaveAttribute('role', 'button');
      await expect(item).toHaveAttribute('tabindex', '0');

      const known = new Set(extContext.pages());
      await item.click();
      const opened = await openedUrls(extContext, known);
      expect(opened.length, `点击 ${label} 没有开标签`).toBe(1);
      expect(opened[0], `点击 ${label} 开的不是宿主列出的那条链接`).toBe(row!.href);
    }
    expect(matched, `没有一项能对回宿主的 ${host.map((h) => h.label).join('/')}`).toBeGreaterThan(
      0,
    );
  });

  test('movie-profile：键盘 Enter 与鼠标点击走同一条激活路径', async ({ extContext, extPage }) => {
    const p = PROFILES.movie!;
    const page = await openProfile(p, extContext, extPage);
    const first = page.locator(`${OVERLAY} ${CLICKABLE}`).first();
    await expect(first).toBeVisible({ timeout: 60_000 });

    const href = await page.evaluate(() => {
      const root = document.getElementById('db-movie-mine');
      const a = root?.querySelector<HTMLAnchorElement>('h2 .pl a');
      return a?.href ?? '';
    });
    expect(href, '夹具丢了第一条宿主计数链接').not.toBe('');

    await first.focus();
    const known = new Set(extContext.pages());
    await page.keyboard.press('Enter');
    const opened = await openedUrls(extContext, known);
    expect(opened.length, 'Enter 没有开标签（@keydown.enter 未接）').toBe(1);
    expect(opened[0]).toBe(href);
  });

  for (const key of ['book', 'user'] as const) {
    test(`${key}-profile：统计项开且只开一个标签，且落在本用户自己的豆列页`, async ({
      extContext,
      extPage,
    }) => {
      const p = PROFILES[key]!;
      const page = await openProfile(p, extContext, extPage);
      const userId = await hostUserId(page, p.url);
      expect(userId.length, '宿主 profile 没报出 userId').toBeGreaterThan(0);

      const clickable = page.locator(`${OVERLAY} ${CLICKABLE}`);
      const count = await clickable.count();
      expect(count, `${key} 页没有可点的统计项`).toBeGreaterThanOrEqual(1);

      const targets: { label: string; url: string }[] = [];
      for (let i = 0; i < count; i++) {
        const item = clickable.nth(i)!;
        await expect(item).toHaveAttribute('tabindex', '0');
        const label = (await item.locator('.umm-statbar-lbl').innerText()).trim();
        const known = new Set(extContext.pages());
        await item.click();
        const opened = await openedUrls(extContext, known);
        expect(opened.length, `第 ${i} 项点击后开的标签数不对`).toBe(1);
        const target = new URL(opened[0]!);
        expect(target.hostname.endsWith('douban.com'), `第 ${i} 项跳出了豆瓣域`).toBe(true);
        // The real risk for a synthesized URL is identity, not path: a stale or
        // wrong userId silently sends the user to somebody else's list.
        if (target.pathname.includes('/people/')) {
          const targetUser = (
            target.pathname.match(/\/people\/([^/?#]+)/)?.[1] ?? ''
          ).toLowerCase();
          expect(targetUser, `第 ${i} 项跳到了别人的主页`).toBe(userId);
        }
        targets.push({ label, url: opened[0]! });
      }

      // Distinctness is what catches a handler that navigates to one constant
      // URL: origin + identity checks alone cannot see it (measured — pinning
      // `openExternalUrl` to a fixed address left this loop green before the
      // distinctness assertion was added).
      const distinct = new Set(targets.map((t) => t.url));
      expect(
        distinct.size,
        `各统计项应各跳各的目标，实测重复：${targets.map((t) => `${t.label}→${t.url}`).join(' | ')}`,
      ).toBe(count);
      expect(count, '本例需要 ≥2 项才能证明「各自不同」').toBeGreaterThanOrEqual(2);
    });
  }

  // ── the inert case, and the premise that keeps it honest ─────────────────
  test('music-profile：宿主计数块本就没有链接 ⇒ 统计项必须呈非激活态且不跳转', async ({
    extContext,
    extPage,
  }) => {
    const p = PROFILES.music!;
    const page = await openProfile(p, extContext, extPage);

    // Premise first: if a future crawl gives these blocks anchors, inertness is
    // no longer the right answer and this test must fail rather than pass.
    const hostAnchors = await page.evaluate(
      () => document.querySelectorAll('.number-accumulated .number-item a').length,
    );
    expect(hostAnchors, '宿主 number-item 现在带链接了：本例前提失效').toBe(0);

    const items = page.locator(`${OVERLAY} ${ITEM}`);
    const count = await items.count();
    expect(count, 'music-profile 没渲染统计项').toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      const item = items.nth(i)!;
      expect(
        await item.evaluate((el) => el.classList.contains('umm-statbar-item--clickable')),
        `第 ${i} 项无链接却被标成可点`,
      ).toBe(false);
      await expect(item).toHaveAttribute('tabindex', '-1');
    }

    const known = new Set(extContext.pages());
    await items.first().click();
    expect((await openedUrls(extContext, known, 1_200)).length, '无链接的统计项竟然跳转了').toBe(0);
  });
});
