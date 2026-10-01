/**
 * X103 — the Sehuatang overlay follows a language change made while its tab is
 * already open (`startLocaleSync()` wiring witness).
 *
 * The defect this pins is an assembly gap that a key-by-key gate cannot see
 * (audit rule 32): `t()` reads a module-level locale, `initI18n()` sets it once at
 * mount, and ONLY `startLocaleSync()` propagates a later Options-page change into
 * an already-open tab. Sehuatang's three orchestration entries each awaited
 * `initI18n()`, but nobody registered the listener — registered as a known gap in
 * `tests/unit/i18n-init-wiring.spec.ts` and closed by this wave (baseline shrunk).
 *
 * Two witnesses, deliberately different rebuild surfaces:
 *  1. ☰ menu — rebuilt on every click, so it only proves "later `t()` calls use
 *     the new locale" (X103's original pair).
 *  2. painted header (stats box + copy button) — mounted once and never rebuilt
 *     on interaction. X106's leftover was exactly this gap on Sehuatang: without
 *     a remount those strings stay frozen. `sehuatang-main` now re-runs the
 *     orchestration entry on `subscribeLocale`; this leg is the proof.
 *
 * Both directions are asserted: the initial language must hold before the change
 * (otherwise "always English" would pass) and the new one must appear after.
 * Storage changes poll instead of sleeping — the `onChanged` event has to reach
 * the content context first.
 */

import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures/extension-harness';
import { installSehuatangMocks, waitForBackgroundReady } from './fixtures/host-mocks';
import { sehuatangListHtml, sehuatangThreadDetailHtml } from './fixtures/sehuatang-page';

const LIST_URL = 'https://www.sehuatang.net/forum-9-1.html';
const MENU_BTN = 'button.umm-sht-action[aria-haspopup="dialog"]';
const MENU_TITLE = '.umm-sht-menu-title';
const MENU_ITEM = '.umm-sht-menu-item';
/** Painted-at-mount surfaces (not rebuilt on interaction). */
const HEADER_INFO = '.umm-header-info';
const COPY_ALL_BTN = 'button.umm-copy-btn';

/** Dictionary values for the lazily built menu, per locale. */
const COPY = {
  'zh-CN': { title: '菜单', item: '手动添加记录', pageBox: '本页已看', copyAll: '一键复制磁力' },
  'en-US': { title: 'Menu', item: 'Manual Add', pageBox: 'Page:', copyAll: 'Copy All Magnets' },
} as const;

async function setLanguage(extPage: Page, value: string | null): Promise<void> {
  await extPage.evaluate((v) => {
    return v === null
      ? chrome.storage.local.remove('language')
      : chrome.storage.local.set({ language: v });
  }, value);
}

async function openList(
  extContext: BrowserContext,
  extPage: Page,
  consoleLines?: string[],
): Promise<Page> {
  await installSehuatangMocks(extContext, {
    listHtml: sehuatangListHtml(),
    threadDetailHtml: sehuatangThreadDetailHtml({
      coverUrl: 'https://www.sehuatang.net/data/attachment/forum/cover-e2e.jpg',
      magnet: 'magnet:?xt=urn:btih:E2E0000000000000000000000000000000E2E0',
    }),
  });
  await waitForBackgroundReady(extPage);
  const page = await extContext.newPage();
  // Listener 必须早于 goto：watched-check 日志可能在首次可见性断言之前就出现。
  if (consoleLines) page.on('console', (msg) => consoleLines.push(msg.text()));
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(MENU_BTN)).toBeVisible({ timeout: 60_000 });
  return page;
}

/** Re-open the menu and report the title plus the first item's label. */
async function readMenu(page: Page): Promise<{ title: string; item: string }> {
  await page.keyboard.press('Escape');
  await page.locator(MENU_BTN).click();
  const title = ((await page.locator(MENU_TITLE).innerText()) ?? '').trim();
  const item = ((await page.locator(MENU_ITEM).first().innerText()) ?? '').trim();
  return { title, item };
}

test.describe('色花堂 overlay 的语言在线同步', () => {
  test.afterEach(async ({ extPage }) => {
    await setLanguage(extPage, null);
  });

  test('挂载后改语言：重新打开的菜单落到新语言，改前保持旧语言', async ({
    extContext,
    extPage,
  }) => {
    await setLanguage(extPage, 'zh-CN');
    const page = await openList(extContext, extPage);

    await page.locator(MENU_BTN).click();
    await expect(page.locator(MENU_TITLE)).toHaveText(COPY['zh-CN'].title);
    await expect(page.locator(MENU_ITEM).first()).toContainText(COPY['zh-CN'].item);

    // Change the language the way the Options page does — while this tab lives.
    await setLanguage(extPage, 'en-US');

    await expect
      .poll(() => readMenu(page).then((m) => m.title), {
        message: '改语言后重新打开的菜单标题没跟着换（startLocaleSync 没装配？）',
        timeout: 15_000,
      })
      .toBe(COPY['en-US'].title);

    const menu = await readMenu(page);
    expect(menu.item, '菜单项文案没跟着换语言（同一批 t() 调用却只换了一半）').toContain(
      COPY['en-US'].item,
    );
    await page.close();
  });

  test('不改语言时菜单保持初始语言（"恒英文"必须能被抓住）', async ({ extContext, extPage }) => {
    await setLanguage(extPage, 'zh-CN');
    const page = await openList(extContext, extPage);

    for (let i = 0; i < 3; i++) {
      const menu = await readMenu(page);
      expect(menu.title, `第 ${i + 1} 次打开不是初始语言`).toBe(COPY['zh-CN'].title);
      expect(menu.item, `第 ${i + 1} 次打开的菜单项不是初始语言`).toContain(COPY['zh-CN'].item);
    }
    await page.close();
  });

  test('已绘制头部文案在线换语言（不重开菜单——证明重挂载而非重建-on-click）', async ({
    extContext,
    extPage,
  }) => {
    await setLanguage(extPage, 'zh-CN');
    // The watched-check log routes through infoLog, which is gated by the
    // logging switch; enable it via the same storage key the Options switch
    // writes, before the list page (and its content script) loads.
    await extPage.evaluate(() => chrome.storage.local.set({ debugEnabled: true }));
    const consoleLines: string[] = [];
    const page = await openList(extContext, extPage, consoleLines);

    // 竞态闸：subscribeLocale 是在初始挂载完成之后才注册的
    // （sehuatang-main.content/index.ts 的 `await mountApp()` → subscribeLocale）。
    // 若语言写入落进「已绘制、未注册」窗口，applyLocale 改了模块语言但没有任何
    // 订阅者被通知，该事件永远不会引发重挂载 ⇒ 印章无论等 15s 还是 45s 都在，
    // 正确代码假红（负载下更易命中，正是本 spec 曾见的 flake 形态）。watched-check
    // 日志（app.ts 的 `[UMM] watched check:`）之后，两个分支到注册的余下路径全是
    // 同步代码 + 微任务；语言写入的 onChanged 回调是渲染器里的新任务，必然排在
    // 「含注册微任务的当前任务」之后 —— 驱动侧再也插不进去。
    await expect
      .poll(() => consoleLines.some((l) => l.includes('[UMM] watched check:')), {
        message: '未见 watched check 日志——无法排除 subscribeLocale 尚未注册的竞态窗口',
        timeout: 30_000,
      })
      .toBe(true);

    // 正向前提：挂载期文案确实在页面上，且是初始语言（否则"恒英文"也能过）。
    // 分工注意：挂载尾沿的 updateHeaderInfo 会把 info 与复制按钮**一起**按当前
    // t() 重绘（app-header-stats.ts 同一函数写 statsBox 与 btnEl.textContent）——
    // 任何「只看文字」的断言都可能在没有重挂载的情况下被尾沿刷成新语言；重挂载的
    // 唯一见证是下面的节点身份印章，文本腿只证明初始语言确实在页面上。
    const readSurfaces = async () => {
      const info = ((await page.locator(HEADER_INFO).innerText()) ?? '').trim();
      const copy = ((await page.locator(COPY_ALL_BTN).first().innerText()) ?? '').trim();
      return { info, copy };
    };
    const before = await readSurfaces();
    expect(before.info, '头部统计框没渲染出初始语言文案').toContain(COPY['zh-CN'].pageBox);
    expect(before.copy, '一键复制按钮没渲染出初始语言文案').toContain(COPY['zh-CN'].copyAll);

    // 绘制收敛闸：等两个表面停止变动再打印章（避免在挂载尾沿未落定的采样点盖印）。
    // 重挂载的硬判据随后：mountContent remove+append 换掉内容根，印章随之消失。
    await expect
      .poll(
        async () => {
          const a = await readSurfaces();
          await page.waitForTimeout(200);
          const b = await readSurfaces();
          return JSON.stringify(a) === JSON.stringify(b) ? a : null;
        },
        { timeout: 10_000 },
      )
      .not.toBeNull();

    const stamped = await page.evaluate(() => {
      const host = document.getElementById('umm-sht-overlay');
      const root = host?.shadowRoot?.querySelector('.umm-sht-shell');
      if (!root) return false;
      root.setAttribute('data-umm-test-identity', 'pre-locale');
      return true;
    });
    expect(stamped, '未找到 .umm-sht-shell，无法钉节点身份').toBe(true);

    await setLanguage(extPage, 'en-US');

    // 在线回填（文本腿）：不导航、不重开菜单也换字，且两表面同时换——但这里换字
    // 也可能是尾沿重绘，重挂载本身另由印章腿证明，两条腿都要过才算数。
    await expect
      .poll(readSurfaces, {
        message: '改语言后已绘制头部没整体换语言（info 若独变 = 旧 header 尾沿刷新，不是重挂载）',
        timeout: 15_000,
      })
      .toMatchObject({
        info: expect.stringContaining(COPY['en-US'].pageBox),
        copy: expect.stringContaining(COPY['en-US'].copyAll),
      });

    // 节点身份：重挂载必须换掉旧 shell（mountContent remove+append 新根）。
    // 若只是尾沿 updateHeaderInfo 用新 t() 重绘，印章会留在原节点上。
    // X112：轮询预算从 15s 提到 45s——重挂载要重跑整个 mountApp（含 initI18n 与
    // 全量重建），负载下实测 15s 内做不完（bilibili 同批次的负载型 flake 佐证）；
    // 超时是等待上界、不是判别阈值，加长不影响这条断言判「谁在画」的能力。
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const host = document.getElementById('umm-sht-overlay');
            return !!host?.shadowRoot?.querySelector(
              '.umm-sht-shell[data-umm-test-identity="pre-locale"]',
            );
          }),
        { message: '印章仍在旧 shell 上——是尾沿重绘不是重挂载', timeout: 45_000 },
      )
      .toBe(false);

    const after = await readSurfaces();
    // 反向：不得残留初始语言片段（混语 = 重挂载只更新了一部分）。
    expect(after.copy.includes(COPY['zh-CN'].copyAll), '按钮文案残留初始语言').toBe(false);
    expect(after.info.includes(COPY['zh-CN'].pageBox), '统计框文案残留初始语言').toBe(false);
    await page.close();
  });
});
