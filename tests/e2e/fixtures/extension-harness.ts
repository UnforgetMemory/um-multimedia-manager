/**
 * X9-C e2e harness — launches a REAL headed Chromium with the REAL built
 * unpacked extension (dist/chrome-mv3), derives the extension id, installs
 * local mock web pages for the douban hosts, and exposes everything as
 * Playwright fixtures.
 *
 * Empirical facts encoded here (Playwright 1.62 + bundled Chromium + MV3):
 *  - headless: false is REQUIRED — `--load-extension` is silently ignored in
 *    every headless mode of the bundled chromium (no service_worker target
 *    ever appears, verified with browser-level CDP Target.getTargets).
 *  - `context.waitForEvent('serviceworker')` never fires for the extension
 *    SW in a persistent context; getExtensionId() polls
 *    context.serviceWorkers() + CDP Target.getTargets instead.
 *  - A fresh mkdtemp userDataDir per test keeps IndexedDB empty and runs
 *    deterministic. Teardown removes the profile dir.
 *
 * Routing strategy: one dispatcher route per host. URLs stay on the real
 * douban hosts (so manifest matches inject the content scripts); request
 * bodies come from local fixtures — `/subject/**` + `/` documents get HTML,
 * `/j/**` interest API calls get JSON stubs, everything else a 200 stub.
 * No request ever reaches a real douban server.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';

// tests/ and package.json are ESM (type: module) — __dirname is unavailable.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(HERE, '..', '..', '..', 'dist', 'chrome-mv3');

interface UmmE2eFixtures {
  extContext: BrowserContext;
  extensionId: string;
  /** Page on an extension origin (popup) — has chrome.runtime messaging. */
  extPage: Page;
}

const EXT_ID_RE = /^chrome-extension:\/\/([a-p]+)\//;

async function getExtensionId(ctx: BrowserContext): Promise<string> {
  const browser = ctx.browser();
  if (!browser) throw new Error('[e2e] persistent context lost its browser handle');
  const cdp = await browser.newBrowserCDPSession();
  const deadline = Date.now() + 30_000;
  try {
    while (Date.now() < deadline) {
      for (const sw of ctx.serviceWorkers()) {
        const m = EXT_ID_RE.exec(sw.url());
        if (m?.[1]) return m[1];
      }
      const { targetInfos } = await cdp.send('Target.getTargets');
      const swTarget = targetInfos.find(
        (t) => t.type === 'service_worker' && EXT_ID_RE.test(t.url),
      );
      const m = swTarget ? EXT_ID_RE.exec(swTarget.url) : null;
      if (m?.[1]) return m[1];
      await new Promise((r) => setTimeout(r, 500));
    }
  } finally {
    await cdp.detach().catch(() => undefined);
  }
  throw new Error(
    '[e2e] extension service worker never appeared — ' +
      `is ${EXT_DIR} a valid MV3 build? (npm run build)`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Resolve with `p`'s value, or `null` after `ms` — the race timer is cleared
 * either way, so a lost race never leaves a stray timer behind.
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Serve local mock pages for every douban host we exercise. Requests are
 * answered from fixtures; nothing reaches the real site.
 */
export async function installDoubanMocks(
  ctx: BrowserContext,
  mocks: { movieDetailHtml?: string; bookHomeHtml?: string },
): Promise<void> {
  // Playwright resolves overlapping routes LIFO (latest registered wins) —
  // register the catch-all safety net FIRST so the host dispatchers below
  // take precedence for their own patterns.
  await ctx.route('*://*.douban.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' }),
  );
  await ctx.route('*://*.doubanio.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' }),
  );

  await ctx.route('https://movie.douban.com/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith('/j/')) {
      // Douban interest API (GET status / POST mark) — neutral JSON stub.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ interest_status: '', html: '' }),
      });
    }
    if (pathname.startsWith('/subject/') && mocks.movieDetailHtml !== undefined) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: mocks.movieDetailHtml,
      });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });

  await ctx.route('https://book.douban.com/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/' || pathname === '/index.html') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: mocks.bookHomeHtml ?? '<html><body>no mock</body></html>',
      });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
}

/**
 * Serve a local mock for the NexusPHP PT host (www.audiences.me torrents
 * list). Same trick as installDoubanMocks: URL stays on the real host so
 * content.ts manifest matches inject; the body is the fixture. No PT site
 * is ever contacted.
 */
export async function installPtMocks(
  ctx: BrowserContext,
  mocks: { torrentsListHtml: string },
): Promise<void> {
  await ctx.route('*://*.audiences.me/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' }),
  );
  await ctx.route('https://*.audiences.me/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/torrents.php') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: mocks.torrentsListHtml,
      });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
}

/** Serve a local mock of www.imdb.com title pages (legacy detail pipeline). */
export async function installImdbMocks(
  ctx: BrowserContext,
  mocks: { titleDetailHtml: string },
): Promise<void> {
  await ctx.route('*://*.imdb.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' }),
  );
  await ctx.route('https://www.imdb.com/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/^\/title\/tt\d+/.test(pathname)) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: mocks.titleDetailHtml,
      });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
}

export const test = base.extend<UmmE2eFixtures>({
  // Playwright REQUIRES object destructuring on fixture callbacks (runtime
  // check), so the empty pattern stays; oxlint's no-empty-pattern is the only
  // thing that can be silenced here.
  // eslint-disable-next-line no-empty-pattern
  extContext: async ({}, use) => {
    if (!fs.existsSync(path.join(EXT_DIR, 'manifest.json'))) {
      throw new Error(`[e2e] built extension not found at ${EXT_DIR} — run \`npm run build\``);
    }
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-e2e-profile-'));
    const ctx = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: ['--disable-extensions-except=' + EXT_DIR, '--load-extension=' + EXT_DIR],
    });
    // Simulated-pages invariant: every http(s) request must be served by a
    // spec-installed route. This catch-all is registered FIRST, so Playwright's
    // LIFO resolution lets every more specific route registered later win, and
    // only genuinely unstubbed hosts land here — recorded and failed at context
    // teardown instead of quietly depending on the internet.
    //
    // Scope, corrected by measurement (2026-09-27): a **context**-level route
    // also sees requests issued by the extension's service worker — the first run
    // of this guard was tripped by a SW-side WebDAV probe that no page-level route
    // had been able to intercept. So specs stubbing SW traffic must use
    // `extContext.route(...)`, not `page.route(...)`.
    const escaped: string[] = [];
    await ctx.route('**/*', (route) => {
      const url = route.request().url();
      if (!/^https?:/i.test(url)) return route.continue();
      escaped.push(url);
      return route.abort();
    });
    let useFailure: unknown = null;
    try {
      await use(ctx);
    } catch (error) {
      // Captured rather than rethrown immediately so teardown always runs, and
      // so the escape report can be appended instead of replacing the real error
      // (throwing from `finally` would mask whatever the test itself hit).
      useFailure = error;
    }
    // X112：关浏览器在负载下可能长时间不返回（实测 >180s 直接把用例判成
    // 「Tearing down extContext exceeded the test timeout」，见项目记忆
    // e2e-load-flakes.md）。给关闭设上限：超时后尽力强关 Browser 并继续，
    // 否则一次环境抖动会把整条用例拖红、把 flake 伪装成产品故障。
    const closed = await withTimeout(
      ctx
        .close()
        .then(() => true)
        .catch(() => true),
      30_000,
    );
    if (closed === null) {
      console.warn('[e2e] ctx.close() 超 30s 未返回——尝试强关 Browser 后继续');
      const browser = ctx.browser();
      if (browser) {
        const forced = await withTimeout(
          browser
            .close()
            .then(() => true)
            .catch(() => true),
          10_000,
        );
        if (forced === null) {
          console.warn('[e2e] Browser.close() 超 10s 仍未返回——放弃等待，继续清理');
        }
      } else {
        console.warn('[e2e] ctx.browser() 为空——无法强关浏览器，继续清理');
      }
    }
    // Chrome may hold file locks briefly after close — retry-remove best effort.
    let removed = false;
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        removed = true;
        break;
      } catch {
        await sleep(400);
      }
    }
    if (!removed) {
      console.warn(`[e2e] 用户数据目录 5 次重试仍删不掉（残留交给系统清理）：${userDataDir}`);
    }

    if (escaped.length > 0) {
      const uniq = [...new Set(escaped)].slice(0, 8);
      const escapeMessage =
        `[e2e] ${escaped.length} request(s) escaped local simulation: ${uniq.join(', ')}\n` +
        '      Install a route for that host (host-mocks / douban-crawl-fixtures) or ' +
        'assert on the stubbed body — tests must not depend on live internet.';
      if (useFailure !== null) throw new Error(`${String(useFailure)}\n${escapeMessage}`);
      throw new Error(escapeMessage);
    }
    if (useFailure !== null) throw useFailure;
  },

  extensionId: async ({ extContext }, use) => {
    await use(await getExtensionId(extContext));
  },

  extPage: async ({ extContext, extensionId }, use) => {
    const page = await extContext.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    try {
      await use(page);
    } finally {
      await page.close().catch(() => undefined);
    }
  },
});

export { expect };

/**
 * Send a raw runtime message from an extension page (popup/options origin).
 * MV3 chrome.runtime.sendMessage returns a promise resolving to the
 * background response envelope ({ success, ... }).
 */
export async function sendRuntimeMessage(
  page: Page,
  type: string,
  payload: unknown,
): Promise<RuntimeResponse> {
  return page.evaluate(
    ({ type, payload }) =>
      chrome.runtime.sendMessage({ type, payload }) as Promise<RuntimeResponse>,
    { type, payload },
  );
}

/** Loose structural type for background response envelopes (no `as any` in specs). */
export interface RuntimeResponse {
  success?: boolean;
  record?: { status?: number; rating?: number; url?: string } | null;
  error?: string;
}

export const DOUBAN_STORE = 'douban_records';
export const IMDB_STORE = 'imdb_records';

/** Minimal StoreRecord shape for DB_PUT fixtures (url/status/rating/comment/updatedAt/linkedIds). */
export function makeStoreRecord(
  url: string,
  status: number,
  rating: number,
  linkedIds: Record<string, string> = {},
): Record<string, unknown> {
  return {
    url,
    status,
    rating,
    comment: '',
    updatedAt: new Date().toISOString(),
    linkedIds,
  };
}

/**
 * 内容脚本 i18n 的唯一语言来源是 `chrome.storage.local.language`（读取顺序
 * storage → localStorage → navigator.language）。harness 浏览器报 en-US，所以任何
 * 「断言某个具体语言的字面串」的用例都必须先钉住 locale——否则测的是宿主浏览器的
 * 语言，不是扩展设置。存储跨标签页存活：用完必须传 null 复原，否则会污染同批分片。
 */
export async function setStoredLanguage(extPage: Page, value: string | null): Promise<void> {
  await extPage.evaluate((v) => {
    return v === null
      ? chrome.storage.local.remove('language')
      : chrome.storage.local.set({ language: v });
  }, value);
}
