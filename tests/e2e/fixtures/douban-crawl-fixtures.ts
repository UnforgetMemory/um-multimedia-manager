/**
 * Serve the byte-faithful crawled Douban fixtures (tests/fixtures/douban/*.html,
 * the same DOM the unit extraction specs parse) as the response bodies of the
 * REAL host URLs, so manifest `matches` still inject the content scripts while
 * nothing reaches douban.com.
 *
 * Precedence note (why the catch-all is registered first): Playwright resolves
 * overlapping routes LIFO, so the per-host dispatchers registered afterwards win
 * for their own hosts and the catch-all stays as the safety net for anything a
 * page fetches that we did not model.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type BrowserContext, type Page, type Route } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(HERE, '..', '..', 'fixtures', 'douban');

export interface DoubanFixtureRule {
  /** Host the content script must be injected on, e.g. `book.douban.com`. */
  host: string;
  /** Pathname prefix, or a RegExp tested against the request pathname. */
  match: string | RegExp;
  /** File name under tests/fixtures/douban, with or without `.html`. */
  fixture: string;
  /**
   * Optional derived body, applied to the crawled HTML before it is served.
   * Use it to widen a crawl's coverage (a label the real page happened not to
   * carry) instead of hand-writing markup: the structure stays the crawled one,
   * and the deviation is visible at the call site. Cached bodies are bypassed.
   */
  transform?: (html: string) => string;
}

export interface DoubanFixtureRoutes {
  /** Fixture names actually served, in first-use order. */
  served(): string[];
  /** Pathnames that fell through every rule (empty body) — a rule typo shows up here. */
  unmatched(): string[];
}

const EMPTY_TEXT = { status: 200, contentType: 'text/plain', body: '' } as const;

function htmlFor(name: string): string {
  const file = path.join(FIXTURE_DIR, name.endsWith('.html') ? name : `${name}.html`);
  if (!fs.existsSync(file)) {
    // Serving an empty body instead would let a spec "pass" against a blank page.
    throw new Error(`[e2e] missing crawled fixture: ${file}`);
  }
  return fs.readFileSync(file, 'utf8');
}

const cache = new Map<string, string>();

function fulfillHtml(
  route: Route,
  name: string,
  seen: string[],
  transform?: (html: string) => string,
): void {
  if (!seen.includes(name)) seen.push(name);
  if (transform) {
    // Derived bodies are per-rule: caching the crawl is fine, caching a variant
    // would let a later rule with a different transform see this one's body.
    void route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: transform(htmlFor(name)),
    });
    return;
  }
  let html = cache.get(name);
  if (html === undefined) {
    html = htmlFor(name);
    cache.set(name, html);
  }
  void route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
}

export async function installDoubanFixtureRoutes(
  ctx: BrowserContext,
  rules: DoubanFixtureRule[],
): Promise<DoubanFixtureRoutes> {
  const servedNames: string[] = [];
  const unmatchedPaths: string[] = [];

  await ctx.route('*://*.douban.com/**', (route) => void route.fulfill(EMPTY_TEXT));
  await ctx.route('*://*.doubanio.com/**', (route) => void route.fulfill(EMPTY_TEXT));

  const byHost = new Map<string, DoubanFixtureRule[]>();
  for (const rule of rules) {
    const list = byHost.get(rule.host) ?? [];
    list.push(rule);
    byHost.set(rule.host, list);
  }

  for (const [host, hostRules] of byHost) {
    await ctx.route(`https://${host}/**`, (route) => {
      const pathname = new URL(route.request().url()).pathname;
      // Douban's interest API (GET status / POST mark) — neutral stub, so a page
      // script never blocks on a real login-gated endpoint.
      if (pathname.startsWith('/j/')) {
        void route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ interest_status: '', html: '' }),
        });
        return;
      }
      for (const rule of hostRules) {
        const hit =
          typeof rule.match === 'string'
            ? pathname.startsWith(rule.match)
            : rule.match.test(pathname);
        if (hit) {
          fulfillHtml(route, rule.fixture, servedNames, rule.transform);
          return;
        }
      }
      if (!unmatchedPaths.includes(pathname)) unmatchedPaths.push(pathname);
      void route.fulfill(EMPTY_TEXT);
    });
  }

  return {
    served: () => [...servedNames],
    unmatched: () => [...unmatchedPaths],
  };
}

/**
 * Route a fixture onto its real host URL, open the page, and prove the body came
 * from the fixture — a page that silently rendered from an empty stub would
 * otherwise let every downstream assertion pass against nothing.
 *
 * Every rule is verified rather than just the first: a typo in one `match` would
 * serve that host the empty catch-all while the test still looked green.
 */
export interface OpenDoubanFixtureOptions {
  /** Bare id (no `#`) of the overlay whose document_start <style> must exist. */
  shell?: string;
}

export async function openDoubanFixturePage(
  ctx: BrowserContext,
  rules: DoubanFixtureRule | DoubanFixtureRule[],
  url: string,
  options: OpenDoubanFixtureOptions = {},
): Promise<Page> {
  const list = Array.isArray(rules) ? rules : [rules];
  const routes = await installDoubanFixtureRoutes(ctx, list);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  for (const rule of list) {
    expect(rule.fixture.length, 'every rule names its fixture').toBeGreaterThan(0);
    expect(routes.served(), `fixture "${rule.fixture}" never answered the document`).toContain(
      rule.fixture,
    );
  }
  if (options.shell) {
    // getElementById takes a bare id, not a selector.
    await page.waitForFunction(
      (id: string) => !!document.getElementById(id)?.shadowRoot?.querySelector('style'),
      options.shell,
      { timeout: 30_000 },
    );
  }
  return page;
}

/**
 * Widen a crawl that happens to carry no TV-labelled search result: mark the
 * first `count` items of the embedded `__DATA__` payload as 剧集.
 *
 * Only the label array changes — every selector, class and field the extractor
 * reads stays as crawled, so a filter test gains its second side without
 * inventing markup the real page never produced.
 */
export function labelFirstSubjectsAsTv(html: string, count = 1): string {
  const marker = '"labels": [],';
  const available = html.split(marker).length - 1;
  if (available < count) {
    throw new Error(
      `[e2e] fixture has ${available} label-less items, cannot mark ${count} as 剧集 ` +
        '(the crawl changed — update the fixture rather than the assertion)',
    );
  }
  let out = html;
  for (let i = 0; i < count; i++) {
    out = out.replace(marker, '"labels": [{ "text": "剧集" }],');
  }
  return out;
}
