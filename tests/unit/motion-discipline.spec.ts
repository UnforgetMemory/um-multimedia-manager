import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REDUCED_MOTION_STYLES, composeGlobalStyles } from '@/entrypoints/content/styles/global';
import { TOAST_CORE_CSS } from '@/libraries/styles/toast-css';
import { EFFECTS_CSS, SEHUATANG_OVERLAY_CSS } from '@/scenario/sehuatang/styles';

/**
 * 动效颗粒度纪律守卫（P-E 波次，2026-09-26）。
 *
 * 参照 scripts/check-content-style-scope.cjs 的双向验证精神：每条正则守卫都配
 * 「夹具正例（必须命中）+ 反例（必须零误报）」，确保守卫本身不是空转。
 *
 * 覆盖四项审计结论（umpp-codebase-audit-2026-09-25 §P-E）：
 *  ① SPA 主题切换不再 `.theme-ready *` 一刀切全后代过渡；
 *  ② 不再残留 `transition: none !important` 的 reka-trigger 补丁（补丁存在本身
 *     就是原规则污染的自证）；
 *  ③ 全 src css/ts 注入样式零 `transition: all` 反模式（豁免须注释登记
 *     `motion-discipline-allow`）；
 *  ④ reduced-motion 覆盖 legacy 组合表 + sehuatang EFFECTS + toast + douban
 *     overlay/Shadow 域 + youtube/bilibili dimmer；
 *  ⑤ `umm-mount-fade` SPA 版与 Shadow 版逐字同源且纯 opacity（位移版会经
 *     fill-mode both 把动画宿主变成 fixed 后代的包含块——HeatmapCalendar 实锤陷阱）。
 */

const STYLE_CSS = readFileSync('src/libraries/styles/style.css', 'utf8');
const BASE_CSS = readFileSync('src/scenario/douban/styles/base.css', 'utf8');

/** 注释里会**引用**历史违规形态作史料（`.theme-ready *`），结构断言必须先剥注释。 */
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const STYLE_CSS_CODE = stripCssComments(STYLE_CSS);

// ────────────────────────────────────────────────────────────
// 通用小工具（纯文本级，无 CSS 解析依赖）
// ────────────────────────────────────────────────────────────

/** 抽取 `@keyframes NAME {…}` 主体（花括号配平），空白归一。 */
function keyframesBody(css: string, name: string): string | null {
  const at = css.indexOf(`@keyframes ${name}`);
  if (at < 0) return null;
  const start = css.indexOf('{', at);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0)
        return css
          .slice(start + 1, i)
          .replace(/\s+/g, ' ')
          .trim();
    }
  }
  return null;
}

/** 动画体是否含位移类属性（transform/translate/scale/rotate）。 */
const hasMotionProperty = (body: string) => /(transform|translate|scale|rotate)\s*[:(]/.test(body);

/** `transition: all` 反模式扫描（豁免 = 同行或上一行注释登记 motion-discipline-allow）。 */
const TRANSITION_ALL_RE = /transition:\s*all\b/i;
function findTransitionAll(text: string): number[] {
  const lines = text.split(/\r?\n/);
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (!TRANSITION_ALL_RE.test(line)) return;
    const exempt = `${lines[i]}${lines[i - 1] ?? ''}`.includes('motion-discipline-allow');
    if (!exempt) hits.push(i + 1);
  });
  return hits;
}

function walkSourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkSourceFiles(full, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// ① + ② SPA 主题过渡收窄
// ────────────────────────────────────────────────────────────

test.describe('SPA 主题切换过渡（style.css）', () => {
  test('① 不再存在 .theme-ready 后代通配过渡', () => {
    expect(STYLE_CSS_CODE).not.toMatch(
      /\.theme-ready\s+[\s\S]{0,80}?(\*::before|\*::after|[^*\w][\s>+~]+\*)/,
    );
    expect(STYLE_CSS_CODE).not.toContain('.theme-ready *');
    // 收窄后的规则确实存在：:where() 零特异性 + umm surface 工具类锚点
    // （引号/换行对格式器宽容：oxfmt 统一为单引号且允许折行）
    expect(STYLE_CSS_CODE).toMatch(/\.theme-ready\s+:where\(\s*body,\s*\[class\*=["']umm:bg-["']/);
  });

  test('① 夹具双向：通配形态必命中、收窄形态零误报', () => {
    const offender = `.theme-ready, .theme-ready *, .theme-ready *::before { transition: color .5s }`;
    const narrowed = `.theme-ready :where(body, [class*="umm:bg-"]) { transition: color .5s }`;
    expect(/\.theme-ready\s+\*/.test(offender)).toBe(true);
    expect(/\.theme-ready\s+\*/.test(narrowed)).toBe(false);
  });

  test('② reka-trigger !important 补丁已删除', () => {
    expect(STYLE_CSS_CODE).not.toMatch(/transition:\s*none\s*!important/);
    expect(STYLE_CSS_CODE).not.toContain('[data-reka-select-trigger]');
    expect(STYLE_CSS_CODE).not.toContain('[data-reka-dropdown-menu-trigger]');
    expect(STYLE_CSS_CODE).not.toContain('[data-reka-menubar-trigger]');
    // 历史史料注释必须还在（防止把「解释为什么」的注释一起误删）
    expect(STYLE_CSS).toContain('.theme-ready *');
  });
});

// ────────────────────────────────────────────────────────────
// ③ transition: all 反模式清零（全 src css/ts）
// ────────────────────────────────────────────────────────────

test.describe('transition: all 反模式正则守卫', () => {
  test('③ 夹具双向：裸 all 必命中、显式列表与登记豁免零误报', () => {
    const offender = `.x {\n  transition: all 0.2s ease;\n}`;
    const clean = `.x {\n  transition: background-color 0.2s ease, color 0.2s ease;\n}`;
    const waived = `/* motion-discipline-allow: 刻意全属性过渡 */\n.x { transition: all 0.2s ease; }`;
    expect(findTransitionAll(offender)).toEqual([2]);
    expect(findTransitionAll(clean)).toEqual([]);
    expect(findTransitionAll(waived)).toEqual([]);
  });

  test('③ 全 src css/ts 注入样式零违规', () => {
    const files = walkSourceFiles('src', ['.css', '.ts']);
    expect(files.length, 'src 下应扫到足量样式源文件').toBeGreaterThan(40);
    const violations: string[] = [];
    for (const f of files) {
      const hits = findTransitionAll(readFileSync(f, 'utf8'));
      for (const line of hits) violations.push(`${f}:${line}`);
    }
    expect(violations, `存在未显式化的 transition 声明：\n${violations.join('\n')}`).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// ④ reduced-motion 覆盖
// ────────────────────────────────────────────────────────────

test.describe('prefers-reduced-motion 覆盖', () => {
  test('④ legacy 组合表统一守卫：存在、作用域合规、任何非空子集必带', () => {
    expect(REDUCED_MOTION_STYLES).toContain('@media (prefers-reduced-motion: reduce)');
    expect(REDUCED_MOTION_STYLES).toContain('[class*="umm-"]');
    expect(REDUCED_MOTION_STYLES).toContain('[data-umm-]');
    expect(REDUCED_MOTION_STYLES).toContain('animation: none !important');
    expect(REDUCED_MOTION_STYLES).toContain('transition: none !important');
    // 全量组合与非空按需子集都必须带守卫
    expect(composeGlobalStyles()).toContain('prefers-reduced-motion');
    expect(composeGlobalStyles(['dimmer'])).toContain('prefers-reduced-motion');
    // 作用域纪律：不得引入裸 `*`（首复合选择器判据，镜像 scope:check 规则）
    const firstCompounds =
      REDUCED_MOTION_STYLES.replace(/\/\*[\s\S]*?\*\//g, '').match(/([^{}]+)\{/g) ?? [];
    for (const raw of firstCompounds) {
      for (const sel of raw.replace(/\{/, '').split(',')) {
        const first = sel.trim().split(/[\s>+~]+/)[0];
        if (!first || first.startsWith('@')) continue;
        expect(first.startsWith('*'), `裸通配选择器: ${sel.trim()}`).toBe(false);
      }
    }
  });

  test('④ 夹具双向：裸 * 守卫形态会被上述判据命中', () => {
    const offender = '@media (prefers-reduced-motion: reduce) { * { animation: none } }';
    const first = (offender.match(/([^{}]+)\{/g) ?? [])
      .flatMap((raw) => raw.replace(/\{/, '').split(','))
      .map((s) => s.trim().split(/[\s>+~]+/)[0]);
    expect(first).toContain('*');
  });

  test('④ sehuatang Shadow 域 EFFECTS 自带守卫且覆盖 copied-pop', () => {
    expect(EFFECTS_CSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(EFFECTS_CSS).toContain('.umm-magnet-link.umm-sht-copied');
    expect(SEHUATANG_OVERLAY_CSS).toContain('prefers-reduced-motion');
  });

  test('④ toast 独立注入自带守卫（background __showInlineToast 域无 legacy 组合表）', () => {
    expect(TOAST_CORE_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });

  test('④ douban overlay 早期壳（create-overlay SHADOW_CSS）自带守卫', () => {
    const src = readFileSync('src/scenario/douban/overlay/create-overlay.ts', 'utf8');
    expect(src).toContain('@media (prefers-reduced-motion: reduce){.ov-spinner{animation:none}');
  });

  test('④ youtube/bilibili 注入 dimmer CSS 自带守卫', () => {
    expect(readFileSync('src/entrypoints/content/ui/youtube-listing.ts', 'utf8')).toContain(
      'prefers-reduced-motion',
    );
    expect(readFileSync('src/entrypoints/content/ui/bilibili-listing.ts', 'utf8')).toContain(
      'prefers-reduced-motion',
    );
    expect(readFileSync('src/entrypoints/youtube-homepage.content/index.ts', 'utf8')).toContain(
      'prefers-reduced-motion',
    );
  });

  test('④ Douban Shadow base.css 既有全链守卫仍在（禁止回退）', () => {
    expect(BASE_CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

// ────────────────────────────────────────────────────────────
// ⑤ umm-mount-fade 两域同源收敛
// ────────────────────────────────────────────────────────────

test.describe('umm-mount-fade 同源纪律', () => {
  test('⑤ SPA 版与 Douban Shadow 版 keyframes 逐字一致（空白归一后）', () => {
    const spa = keyframesBody(STYLE_CSS, 'umm-mount-fade');
    const douban = keyframesBody(BASE_CSS, 'umm-mount-fade');
    expect(spa, 'style.css 缺 umm-mount-fade').not.toBeNull();
    expect(douban, 'base.css 缺 umm-mount-fade').not.toBeNull();
    expect(spa).toBe(douban);
  });

  test('⑤ 两版均纯 opacity，无位移属性（fill-mode both 包含块陷阱）', () => {
    for (const body of [
      keyframesBody(STYLE_CSS, 'umm-mount-fade'),
      keyframesBody(BASE_CSS, 'umm-mount-fade'),
    ]) {
      expect(body).not.toBeNull();
      expect(hasMotionProperty(body as string), `mount-fade 混入位移属性: ${body}`).toBe(false);
    }
  });

  test('⑤ 夹具双向：位移版必被 hasMotionProperty 命中，纯 opacity 版零误报', () => {
    expect(
      hasMotionProperty(' from { opacity: 0; transform: translateY(4px); } to { opacity: 1; }'),
    ).toBe(true);
    expect(hasMotionProperty(' from { opacity: 0; } to { opacity: 1; }')).toBe(false);
  });
});
