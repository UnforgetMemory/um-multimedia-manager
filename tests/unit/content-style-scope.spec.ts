import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import {
  FOCUS_VISIBLE_STYLES,
  SCROLLBAR_STYLES,
} from '@/entrypoints/content/styles/component-styles'

/**
 * ADR-026 D7 守卫 —— legacy 内容样式表**注入宿主页面**（非 Shadow DOM），
 * 因此任何「不受 `umm-` 类约束」的规则都会改写第三方站点。
 *
 * 本 spec 不重复实现扫描逻辑，而是**驱动真实门禁脚本**
 * （`scripts/check-content-style-scope.cjs`，同 arch/ds/i18n 并列进 CI `Static Gates`），
 * 以保证「本地测到的」与「CI 拦到的」是同一份实现。
 *
 * 背景（实测证据，2026-09-26）：修复前 composed 表含 8 个裸选择器——
 *   - 宿主页 `button` / `a` / `input` / 可滚动 `div` 全部被画上 2px 实线焦点环
 *   - 宿主页 `<html>` 与所有滚动容器的 `scrollbar-width` 计算值均为 `thin`
 */

const SCRIPT = 'scripts/check-content-style-scope.cjs'
const run = (args: string[]) =>
  execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

test.describe('legacy 内容样式作用域守卫（ADR-026 D7）', () => {
  test('门禁脚本 exit 0，且 JSON 报告零泄漏', () => {
    const report = JSON.parse(run(['--json'])) as {
      violations: Array<{ file: string; block: string; selector: string }>
      scanned: Array<{ block: string; leaks?: number; skipped?: boolean }>
    }
    expect(
      report.violations,
      `存在不受 \`umm-\` 类约束的选择器：\n${report.violations.map((v) => `  ${v.file} [${v.block}] ${v.selector}`).join('\n')}`,
    ).toEqual([])
    // 扫描确实覆盖了两个修复目标块
    const blocks = report.scanned.map((s) => s.block)
    expect(blocks).toContain('FOCUS_VISIBLE_STYLES')
    expect(blocks).toContain('SCROLLBAR_STYLES')
  })

  test('扫描器自检（双向）：识别全部泄漏形态且不误报受约束形态', () => {
    expect(run(['--self-test'])).toContain('识别 8/8 泄漏形态，受约束形态零误报')
  })

  test('焦点环作用域化为元素自身的 umm- 类，且保留原有显式控件类', () => {
    expect(FOCUS_VISIBLE_STYLES).toContain('[class*="umm-"]:focus-visible')
    // 显式控件类保留（特异性高于通配，行为与修复前一致）
    for (const cls of [
      '.umm-dl-trigger',
      '.umm-pill-btn',
      '.umm-island-nav-link',
      '.umm-search-submit',
      '.umm-island-submit',
      '.umm-page-link',
      '.umm-page-go',
    ]) {
      expect(FOCUS_VISIBLE_STYLES).toContain(`${cls}:focus-visible`)
    }
  })

  test('滚动条作用域化为元素自身的 umm- 类', () => {
    expect(SCROLLBAR_STYLES).toContain('[class*="umm-"]::-webkit-scrollbar')
    expect(SCROLLBAR_STYLES).toContain('[class*="umm-"]::-webkit-scrollbar-track')
    expect(SCROLLBAR_STYLES).toContain('[class*="umm-"]::-webkit-scrollbar-thumb')
    expect(SCROLLBAR_STYLES).toMatch(/\[class\*="umm-"\]\s*\{[^}]*scrollbar-width:\s*thin/)
  })
})
