import { test, expect } from '@playwright/test';
import { ALL_GLOBAL_STYLE_BLOCKS, composeGlobalStyles } from '@/entrypoints/content/styles/global';

/**
 * X5 按需加载/包体波：injectGlobalStyles 按需子集 API（选择逻辑）断言。
 *
 * 冻结：默认全量语义不变（兼容 douban-bridge / sehuatang / legacy 缺省调用）、
 * 空子集 = 零注入、theme-vars 自动前置、glow-vars 仅随 neodb-button 出现、
 * 输出顺序恒等于 ALL_GLOBAL_STYLE_BLOCKS 规范序。
 */

/** 每块的独有标记（类名或变量名），用于存在性断言。 */
const BLOCK_MARKERS: Record<(typeof ALL_GLOBAL_STYLE_BLOCKS)[number], string> = {
  'theme-vars': '--umm-surface:',
  'glow-vars': '--umm-neodb-glow-base:',
  'status-chip': '.umm-status-chip',
  'list-status': '.umm-list-status',
  'neodb-button': '.umm-neodb-btn',
  dimmer: '.umm-dimmed',
  'homepage-badge': '.umm-homepage-badge',
  'ui-component': '.umm-panel-title',
  'focus-visible': ':focus-visible',
  scrollbar: '::-webkit-scrollbar',
  'reviews-badge': '.umm-status--wish',
  'reduced-motion': '@media (prefers-reduced-motion: reduce)',
};

test.describe('injectGlobalStyles 按需子集 API', () => {
  test('缺省 = 全量：12 块标记齐备', () => {
    const all = composeGlobalStyles();
    for (const marker of Object.values(BLOCK_MARKERS)) {
      expect(all).toContain(marker);
    }
  });

  test('显式全量列表与缺省输出内容一致（trim 级）', () => {
    expect(composeGlobalStyles(ALL_GLOBAL_STYLE_BLOCKS).trim()).toBe(composeGlobalStyles().trim());
  });

  test('空子集 = 零注入（javdb 路由形态）', () => {
    expect(composeGlobalStyles([])).toBe('');
  });

  test('reduced-motion 守卫随一切非空子集自动带上（a11y 不可按需省略）', () => {
    expect(composeGlobalStyles(['dimmer'])).toContain(BLOCK_MARKERS['reduced-motion']);
    expect(composeGlobalStyles(['status-chip'])).toContain(BLOCK_MARKERS['reduced-motion']);
  });

  test('PT 子集：dimmer/focus/scrollbar + 自动前置 theme-vars，徽章类不进', () => {
    const pt = composeGlobalStyles(['dimmer', 'focus-visible', 'scrollbar']);
    expect(pt).toContain(BLOCK_MARKERS['dimmer']);
    expect(pt).toContain(BLOCK_MARKERS['focus-visible']);
    expect(pt).toContain(BLOCK_MARKERS['scrollbar']);
    expect(pt).toContain(BLOCK_MARKERS['theme-vars']);
    expect(pt).not.toContain(BLOCK_MARKERS['status-chip']);
    expect(pt).not.toContain(BLOCK_MARKERS['homepage-badge']);
    expect(pt).not.toContain(BLOCK_MARKERS['glow-vars']);
  });

  test('glow-vars 仅随 neodb-button 自动补入', () => {
    expect(composeGlobalStyles(['neodb-button'])).toContain(BLOCK_MARKERS['glow-vars']);
    expect(composeGlobalStyles(['dimmer'])).not.toContain(BLOCK_MARKERS['glow-vars']);
  });

  test('顺序恒定：子集输出仍按规范序（theme-vars 最先）', () => {
    const subset = composeGlobalStyles(['scrollbar', 'status-chip', 'theme-vars']);
    const idxSurface = subset.indexOf(BLOCK_MARKERS['theme-vars']);
    const idxChip = subset.indexOf(BLOCK_MARKERS['status-chip']);
    const idxScrollbar = subset.indexOf('scrollbar-width');
    expect(idxSurface).toBeGreaterThanOrEqual(0);
    expect(idxSurface).toBeLessThan(idxChip);
    expect(idxChip).toBeLessThan(idxScrollbar);
  });

  test('子集严格小于全量（运行时 CSSOM 收益可度量）', () => {
    const full = composeGlobalStyles();
    const pt = composeGlobalStyles(['dimmer', 'focus-visible', 'scrollbar']);
    const javdb = composeGlobalStyles([]);
    expect(pt.length).toBeLessThan(full.length);
    expect(javdb.length).toBe(0);
  });
});
