import { test, expect } from '@playwright/test';
import locales from '@/entrypoints/content/i18n/locales';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';
import { releaseMounted, trackMounted } from './helpers/release-mounted-apps';
import { JSDOM } from 'jsdom';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Installs happen inside tests below; register this file's sandbox hooks at module scope.
initFileSandbox();

// This file spins a disposable Vite SSR server and loads .vue SFCs through it.
// Under fullyParallel the shared worker can hit Vite's `getBuiltins` transport
// timeout on the first ssrLoadModule (measured as 30s test + 60s transport
// errors in full-suite runs; green in isolation). Serial + a wider window keep
// the suite honest without a retry that would mask a real regression.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

/**
 * UmmPageLayout — the unified Douban overlay page template.
 *
 * This module transitively imports a .vue SFC (UmmDynamicIsland), which
 * Playwright's TS loader cannot parse — so the module graph is loaded through
 * a disposable vite dev server's ssrLoadModule. The island import is replaced
 * by a virtual stub that mirrors its received props into data-attributes:
 * UmmPageLayout's own contract (skeleton, slots, footer, version, and prop
 * forwarding to the island) stays under test without depending on the
 * vapor-mode island render.
 *
 * Contracts pinned: header/content/footer skeleton, default-slot and
 * footer-slot override, the default footer's Douban link set with the
 * type→help-appId mapping (game→main), GitHub aria-label, and the version
 * string sourced from chrome.runtime.getManifest with its documented
 * 'v4.7.0' fallback when chrome is absent.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com/' });
defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);
defineGlobal('SVGElement', dom.window.SVGElement);
// i18n 的同步语言来源读裸 `localStorage`（node 侧不存在），必须与 ssr 图看到同一份。
defineGlobal('localStorage', dom.window.localStorage);

type VueModule = typeof import('vue');

let serverPromise: Promise<import('vite').ViteDevServer> | null = null;

/**
 * The island SFC is swapped for a virtual stub that mirrors its props surface
 * into data-attributes: this spec pins UmmPageLayout's contract (structure +
 * prop forwarding + footer rules), NOT the island's own rendering (and the
 * vapor-mode island needs the production pipeline to hydrate). The stub
 * imports 'vue' exactly like the real module would, keeping one Vue copy.
 */
const STUB_ID = '\0umm-island-stub';

const islandStubPlugin = {
  name: 'stub-dynamic-island',
  enforce: 'pre' as const,
  resolveId(id: string): string | null {
    return id.includes('UmmDynamicIsland') ? STUB_ID : null;
  },
  load(id: string): string | null {
    if (id !== STUB_ID) return null;
    return [
      "import { defineComponent, h } from 'vue';",
      'export default defineComponent({',
      "  name: 'UmmDynamicIsland',",
      '  props: { type: String, newTab: Boolean, initialQuery: String },',
      '  setup(props) {',
      "    return () => h('div', {",
      "      class: 'island-stub',",
      "      'data-type': props.type,",
      "      'data-newtab': String(props.newTab),",
      "      'data-query': props.initialQuery,",
      '    });',
      '  },',
      '});',
    ].join('\n');
  },
};

async function ssrServer(): Promise<import('vite').ViteDevServer> {
  if (!serverPromise) {
    serverPromise = (async () => {
      const vite = await import('vite');
      return vite.createServer({
        root: ROOT,
        configFile: false,
        logLevel: 'error',
        plugins: [islandStubPlugin],
        resolve: { alias: { '@': path.join(ROOT, 'src') } },
      });
    })();
  }
  return serverPromise;
}

type LayoutComponent =
  (typeof import('@/scenario/douban/components/umm-page-layout'))['UmmPageLayout'];

async function loadLayout(): Promise<{ vue: VueModule; component: LayoutComponent }> {
  const server = await ssrServer();
  const mod = (await server.ssrLoadModule(
    '/src/scenario/douban/components/umm-page-layout.ts',
  )) as typeof import('@/scenario/douban/components/umm-page-layout');
  const vue = await import('vue');
  return { vue, component: mod.UmmPageLayout };
}

interface MountOpts {
  type?: 'movie' | 'music' | 'book' | 'game';
  newTab?: boolean;
  initialQuery?: string;
  footerSlot?: boolean;
  manifestVersion?: string;
}

async function mountLayout(opts: MountOpts): Promise<HTMLElement> {
  const { vue, component } = await loadLayout();
  if (opts.manifestVersion === undefined) {
    defineGlobal('chrome', undefined);
  } else {
    const version = opts.manifestVersion;
    defineGlobal('chrome', { runtime: { getManifest: () => ({ version }) } });
  }
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const app = vue.createApp({
    render: () =>
      vue.h(
        component,
        { type: opts.type, newTab: opts.newTab, initialQuery: opts.initialQuery },
        {
          default: () => vue.h('p', { class: 'slot-probe' }, 'body-content'),
          ...(opts.footerSlot ? { footer: () => vue.h('p', { class: 'footer-probe' }, 'X') } : {}),
        },
      ),
  });
  app.mount(container);
  trackMounted(app, container);
  const root = container.querySelector('.umm-layout');
  if (!root) throw new Error('.umm-layout not rendered');
  return root as unknown as HTMLElement;
}

test.afterEach(releaseMounted);

test.afterAll(async () => {
  const server = serverPromise ? await serverPromise : undefined;
  await server?.close();
});

test.describe('UmmPageLayout skeleton', () => {
  test('header (island) / main (default slot) / footer in fixed order', async () => {
    const root = await mountLayout({ manifestVersion: '5.17.2' });
    const kids = Array.from(root.children).map((k) => k.tagName.toLowerCase() + '.' + k.className);
    expect(kids).toEqual([
      'header.umm-layout-header',
      'main.umm-layout-content',
      'footer.umm-layout-footer',
    ]);
    // The island sits in the header (stub mirrors the real component's props).
    expect(root.querySelector('header .island-stub')).not.toBeNull();
    // Default slot lands inside <main>.
    expect(root.querySelector('main .slot-probe')?.textContent).toBe('body-content');
  });

  test('props (and the movie/newTab/empty-query defaults) are forwarded to the island', async () => {
    const root = await mountLayout({ manifestVersion: '1' });
    const island = root.querySelector('.island-stub');
    expect(island?.getAttribute('data-type')).toBe('movie');
    expect(island?.getAttribute('data-newtab')).toBe('true');
    expect(island?.getAttribute('data-query')).toBe('');

    const custom = await mountLayout({
      type: 'music',
      newTab: false,
      initialQuery: '大鱼',
      manifestVersion: '1',
    });
    const node = custom.querySelector('.island-stub');
    expect(node?.getAttribute('data-type')).toBe('music');
    expect(node?.getAttribute('data-newtab')).toBe('false');
    expect(node?.getAttribute('data-query')).toBe('大鱼');
  });
});

test.describe('UmmPageLayout default footer', () => {
  test('carries copyright, six Douban links, GitHub and version tokens', async () => {
    const root = await mountLayout({ manifestVersion: '5.17.2' });
    const footer = root.querySelector('footer');
    expect(footer?.querySelector('.umm-footer-copyright')?.textContent).toContain('douban.com');
    const hrefs = Array.from(footer?.querySelectorAll('.umm-footer-links a') ?? []).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual([
      'https://www.douban.com/about',
      'https://www.douban.com/jobs',
      'https://www.douban.com/about?topic=contactus',
      'https://www.douban.com/about/legal',
      'https://help.douban.com/?app=movie',
      'https://www.douban.com/doubanapp/',
    ]);
    const github = footer?.querySelector('a.umm-footer-github');
    expect(github?.getAttribute('aria-label')).toBe('GitHub repository');
    expect(github?.getAttribute('href')).toBe(
      'https://github.com/UnforgetMemory/um-multimedia-manager',
    );
    expect(github?.querySelector('svg')).not.toBeNull();
    expect(footer?.querySelector('.umm-footer-version')?.textContent).toBe('v5.17.2 modify by UM');
  });

  test('help-center app id maps from the page type (game → main)', async () => {
    const expected: Readonly<Record<string, string>> = {
      movie: 'movie',
      music: 'music',
      book: 'book',
      game: 'main',
    };
    for (const [type, app] of Object.entries(expected)) {
      const root = await mountLayout({
        type: type as 'movie' | 'music' | 'book' | 'game',
        manifestVersion: '1',
      });
      const help = root.querySelector('.umm-footer-links a[href^="https://help.douban.com"]');
      expect(help?.getAttribute('href'), `type=${type}`).toBe(
        `https://help.douban.com/?app=${app}`,
      );
    }
  });

  test('without chrome the version falls back to the documented constant', async () => {
    const root = await mountLayout({});
    expect(root.querySelector('.umm-footer-version')?.textContent).toBe('v4.7.0 modify by UM');
  });
});

test.describe('UmmPageLayout footer override', () => {
  test('a provided footer slot replaces the default Douban footer entirely', async () => {
    const root = await mountLayout({ footerSlot: true, manifestVersion: '1' });
    expect(root.querySelector('.footer-probe')?.textContent).toBe('X');
    expect(root.querySelector('.umm-footer-copyright')).toBeNull();
    expect(root.querySelector('.umm-footer-github')).toBeNull();
  });
});

/**
 * X105 — 页脚（版权行 + 六条 Douban 链接）在渲染时经 content i18n 解析。
 *
 * 结构断言（href 集合、条数）证伪不了文案接错：把 `douban.footer.jobs` 用到「关于豆瓣」
 * 位上，href 那组断言仍然全绿。所以按 key 从对应 locale 词典取期望值逐条比对，并用汉字
 * 探针证明语言真的随存储切换（不是两份词典恰好同值，也不是模块加载期快照）。
 * 语言来源必须走 vite ssr 图里的同一个 i18n 实例——若与 layout 用的是两份实例，en-US 那
 * 条会停在简身上变红。
 */
const FOOTER_LINK_KEYS = [
  'douban.footer.about',
  'douban.footer.jobs',
  'douban.footer.contact',
  'douban.footer.legal',
  'douban.footer.help',
  'douban.footer.app',
] as const;

function setSsrLocale(value: string | null): void {
  if (value === null) dom.window.localStorage.removeItem('umm:locale');
  else dom.window.localStorage.setItem('umm:locale', value);
}

async function ssrI18n(): Promise<typeof import('@/entrypoints/content/i18n')> {
  const server = await ssrServer();
  return server.ssrLoadModule('/src/entrypoints/content/i18n/index.ts') as Promise<
    typeof import('@/entrypoints/content/i18n')
  >;
}

test.describe('UmmPageLayout 页脚文案随语言解析', () => {
  test.afterEach(async () => {
    // i18n 的 currentLocale 是模块级单例：落回模块默认（zh-CN）再清 key，
    // 不给串行分片里后面的文件留残迹。
    setSsrLocale('zh-CN');
    (await ssrI18n()).initI18nSync();
    setSsrLocale(null);
  });

  for (const locale of ['zh-CN', 'en-US'] as const) {
    test(`${locale}：版权行与六条链接逐条对上自己的 key`, async () => {
      setSsrLocale(locale);
      (await ssrI18n()).initI18nSync();
      const expected = locales[locale];
      const root = await mountLayout({ manifestVersion: '1' });

      expect(root.querySelector('.umm-footer-copyright')?.textContent).toBe(
        expected['douban.footer.copyright'],
      );
      const links = Array.from(root.querySelectorAll('.umm-footer-links a')).map((a) =>
        a.textContent?.trim(),
      );
      expect(links).toEqual(FOOTER_LINK_KEYS.map((key) => expected[key]));

      // 汉字探针与语言同向：证明读的是语言设置，不是某个写死的那份表。
      const han = /[一-鿿]/.test(links.join(''));
      expect(han).toBe(locale !== 'en-US');
    });
  }
});
