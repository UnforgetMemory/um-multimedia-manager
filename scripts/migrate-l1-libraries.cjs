#!/usr/bin/env node
/**
 * L1 · libraries 层物理归位（umpp W3 · ADR-026 D6）
 *
 * 搬移集合（旧 → 新，均在 src/ 下，@/ 别名解析不变）：
 *   src/utils            → src/libraries/utils
 *   src/config.ts        → src/libraries/config.ts
 *   src/shared/ui        → src/libraries/ui
 *   src/shared/styles    → src/libraries/styles
 *   src/shared/locales   → src/libraries/locales
 *   src/shared/plugins   → src/libraries/plugins
 *   src/shared/identity.ts → src/libraries/identity.ts
 *   src/shared/toast.ts  → src/libraries/toast.ts
 *
 * 改写两类导入：
 *   1) @/ 别名前缀重写（精确，仅命中上述子路径，不波及 shared 其余 feature 组件）
 *   2) 相对导入：解析到被搬文件/目录才重算相对路径（精确，不误伤无关 config 等）
 *
 * 另修正门禁脚本按字面路径读取的两处：
 *   scripts/check-design-tokens.cjs  (ds:check)
 *   scripts/check-i18n.js           (i18n:check)
 *
 * 用法：node scripts/migrate-l1-libraries.cjs [--dry]
 *   --dry  只打印计划，不执行 git mv / 不改写
 */
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')

// ---------- 搬移定义 ----------
const MOVES = [
  ['src/utils', 'src/libraries/utils', 'dir'],
  ['src/config.ts', 'src/libraries/config.ts', 'file'],
  ['src/shared/ui', 'src/libraries/ui', 'dir'],
  ['src/shared/styles', 'src/libraries/styles', 'dir'],
  ['src/shared/locales', 'src/libraries/locales', 'dir'],
  ['src/shared/plugins', 'src/libraries/plugins', 'dir'],
  ['src/shared/identity.ts', 'src/libraries/identity.ts', 'file'],
  ['src/shared/toast.ts', 'src/libraries/toast.ts', 'file'],
]

// 旧前缀 → 新前缀（用于相对导入的目录级映射）
const DIR_MAP = {
  'src/utils': 'src/libraries/utils',
  'src/shared/ui': 'src/libraries/ui',
  'src/shared/styles': 'src/libraries/styles',
  'src/shared/locales': 'src/libraries/locales',
  'src/shared/plugins': 'src/libraries/plugins',
}

// ---------- 收集被搬文件 oldAbs → newAbs ----------
function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(abs))
    else out.push(abs)
  }
  return out
}

const MOVED = new Map() // oldAbs → newAbs
for (const [from, to, type] of MOVES) {
  const fromAbs = path.join(ROOT, from)
  const toAbs = path.join(ROOT, to)
  if (type === 'dir') {
    for (const f of walk(fromAbs)) {
      const rel = path.relative(fromAbs, f)
      MOVED.set(f, path.join(toAbs, rel))
    }
  } else {
    MOVED.set(fromAbs, toAbs)
  }
}

// 反向：newAbs → oldAbs（用于求文件的「旧位置」以解析其相对导入）
const OLD_OF = new Map()
for (const [k, v] of MOVED) OLD_OF.set(v, k)

// ---------- 导入提取（与守卫一致） ----------
const SPEC_RES = [
  /(?:from|import)\s*(?:type\s*)?\(?\s*['"]([^'"]+)['"]/g,
  /(?:from|import)\s*(?:type\s*)?\(?\s*`([^`$]+)`/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]

function extractSpecs(code) {
  const out = []
  for (const re of SPEC_RES) for (const m of code.matchAll(re)) out.push(m[1])
  return out
}

// @/ 别名前缀重写映射（带边界：仅后接 / 或引号 才替换，防止误伤）
const ALIAS_REWRITES = [
  ['@/utils', '@/libraries/utils'],
  ['@/config', '@/libraries/config'],
  ['@/shared/ui', '@/libraries/ui'],
  ['@/shared/styles', '@/libraries/styles'],
  ['@/shared/locales', '@/libraries/locales'],
  ['@/shared/plugins', '@/libraries/plugins'],
  ['@/shared/identity', '@/libraries/identity'],
  ['@/shared/toast', '@/libraries/toast'],
]

function rewriteAlias(spec) {
  for (const [from, to] of ALIAS_REWRITES) {
    // 精确子路径：from 后必须紧跟 '/' 或 引号（结束），否则不替换
    const re = new RegExp('^' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=/|["\'])')
    if (re.test(spec)) return spec.replace(re, to)
  }
  return spec
}

// 相对导入：给定「文件旧绝对路径」与其目录，解析 spec 到旧绝对路径；若落在被搬集 → 重算到新绝对路径并转回相对
function resolveRelative(oldFileAbs, spec) {
  // 去掉 query/hash
  const clean = spec.replace(/[?#].*$/, '')
  const oldTargetAbs = path.resolve(path.dirname(oldFileAbs), clean)
  let newTargetAbs = null
  if (MOVED.has(oldTargetAbs)) {
    newTargetAbs = MOVED.get(oldTargetAbs)
  } else {
    // 目录级：旧目标是否在被搬目录下
    for (const [oldDir, newDir] of Object.entries(DIR_MAP)) {
      const oldDirAbs = path.join(ROOT, oldDir)
      if (oldTargetAbs === oldDirAbs || oldTargetAbs.startsWith(oldDirAbs + path.sep)) {
        newTargetAbs = path.join(ROOT, newDir, path.relative(oldDirAbs, oldTargetAbs))
        break
      }
    }
  }
  if (!newTargetAbs) return null // 未指向被搬目标，不改
  // 重算相对：从「文件新位置」的目录 → 新目标
  const newFileAbs = OLD_OF.has(oldFileAbs) ? OLD_OF.get(oldFileAbs) : oldFileAbs
  let rel = path.relative(path.dirname(newFileAbs), newTargetAbs).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = './' + rel
  // 保留原 query/hash（如有）
  const tail = spec.replace(/^[?#].*$/, '')
  return rel + (spec.length > clean.length ? spec.slice(clean.length) : '')
}

// ---------- 改写所有源文件（含 tests） ----------
const SOURCE_RE = /\.(ts|tsx|vue|css|js|mjs|cjs)$/
function collectSources() {
  const dirs = [path.join(ROOT, 'src'), path.join(ROOT, 'tests')]
  const out = []
  for (const d of dirs) {
    const stack = [d]
    while (stack.length) {
      const cur = stack.pop()
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const abs = path.join(cur, e.name)
        if (e.isDirectory()) stack.push(abs)
        else if (SOURCE_RE.test(e.name) && !e.name.endsWith('.d.ts')) out.push(abs)
      }
    }
  }
  return out
}

const sources = collectSources()
let changedFiles = 0
let aliasEdits = 0
let relEdits = 0

for (const fileAbs of sources) {
  const code = fs.readFileSync(fileAbs, 'utf8')
  let newCode = code
  // 逐处替换：用正则定位完整 import 语句片段较繁，这里按 spec 命中做字符串替换
  // 策略：对每个提取到的 spec，若需改写，则把代码中该 spec 字面值替换（带引号上下文）
  const specs = extractSpecs(code)
  for (const spec of specs) {
    let next = null
    if (spec.startsWith('@/')) next = rewriteAlias(spec)
    else if (spec.startsWith('.')) {
      const oldFileAbs = OLD_OF.has(fileAbs) ? OLD_OF.get(fileAbs) : fileAbs
      next = resolveRelative(oldFileAbs, spec)
    }
    if (next && next !== spec) {
      // 替换代码中所有该 spec 的字面出现（带引号）：'spec' "spec" `spec`
      const esc = spec.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&')
      const re = new RegExp('([\'"`])' + esc + '([\'"`])', 'g')
      const before = newCode
      newCode = newCode.replace(re, (_m, q1, q2) => q1 + next + q2)
      if (newCode !== before) {
        if (spec.startsWith('@/')) aliasEdits++
        else relEdits++
      }
    }
  }
  if (newCode !== code) {
    changedFiles++
    if (!DRY) fs.writeFileSync(fileAbs, newCode)
  }
}

// ---------- 门禁脚本字面路径修正 ----------
const gatePatches = [
  {
    file: 'scripts/check-design-tokens.cjs',
    reps: [
      ['src/shared/styles/tokens.static.css', 'src/libraries/styles/tokens.static.css'],
      ['src/shared/styles/style.css', 'src/libraries/styles/style.css'],
    ],
  },
  {
    file: 'scripts/check-i18n.js',
    reps: [['../src/shared/locales', '../src/libraries/locales']],
  },
  {
    file: 'scripts/check-architecture.cjs',
    reps: [
      ['src/utils/zip-utils.ts', 'src/libraries/utils/zip-utils.ts'],
    ],
  },
]
let gateEdits = 0
for (const { file, reps } of gatePatches) {
  const abs = path.join(ROOT, file)
  if (!fs.existsSync(abs)) continue
  let c = fs.readFileSync(abs, 'utf8')
  let changed = false
  for (const [from, to] of reps) {
    if (c.includes(from)) { c = c.split(from).join(to); changed = true; gateEdits++ }
  }
  if (changed) {
    if (!DRY) fs.writeFileSync(abs, c)
    changedFiles++
  }
}

// ---------- 执行 git mv ----------
let mvCount = 0
if (!DRY) {
  for (const [from, to] of MOVES) {
    const fromAbs = path.join(ROOT, from)
    const toAbs = path.join(ROOT, to)
    if (!fs.existsSync(fromAbs)) continue
    fs.mkdirSync(path.dirname(toAbs), { recursive: true })
    execSync(`git mv "${fromAbs}" "${toAbs}"`, { cwd: ROOT, stdio: 'pipe' })
    mvCount++
  }
}

// ---------- 报告 ----------
console.log(`\n=== L1 migrate ${DRY ? '(DRY RUN)' : '(EXECUTED)'} ===`)
console.log(`files moved (git mv):     ${MOVES.length} source entries`)
console.log(`files in moved set:       ${MOVED.size}`)
console.log(`@/ alias edits:           ${aliasEdits}`)
console.log(`relative import edits:    ${relEdits}`)
console.log(`gate-script path edits:   ${gateEdits}`)
console.log(`total changed files:      ${changedFiles}`)
if (DRY) {
  console.log('\n--- moved entry map ---')
  for (const [from, to] of MOVES) console.log(`  ${from}  →  ${to}`)
}
