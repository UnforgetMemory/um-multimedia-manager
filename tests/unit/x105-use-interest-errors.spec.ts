import { test, expect } from '@playwright/test';
import { defineGlobal, initFileSandbox } from './helpers/global-sandbox';

initFileSandbox();
import { JSDOM } from 'jsdom';

/**
 * X105 — `useInterest` 的失败文案是 i18n 键，且**分支↔键**配对正确。
 *
 * 为什么单独成文件：这五条串此前零覆盖（`grep err_session tests/` 无匹配），而它们正是
 * 用户唯一会看到的错误文案；把 `err_session_maybe` 与 `err_session` 写反、或把
 * `err_not_logged_in_refresh` 用到「已登录但缺 ck」分支上，都不会被任何现有用例发现。
 *
 * 断言取两处真值：`error.value`（对话框内联显示）与 FloatingToast 收到的 message
 * （403/未登录是 toast + 内联双出口，只断一处会漏掉另一处接错）。toast 用静态方法
 * 拦截而非读 DOM —— `legacy-bridge` re-export 的是同一个 class 对象，替换静态 error
 * 不产生离体定时器，也不依赖 toast 自身的动画/自动关闭。
 *
 * 期望值一律从对应 locale 词典按 key 取（不复制字面量、也不用 t() 自证），并额外跑一条
 * 换语言的用例：语言变了文案必须跟着变，否则说明又退回模块加载期快照或干脆写死字面量。
 */

const dom = new JSDOM('<!doctype html><html><body></body><input name="ck" value="" />', {
  url: 'https://movie.douban.com/',
  pretendToBeVisual: true,
});

defineGlobal('window', dom.window);
defineGlobal('document', dom.window.document);
defineGlobal('navigator', dom.window.navigator);
defineGlobal('localStorage', dom.window.localStorage);
defineGlobal('Node', dom.window.Node);
defineGlobal('Element', dom.window.Element);
defineGlobal('HTMLElement', dom.window.HTMLElement);

import locales from '@/entrypoints/content/i18n/locales';

type InterestModule = typeof import('@/scenario/douban/pages/detail/composables/use-interest');
type BridgeModule = typeof import('@/scenario/douban/shared/legacy-bridge');

let interest: InterestModule | undefined;
let bridge: BridgeModule | undefined;

async function load(): Promise<{ interest: InterestModule; bridge: BridgeModule }> {
  if (!interest || !bridge) {
    interest = await import('@/scenario/douban/pages/detail/composables/use-interest');
    bridge = await import('@/scenario/douban/shared/legacy-bridge');
  }
  return { interest, bridge };
}

/** 记录 toast 出口；返回 restore。 */
function captureToasts(): { seen: string[]; restore: () => void } {
  const seen: string[] = [];
  const original = bridge!.FloatingToast.error;
  bridge!.FloatingToast.error = (_title: string, message?: string): void => {
    seen.push(message ?? '');
  };
  return { seen, restore: () => (bridge!.FloatingToast.error = original) };
}

function setCookie(name: string, value: string | null): void {
  const raw =
    value === null ? `${name}=x; expires=Thu, 01 Jan 1970 00:00:00 GMT` : `${name}=${value}`;
  dom.window.document.cookie = raw;
}

/** `input[name="ck"]` 是 getCk() 的首选来源；空串 = 该来源不可用。 */
function setPageCk(value: string | null): void {
  const input = dom.window.document.querySelector<HTMLInputElement>('input[name="ck"]');
  if (!input) throw new Error('fixture input[name="ck"] missing');
  input.value = value ?? '';
}

function stubFetch(status: number): void {
  defineGlobal(
    'fetch',
    async () => new Response('{}', { status, headers: { 'content-type': 'application/json' } }),
  );
}

async function run(
  locale: 'zh-CN' | 'en-US',
  action: (api: Awaited<ReturnType<InterestModule['useInterest']>>) => Promise<unknown>,
  opts: { status: number; loggedIn: boolean; pageCk: string | null },
): Promise<{ error: string; toasts: string[] }> {
  dom.window.localStorage.setItem('umm:locale', locale);
  const { initI18nSync } = await import('@/entrypoints/content/i18n');
  initI18nSync();
  await load();
  setCookie('DedeUserID', opts.loggedIn ? '123456' : null);
  setCookie('ck', null);
  setPageCk(opts.pageCk);
  stubFetch(opts.status);
  const { seen, restore } = captureToasts();
  const api = interest!.useInterest('1292052');
  try {
    await action(api);
  } finally {
    restore();
    dom.window.localStorage.removeItem('umm:locale');
  }
  return { error: api.error.value, toasts: seen };
}

const SUBJECT = '1292052';

test.describe('useInterest 失败文案：分支↔键配对 + 随语言解析', () => {
  test.afterEach(async () => {
    // currentLocale 是模块级单例：run() 只清了 storage key，语言会停在最后一次用的那份。
    // 串行分片（--workers=1）里这就是「A 文件把语言定死」的第 5b 类泄漏——必须显式落回
    // 模块默认（zh-CN）再删 key。
    dom.window.localStorage.setItem('umm:locale', 'zh-CN');
    const { initI18nSync } = await import('@/entrypoints/content/i18n');
    initI18nSync();
    dom.window.localStorage.removeItem('umm:locale');
  });

  for (const locale of ['zh-CN', 'en-US'] as const) {
    const expected = locales[locale];

    test(`${locale}｜GET 403：内联落 err_request，toast 按登录态分 maybe/definite`, async () => {
      const hit = await run(locale, (api) => api.fetchInterest(), {
        status: 403,
        loggedIn: true,
        pageCk: 'tok',
      });
      expect(hit.error).toBe(expected['douban.interest.err_request']);
      expect(hit.toasts).toEqual([expected['douban.interest.err_session_maybe']]);

      const miss = await run(locale, (api) => api.fetchInterest(), {
        status: 403,
        loggedIn: false,
        pageCk: 'tok',
      });
      expect(miss.toasts).toEqual([expected['douban.interest.err_session']]);
      // 两条分支必须给出不同文案——同值就意味着 maybe/definite 被接成了同一个键。
      expect(hit.toasts[0]).not.toBe(miss.toasts[0]);
    });

    test(`${locale}｜POST 缺 ck：内联 err_not_logged_in，toast 按登录态分 refresh/no-csrf`, async () => {
      const notLoggedIn = await run(locale, (api) => api.submitInterest('collect', 4), {
        status: 200,
        loggedIn: false,
        pageCk: null,
      });
      expect(notLoggedIn.error).toBe(expected['douban.interest.err_not_logged_in']);
      expect(notLoggedIn.toasts).toEqual([expected['douban.interest.err_not_logged_in_refresh']]);

      const loggedInNoCk = await run(locale, (api) => api.submitInterest('collect', 4), {
        status: 200,
        loggedIn: true,
        pageCk: null,
      });
      expect(loggedInNoCk.error).toBe(expected['douban.interest.err_not_logged_in']);
      expect(loggedInNoCk.toasts).toEqual([expected['douban.interest.err_no_csrf']]);
      expect(notLoggedIn.toasts[0]).not.toBe(loggedInNoCk.toasts[0]);
      // 缺 ck 时不该发请求：两条分支都只出一次 toast。
      expect(loggedInNoCk.toasts).toHaveLength(1);
    });

    test(`${locale}｜POST 403：内联取服务端 message，toast 仍是会话文案`, async () => {
      dom.window.localStorage.setItem('umm:locale', locale);
      const { initI18nSync } = await import('@/entrypoints/content/i18n');
      initI18nSync();
      await load();
      setCookie('DedeUserID', '123456');
      setCookie('ck', null);
      setPageCk('tok');
      defineGlobal(
        'fetch',
        async () => new Response(JSON.stringify({ message: 'server says no' }), { status: 403 }),
      );
      const { seen, restore } = captureToasts();
      const api = interest!.useInterest(SUBJECT);
      try {
        const ok = await api.submitInterest('collect', 4);
        expect(ok).toBe(false);
        expect(api.error.value).toBe('server says no');
      } finally {
        restore();
      }
      expect(seen).toEqual([expected['douban.interest.err_session_maybe']]);
    });

    test(`${locale}｜成功路径不产生任何本地化文案（错误串不会被当成回执）`, async () => {
      const hit = await run(locale, (api) => api.submitInterest('collect', 4), {
        status: 200,
        loggedIn: true,
        pageCk: 'tok',
      });
      expect(hit.error).toBe('');
      expect(hit.toasts).toEqual([]);
    });
  }

  test('换语言必须换文案：错误串不是模块加载期快照，也不是硬编码', async () => {
    const zh = await run('zh-CN', (api) => api.fetchInterest(), {
      status: 403,
      loggedIn: true,
      pageCk: 'tok',
    });
    const en = await run('en-US', (api) => api.fetchInterest(), {
      status: 403,
      loggedIn: true,
      pageCk: 'tok',
    });
    expect(zh.error).toBe(locales['zh-CN']['douban.interest.err_request']);
    expect(en.error).toBe(locales['en-US']['douban.interest.err_request']);
    expect(en.error).not.toBe(zh.error);
    expect(en.toasts).not.toEqual(zh.toasts);
  });
});
