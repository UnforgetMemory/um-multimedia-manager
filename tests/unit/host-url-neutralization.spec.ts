import { test, expect } from '@playwright/test';
import { defineGlobal } from './helpers/global-sandbox';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { releaseMounted, trackMounted } from './helpers/release-mounted-apps';

/**
 * Host-origin URL neutralization.
 *
 * Douban pages embed user-authored anchors; `a.href` is DOM-resolved, so a
 * `javascript:`/`data:`/`vbscript:` href arrives verbatim into typed page
 * data and then into `<a :href>` / `window.open`. Every crossing from host
 * DOM into overlay navigation surfaces must be neutralized.
 *
 * Proven three ways: producer-level (extractEditions), render-level (a real
 * shadow-root-mounted UmmMediaCard receiving a poisoned prop), and a
 * repo-wide source scan that no bare `window.open` survives in the Douban
 * overlay surface.
 */

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://book.douban.com/subject/1000/',
  pretendToBeVisual: true,
});

let openCalls: string[] = [];

function installWindow(): void {
  const spy = (url?: string | URL) => {
    openCalls.push(String(url ?? ''));
    return null;
  };
  Object.defineProperty(dom.window, 'open', { value: spy, configurable: true, writable: true });
}

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('location', dom.window.location);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);

type VueMod = typeof import('vue');
type CardMod = typeof import('@/scenario/douban/components/umm-media-card');

async function loadVueAndCard(): Promise<{ vue: VueMod; card: CardMod }> {
  const vue = await import('vue');
  const card = await import('@/scenario/douban/components/umm-media-card');
  return { vue, card };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

const REPO = path.resolve(import.meta.dirname, '..', '..');

function listFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const abs = path.join(dir, e);
    if (statSync(abs).isDirectory()) listFiles(abs, out);
    else if (/\.(ts|vue)$/.test(e)) out.push(abs);
  }
  return out;
}

test.describe('producer: detail extra-extract editions', () => {
  test.beforeEach(() => {
    dom.window.document.body.innerHTML = '';
  });

  test('extractEditions neutralizes a javascript: edition link', async () => {
    const { extractEditions } = await import('@/scenario/douban/pages/detail/extra-extract');
    dom.window.document.body.innerHTML =
      '<h2>其他版本</h2>' +
      '<ul><li class="mb8"><div class="meta">' +
      '<a href="javascript:alert(1)"> Evil Edition</a>' +
      '</div><span class="count">12人评价</span></li></ul>';
    const items = extractEditions();
    expect(items).toHaveLength(1);
    expect(['#', '']).toContain(items[0]!.link);
  });

  test('extractEditions keeps ordinary https edition links untouched', async () => {
    const { extractEditions } = await import('@/scenario/douban/pages/detail/extra-extract');
    dom.window.document.body.innerHTML =
      '<h2>其他版本</h2>' +
      '<ul><li class="mb8"><div class="meta">' +
      '<a href="https://book.douban.com/subject/2000/"> Good Edition</a>' +
      '</div><span class="count">3人评价</span></li></ul>';
    const items = extractEditions();
    expect(items[0]!.link).toBe('https://book.douban.com/subject/2000/');
  });
});

test.describe('sink: UmmMediaCard rendered inside a real shadow root', () => {
  test.beforeEach(() => {
    installWindow();
    openCalls = [];
    dom.window.document.body.innerHTML = '';
  });
  test.afterEach(releaseMounted);

  test('scroll-mode anchor href is neutralized, not javascript:', async () => {
    const { vue, card } = await loadVueAndCard();
    const host = dom.window.document.createElement('div');
    host.attachShadow({ mode: 'open' });
    dom.window.document.body.appendChild(host);

    const container = dom.window.document.createElement('div');
    host.shadowRoot!.appendChild(container);
    const app = vue.createApp(card.UmmMediaCard, {
      mode: 'scroll',
      posterUrl: 'https://img.doubanio.com/p.jpg',
      title: 'Poisoned card',
      href: 'javascript:alert(1)',
    });
    app.mount(container);
    trackMounted(app, container);
    await flush();

    const a = host.shadowRoot!.querySelector('a.umm-card');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('href')).toBe('#');
  });

  test('grid-mode click never calls window.open with a javascript: URL', async () => {
    const { vue, card } = await loadVueAndCard();
    const host = dom.window.document.createElement('div');
    host.attachShadow({ mode: 'open' });
    dom.window.document.body.appendChild(host);

    const container = dom.window.document.createElement('div');
    host.shadowRoot!.appendChild(container);
    const app = vue.createApp(card.UmmMediaCard, {
      mode: 'grid',
      posterUrl: 'https://img.doubanio.com/p.jpg',
      title: 'Poisoned grid card',
      href: 'javascript:alert(1)',
    });
    app.mount(container);
    trackMounted(app, container);
    await flush();

    const cardEl = host.shadowRoot!.querySelector('.umm-rec-item') as HTMLElement;
    expect(cardEl).not.toBeNull();
    cardEl.click();
    expect(openCalls.some((u) => /^javascript:/i.test(u))).toBe(false);
  });

  test('grid-mode click still opens legitimate https links', async () => {
    const { vue, card } = await loadVueAndCard();
    const host = dom.window.document.createElement('div');
    host.attachShadow({ mode: 'open' });
    dom.window.document.body.appendChild(host);

    const container = dom.window.document.createElement('div');
    host.shadowRoot!.appendChild(container);
    const app = vue.createApp(card.UmmMediaCard, {
      mode: 'grid',
      posterUrl: 'https://img.doubanio.com/p.jpg',
      title: 'Good card',
      href: 'https://movie.douban.com/subject/1292052/',
    });
    app.mount(container);
    trackMounted(app, container);
    await flush();

    const cardEl = host.shadowRoot!.querySelector('.umm-rec-item') as HTMLElement;
    cardEl.click();
    expect(openCalls).toEqual(['https://movie.douban.com/subject/1292052/']);
  });
});

test.describe('source scan: no bare navigation sinks left in the overlay surface', () => {
  test('src/scenario/douban contains no raw window.open( calls', () => {
    const files = listFiles(path.join(REPO, 'src/scenario/douban'));
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return /\bwindow\.open\s*\(/.test(src);
    });
    expect(offenders.map((f) => path.relative(REPO, f))).toEqual([]);
  });

  test('location.href assignments in overlay code are sanitizer-wrapped or static', () => {
    const files = listFiles(path.join(REPO, 'src/scenario/douban'));
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        const m = line.match(/(?:window\.)?location\.href\s*=\s*(.+)/);
        if (!m) return;
        const rhs = m[1]!;
        // Reads like `new URL(location.href)` never match `location.href =`.
        const wrapped = rhs.includes('safeHref(') || line.includes('isSafeDoubanUrl('); // pre-existing guard at the callsite
        const staticHttps = /^\s*\(?[`'"]https:\/\//.test(rhs);
        if (!wrapped && !staticHttps) offenders.push(`${path.relative(REPO, f)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
