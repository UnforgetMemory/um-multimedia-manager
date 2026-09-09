import { test, expect } from '@playwright/test'
import { THEME_VARS, THEME_VARS_DARK, UI_COMPONENT_STYLES } from '@/entrypoints/content/styles/global'

/**
 * Layer 3 主题动态适配令牌回归测试。
 *
 * 统一适配纪律：usl 变量链 = var(--usl-*, var(--umm-*, 旧 fallback))——
 * usl 已注入的页面（色花堂等）吃双主题令牌，未注入的旧站点行为不变。
 * 面板/输入/按钮/标签禁止出现裸 hex 声明（只在 var() fallback 内保留旧值）。
 */

const BARE_HEX_DECL_RE = /(?:background|color|border[^;]*):\s*#[0-9a-fA-F]{3,8}\s*(?:;|$)/g

test.describe('THEME_VARS / THEME_VARS_DARK — 双主题状态令牌', () => {
  test('亮色面：表面/文本/accent/状态文字令牌齐备', () => {
    expect(THEME_VARS).toContain('--usl-surface: #f7f9fc')
    expect(THEME_VARS).toContain('--usl-surface-raised: #ffffff')
    expect(THEME_VARS).toContain('--usl-text-primary: #151a23')
    expect(THEME_VARS).toContain('--usl-accent: #3a55ec')
    expect(THEME_VARS).toContain('--usl-text-done: #047857')
    expect(THEME_VARS).toContain('--usl-text-none: #b91c1c')
  })

  test('暗色翻转：html[data-umm-theme="dark"] 选择器 + 暗面值', () => {
    expect(THEME_VARS_DARK).toContain('html[data-umm-theme="dark"]')
    expect(THEME_VARS_DARK).toContain('--usl-surface: #1c1c1e')
    expect(THEME_VARS_DARK).toContain('--usl-surface-raised: #1f2531')
    expect(THEME_VARS_DARK).toContain('--usl-text-primary: #eaeef5')
    expect(THEME_VARS_DARK).toContain('--usl-accent: #7e9bf9')
    expect(THEME_VARS_DARK).toContain('--usl-text-done: #6ee7b7')
    expect(THEME_VARS_DARK).toContain('--usl-text-none: #fca5a5')
  })

  test('明暗配对完整性：两表同键翻转（抽查 5 组角色）', () => {
    for (const key of ['--usl-surface', '--usl-surface-raised', '--usl-text-primary', '--usl-accent', '--usl-text-done']) {
      expect(THEME_VARS).toContain(`${key}: `)
      expect(THEME_VARS_DARK).toContain(`${key}: `)
    }
  })
})

test.describe('UI_COMPONENT_STYLES — usl 变量链 + 旧 fallback 保底', () => {
  test('面板/输入/按钮/标题/标签全部接入 usl 链且保留旧 fallback', () => {
    expect(UI_COMPONENT_STYLES).toContain('background: var(--usl-surface-raised, var(--umm-bg, #ffffff));')
    expect(UI_COMPONENT_STYLES).toContain('border: 1px solid var(--usl-border, var(--umm-border, #e3e8f0));')
    expect(UI_COMPONENT_STYLES).toContain('background: var(--usl-surface, var(--umm-bg-secondary, #f7f9fc));')
    expect(UI_COMPONENT_STYLES).toContain('color: var(--usl-text-primary, var(--umm-text-primary, #151a23));')
    expect(UI_COMPONENT_STYLES).toContain('background: var(--usl-fill-primary, var(--umm-link, #3a55ec));')
    expect(UI_COMPONENT_STYLES).toContain('color: var(--usl-ink-on-fill, var(--umm-bg, #ffffff));')
    expect(UI_COMPONENT_STYLES).toContain('background: var(--usl-surface-hover, var(--umm-bg-secondary, #f7f9fc));')
    expect(UI_COMPONENT_STYLES).toContain('color: var(--usl-text-secondary, var(--umm-text-secondary, #4d5870));')
    expect(UI_COMPONENT_STYLES).toContain('color: var(--usl-accent, var(--umm-link, #3a55ec));')
    expect(UI_COMPONENT_STYLES).toContain('color: var(--usl-text-muted, var(--umm-text-muted, #94a0b5));')
  })

  test('主题过渡存在（动态切换平滑）', () => {
    expect(UI_COMPONENT_STYLES).toContain('transition: background-color 0.3s ease')
  })

  test('禁止裸 hex 声明：所有 hex 只在 var() fallback 内', () => {
    const matches = UI_COMPONENT_STYLES.match(BARE_HEX_DECL_RE) ?? []
    expect(matches).toEqual([])
  })

  test('旧站点保底：fallback 链保留 --umm-* 原始值（未注入 usl 处行为不变）', () => {
    expect(UI_COMPONENT_STYLES).toContain('var(--umm-bg, #ffffff)')
    expect(UI_COMPONENT_STYLES).toContain('var(--umm-bg-secondary, #f7f9fc)')
    expect(UI_COMPONENT_STYLES).toContain('var(--umm-link, #3a55ec)')
  })
})
