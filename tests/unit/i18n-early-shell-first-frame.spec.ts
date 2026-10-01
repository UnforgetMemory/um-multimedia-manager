import { test, expect } from '@playwright/test';
import { JSDOM } from 'jsdom';
import { initFileSandbox, defineGlobals } from './helpers/global-sandbox';
import locales, { type Locale } from '@/entrypoints/content/i18n/locales';
import { initI18n } from '@/entrypoints/content/i18n';
import { createDoubanEarlyOverlay } from '@/scenario/douban/early';
import { STORAGE_KEYS } from '@/libraries/config';

/**
 * 早期壳（`document_start`）首帧本地化实测。
 *
 * 由 i18n-init-wiring.spec.ts 拆出（单文件 600 行门禁，size:check）：那两个用例是
 * 「为什么壳不 await chrome.storage」的**证据**——把存储 stub 成永不 resolve，壳照样
 * 同步画出来且文案跟随浏览器语言；等存储 resolve 后再回填，让 Options 页保存的语言最终胜出。
 *
 * chrome stub 按本文件自备（不跨文件共享桩，防合并复跑时互相污染）；`initFileSandbox()`
 * 必须在模块顶层调用，让 global-sandbox 能登记本文件的还原钩子（isolation:check）。
 * `currentLocale` 是 worker 级共享状态 → serial + afterAll 复位 zh-CN。
 */

initFileSandbox();
test.describe.configure({ mode: 'serial' });

type ChangesCb = (
  changes: Record<string, { oldValue?: string; newValue?: string }>,
  area: string,
) => void;

type ChromeStub = {
  storage: {
    local: {
      get: (
        _keys?: unknown,
        cb?: (res: Record<string, string>) => void,
      ) => Promise<Record<string, string>>;
    };
    onChanged: { addListener: (cb: ChangesCb) => void; removeListener: (cb: ChangesCb) => void };
  };
  runtime: { id: string; lastError: undefined };
};

// ---------------------------------------------------------------------------
// 锁 3b：早期壳首帧实测——document_start 不等 chrome.storage，且英文浏览器不落中文
// （这就是「为什么不 await initI18n()」这一决策的证据，而非口头理由）
// ---------------------------------------------------------------------------

const DETAIL_URL = 'https://movie.douban.com/subject/1234567/';
const SHELL_SUBTITLE_KEY = 'douban.loading.detail';

/**
 * `get` 同时支持 Promise 与回调两种签名——i18n 用 await，overlay/theme-sync 用
 * `(keys, cb)` 回调；缺一种就会在 createOverlay 里炸出与 locale 无关的失败。
 * `'pending'` 让存储**永不 resolve**：壳照样画出来，即证明首帧没有被异步拖住。
 */
function makeChrome(storage: 'pending' | Locale): {
  chrome: ChromeStub;
  fire: (next: Locale) => void;
} {
  const listeners: ChangesCb[] = [];
  const read = (): Promise<Record<string, string>> =>
    storage === 'pending'
      ? new Promise<Record<string, string>>(() => undefined)
      : Promise.resolve({ [STORAGE_KEYS.LANGUAGE]: storage });
  const chrome: ChromeStub = {
    storage: {
      local: {
        get: (_keys?: unknown, cb?: (res: Record<string, string>) => void) => {
          const promise = read();
          if (typeof cb === 'function') void promise.then(cb).catch(() => undefined);
          return promise;
        },
      },
      onChanged: {
        addListener: (cb: ChangesCb) => {
          listeners.push(cb);
        },
        removeListener: (cb: ChangesCb) => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
    runtime: { id: 'test-ext', lastError: undefined },
  };
  return {
    chrome,
    fire: (next) => {
      for (const cb of listeners)
        cb({ [STORAGE_KEYS.LANGUAGE]: { oldValue: storage, newValue: next } }, 'local');
    },
  };
}

/** 装一个豆瓣详情页的 jsdom 现场（document / window / location / localStorage / chrome）。 */
function doubanDom(storage: 'pending' | Locale): { dom: JSDOM; chrome: ChromeStub } {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: DETAIL_URL });
  const win = dom.window as unknown as {
    matchMedia: (q: string) => unknown;
    document: Document;
    [key: string]: unknown;
  };
  win.matchMedia = () => ({
    matches: false,
    media: '(prefers-color-scheme: dark)',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  const stub = makeChrome(storage);
  defineGlobals({
    document: win.document,
    window: win,
    location: { href: DETAIL_URL },
    // 同步 locale 源置空 → 逼 resolveLocaleSync 走 navigator.language（jsdom = en-US）
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    chrome: stub.chrome,
  });
  return { dom, chrome: stub.chrome };
}

function subtitleOf(overlay: HTMLElement): string | null {
  const node = overlay.shadowRoot?.querySelector('.ov-subtitle');
  return node ? (node.textContent ?? null) : null;
}

test.describe('早期壳首帧（jsdom 实测）', () => {
  test('存储永不 resolve 也照样画出壳，且文案跟随浏览器语言而非 zh-CN', () => {
    doubanDom('pending');
    const started = performance.now();
    const overlay = createDoubanEarlyOverlay();
    const cost = performance.now() - started;
    expect(overlay, 'document_start 壳没建出来').not.toBeNull();
    expect(subtitleOf(overlay as HTMLElement)).toBe(locales['en-US'][SHELL_SUBTITLE_KEY]);
    expect(subtitleOf(overlay as HTMLElement), '英文浏览器下壳文案仍落 zh-CN').not.toBe(
      locales['zh-CN'][SHELL_SUBTITLE_KEY],
    );
    // 不用 ms 阈值证明「没被异步拖住」：存储 Promise 永不 resolve，路径里只要有一个
    // await，本用例就会挂到超时——能同步返回即结构性证据。cost 只做量级记录：
    // 首次含 jsdom 冷启动（shadow root + innerHTML + 主题监听），第二次才是可比重试。
    const warmStart = performance.now();
    expect(createDoubanEarlyOverlay(), '重复建壳失败').not.toBeNull();
    const warm = performance.now() - warmStart;
    expect(warm, '同步 locale 定调把建壳拖慢了（正常应为亚毫秒级 DOM 操作）').toBeLessThan(50);
    expect(warm, '冷启动才是大头').toBeLessThan(cost);
  });

  test('存储语言解析回来后只回填这一行副标题（Options 页设置最终胜出）', async () => {
    doubanDom('zh-TW');
    const overlay = createDoubanEarlyOverlay();
    expect(subtitleOf(overlay as HTMLElement)).toBe(locales['en-US'][SHELL_SUBTITLE_KEY]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(subtitleOf(overlay as HTMLElement), '存储里的权威语言没回填到壳').toBe(
      locales['zh-TW'][SHELL_SUBTITLE_KEY],
    );
  });
});

test.afterAll(async () => {
  // currentLocale 是 worker 级共享状态：复位成仓库默认 zh-CN，别污染后面的 spec。
  defineGlobals({ chrome: makeChrome('zh-CN').chrome });
  await initI18n();
});
