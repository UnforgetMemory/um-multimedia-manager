#!/usr/bin/env node
/**
 * 样式作用域守卫 —— legacy 内容样式表注入**宿主页面**（非 Shadow DOM），
 * 因此任何「不受 `umm-` 类约束」的规则都会改写第三方站点。
 *
 * 背景（实测证据，2026-09-26・ADR-026 D7）：修复前 composed 表含 8 个裸选择器，导致
 *   - 宿主页 `button` / `a` / `input` / 可滚动 `div` 全部被画上 2px 实线焦点环
 *   - 宿主页 `<html>` 与所有滚动容器的 `scrollbar-width` 计算值均为 `thin`
 * 修复方式：一律以「元素自身的 `umm-` 类」为作用域。
 *
 * 本守卫把该约束变成 CI 可拦项。守卫自身经双向断言验证：
 *   - `--self-test` 断言扫描器能识别全部泄漏形态，且不误报受约束形态
 *   - 变异测试（人工）：把 `[class*="umm-"]::-webkit-scrollbar` 改回 `*::-webkit-scrollbar`
 *     即 exit 1
 *
 * Usage: node scripts/check-content-style-scope.cjs [--json] [--self-test]
 *   exit 1 on any violation
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

/** 扫描目标：legacy 内容样式模块 */
const FILES = [
  'src/entrypoints/content/styles/component-styles.ts',
  'src/entrypoints/content/styles/badge-styles.ts',
  'src/entrypoints/content/styles/global.ts',
]

/** 有意作用于宿主 `<html>` 的块：CSS 自定义属性的唯一继承锚点。 */
const INTENTIONAL_HTML_SCOPED = ['THEME_VARS', 'THEME_VARS_DARK', 'GLOW_VARS']

/**
 * 扫描出「会泄漏到宿主页」的选择器。
 *
 * 判据只看**首个复合选择器**（到第一个组合符/空白为止）——它决定该规则的作用
 * 对象是否受限。泄漏形态：`*…` / 裸伪类 `:x` / 裸伪元素 `::x` / 裸标签名；
 * 安全形态：`[class*="umm-"]…` / `.umm-…` / `#id` / `[data-…]`。
 */
function leakingSelectors(css) {
  const out = []
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')

  for (const m of src.matchAll(/([^{}]+)\{/g)) {
    const selectorList = m[1].trim()
    if (!selectorList || selectorList.startsWith('@')) continue

    for (const raw of selectorList.split(',')) {
      const sel = raw.trim()
      if (!sel) continue
      // @keyframes 的 `from` / `to` / `50%` 不是选择器
      if (/^(from|to|\d+(?:\.\d+)?%)$/.test(sel)) continue

      const first = sel.split(/[\s>+~]+/)[0]
      if (
        first.startsWith('*') ||
        /^:(?!:)/.test(first) ||
        first.startsWith('::') ||
        /^[a-z][a-z0-9-]*/i.test(first)
      ) {
        out.push(sel)
      }
    }
  }
  return out
}

/** 从 TS 模块中抽取 `export const NAME = \`...\`` 块（含非导出的 `const NAME = \``）
 *
 * `\${...}` 插值的 `{` 会被下游的「文本 + `{`」规则误判为规则块起始，故先替换为
 * 无花括号的占位符——等价于运行时求值后的 CSS 文本。 */
function extractBlocks(source) {
  const blocks = []
  const re = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*`([\s\S]*?)`/g
  for (const m of source.matchAll(re)) {
    blocks.push({ name: m[1], css: m[2].replace(/\$\{[^{}]*\}/g, '0') })
  }
  return blocks
}

function scan() {
  const violations = []
  const scanned = []

  for (const rel of FILES) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    for (const { name, css } of extractBlocks(source)) {
      if (INTENTIONAL_HTML_SCOPED.includes(name)) {
        scanned.push({ file: rel, block: name, skipped: true })
        continue
      }
      // 仅扫描实际被组合进 ALL_STYLES 的样式块（其余为无 CSS 内容的常量表）
      if (!/\{/.test(css)) {
        scanned.push({ file: rel, block: name, skipped: true })
        continue
      }
      const leaks = leakingSelectors(css)
      scanned.push({ file: rel, block: name, leaks: leaks.length })
      for (const sel of leaks) violations.push({ file: rel, block: name, selector: sel })
    }
  }
  return { violations, scanned }
}

function selfTest() {
  const leakFixture = `
    * { a: b }
    *::-webkit-scrollbar { a: b }
    :focus-visible { a: b }
    ::selection { a: b }
    button:focus-visible { a: b }
    html { a: b }
    div span { a: b }
    .umm-ok, * { a: b }
  `
  const cleanFixture = `
    [class*="umm-"]::-webkit-scrollbar { a: b }
    [class*="umm-"]:focus-visible { a: b }
    .umm-panel > span { a: b }
    .umm-status[data-status="done"] { a: b }
    #umm-toast { a: b }
    @media (min-width: 900px) { .umm-panel { a: b } }
    @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
  `
  const expectedLeaks = [
    '*',
    '*::-webkit-scrollbar',
    ':focus-visible',
    '::selection',
    'button:focus-visible',
    'html',
    'div span',
    '*',
  ]
  const gotLeaks = leakingSelectors(leakFixture)
  const gotClean = leakingSelectors(cleanFixture)

  const ok =
    JSON.stringify(gotLeaks) === JSON.stringify(expectedLeaks) && gotClean.length === 0

  if (!ok) {
    console.error('self-test FAILED')
    console.error('  expected leaks:', JSON.stringify(expectedLeaks))
    console.error('  actual leaks  :', JSON.stringify(gotLeaks))
    console.error('  false positives:', JSON.stringify(gotClean))
  } else {
    console.log('self-test ok — 识别 8/8 泄漏形态，受约束形态零误报')
  }
  return ok
}

module.exports = { leakingSelectors, extractBlocks, scan, selfTest, FILES, INTENTIONAL_HTML_SCOPED }

if (require.main !== module) return

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() ? 0 : 1)
}

const json = process.argv.includes('--json')
const { violations, scanned } = scan()

if (json) {
  process.stdout.write(JSON.stringify({ violations, scanned }, null, 2) + '\n')
} else {
  console.log('样式作用域守卫（legacy 内容样式注入宿主页面）')
  for (const s of scanned) {
    console.log(
      `  ${s.skipped ? '-' : s.leaks === 0 ? 'ok' : 'FAIL'}  ${s.block}${s.skipped ? ' (豁免/无 CSS)' : `: ${s.leaks} 条泄漏`}`,
    )
  }
  if (violations.length) {
    console.log('\n❌ 发现不受 `umm-` 类约束的选择器，会改写宿主页面：')
    for (const v of violations) console.log(`   ${v.file} [${v.block}]  ${v.selector}`)
    console.log('\n修复：加 `[class*="umm-"]` 前缀，或改用显式 `.umm-*` 类。')
    console.log('（确需作用于宿主页的，须在此脚本的 INTENTIONAL_HTML_SCOPED 显式登记）')
  } else {
    console.log('\n✅ 样式作用域守卫：PASS')
  }
}

process.exit(violations.length ? 1 : 0)
