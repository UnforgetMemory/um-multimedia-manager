#!/usr/bin/env node
/**
 * L2 · engine 层物理归位（umpp W3 · ADR-026 D6）
 *
 * 仅搬移 features/ 下 5 个 engine 子目录（其余 5 个 features 子目录留待 L3/L5）：
 *   src/features/database       → src/engine/database
 *   src/features/cache          → src/engine/cache
 *   src/features/migration      → src/engine/migration
 *   src/features/data-scheduler → src/engine/data-scheduler
 *   src/features/settings       → src/engine/settings
 *
 * 改写 @/ 别名前缀（选择性，仅命中上述 5 个子路径；不波及 features/webdav 等 provider 子目录）：
 *   @/features/database       → @/engine/database
 *   @/features/cache          → @/engine/cache
 *   @/features/migration      → @/engine/migration
 *   @/features/data-scheduler → @/engine/data-scheduler
 *   @/features/settings       → @/engine/settings
 *
 * 相对导入：实测 src 内 0 处相对引用 engine 子目录（均经 @/ 别名），故相对修复为安全 no-op；
 * 仍保留 post-mv 相对修复逻辑以覆盖跨子树相对引用边界 case。
 *
 * 幂等：所有读写均经 effPath 解析到「当前」磁盘路径，可安全重跑（Phase A/Phase B 已应用则 no-op）。
 *
 * 门禁脚本改动（不在本脚本内，须手动 Edit，见下方 NOTE）：
 *   - scripts/check-architecture.cjs  LAYER_RULES：5 条 features/<x>→engine 改为 ['engine','engine']
 *                                     DB_INTERNAL_PATHS + E2 消息：features/database → engine/database
 *   - tests/unit/architecture-guard.spec.ts 合成夹具：features/database→engine/database、features/migration→engine/migration
 *
 * 用法：node scripts/migrate-l2-engine.cjs [--dry]
 */
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const DRY = process.argv.includes('--dry')

// ---------- 搬移定义（仅 5 个 engine 子目录）----------
const MOVES = [
  ['src/features/database', 'src/engine/database', 'dir'],
  ['src/features/cache', 'src/engine/cache', 'dir'],
  ['src/features/migration', 'src/engine/migration', 'dir'],
  ['src/features/data-scheduler', 'src/engine/data-scheduler', 'dir'],
  ['src/features/settings', 'src/engine/settings', 'dir'],
]

// 旧前缀 → 新前缀（用于相对导入的目录级映射）
const DIR_MAP = {
  'src/features/database': 'src/engine/database',
  'src/features/cache': 'src/engine/cache',
  'src/features/migration': 'src/engine/migration',
  'src/features/data-scheduler': 'src/engine/data-scheduler',
  'src/features/settings': 'src/engine/settings',
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

const MOVED = new Map() // oldAbs → newAbs（已搬则补 new→new 恒等项，保证幂等）
for (const [from, to, type] of MOVES) {
  const fromAbs = path.join(ROOT, from)
  const toAbs = path.join(ROOT, to)
  const srcAbs = fs.existsSync(fromAbs) ? fromAbs : toAbs // 已搬则基于新位置
  if (type === 'dir') {
    for (const f of walk(srcAbs)) {
      const rel = path.relative(srcAbs, f)
      const oldA = path.join(fromAbs, rel)
      const newA = path.join(toAbs, rel)
      MOVED.set(oldA, newA)
      if (srcAbs === toAbs) MOVED.set(newA, newA) // 已搬：补恒等项
    }
  } else {
    MOVED.set(fromAbs, toAbs)
    if (srcAbs === toAbs) MOVED.set(toAbs, toAbs)
  }
}

/** 解析到「当前」磁盘路径：优先存在者；不存在则查 MOVED 反推新位置（幂等重跑安全）。 */
function effPath(p) {
  if (fs.existsSync(p)) return p
  for (const [oldA, newA] of MOVED) if (oldA === p) return newA
  return p
}

// ---------- 导入提取（与守卫一致）----------
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

// @/ 别名前缀重写映射（选择性：仅命中 5 个 engine 子路径）
const ALIAS_REWRITES = [
  ['@/features/database', '@/engine/database'],
  ['@/features/cache', '@/engine/cache'],
  ['@/features/migration', '@/engine/migration'],
  ['@/features/data-scheduler', '@/engine/data-scheduler'],
  ['@/features/settings', '@/engine/settings'],
]
function rewriteAlias(spec) {
  for (const [from, to] of ALIAS_REWRITES) {
    // 边界：from 后必须紧跟 '/' 或 引号 或 行尾（修复裸别名漏改写）
    const re = new RegExp('^' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=/|["\']|$)')
    if (re.test(spec)) return spec.replace(re, to)
  }
  return spec
}

function existsLike(p) {
  if (fs.existsSync(p)) return true
  for (const ext of ['.ts', '.tsx', '.vue', '.js', '.mjs', '.cjs']) {
    if (fs.existsSync(p + ext)) return true
  }
  if (fs.existsSync(path.join(p, 'index.ts'))) return true
  if (fs.existsSync(path.join(p, 'index.tsx'))) return true
  return false
}

// 相对导入修复（基于当前文件位置）：当前可解析 → 不动；断裂 → 经旧位置重算
function fixRelative(fileAbs, spec) {
  const clean = spec.replace(/[?#].*$/, '')
  const dir = path.dirname(fileAbs)
  const currentTarget = path.resolve(dir, clean)
  if (existsLike(currentTarget)) return null // 当前可解析 → 不动
  // 反推文件的旧位置，求旧目标
  let oldFileAbs = fileAbs
  for (const [oldA, newA] of MOVED) if (newA === fileAbs) { oldFileAbs = oldA; break }
  const oldDir = path.dirname(oldFileAbs)
  const oldTarget = path.resolve(oldDir, clean)
  let newTarget = null
  if (MOVED.has(oldTarget)) newTarget = MOVED.get(oldTarget)
  else {
    for (const [oldDir2, newDir2] of Object.entries(DIR_MAP)) {
      const oa = path.join(ROOT, oldDir2)
      if (oldTarget === oa || oldTarget.startsWith(oa + path.sep)) {
        newTarget = path.join(ROOT, newDir2, path.relative(oa, oldTarget))
        break
      }
    }
    if (!newTarget) newTarget = oldTarget
  }
  let rel = path.relative(dir, newTarget).replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

// ---------- 改写所有源文件（src + tests）----------
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
let aliasEdits = 0
let relEdits = 0
let changedFiles = 0

// 阶段 A：@/ 别名重写（位置无关；幂等：已重写则 no-op）
for (const fileAbs of sources) {
  const cur = effPath(fileAbs)
  const code = fs.readFileSync(cur, 'utf8')
  let newCode = code
  for (const spec of extractSpecs(code)) {
    if (!spec.startsWith('@/')) continue
    const next = rewriteAlias(spec)
    if (next && next !== spec) {
      const esc = spec.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&')
      const re = new RegExp('([\'"`])' + esc + '([\'"`])', 'g')
      const before = newCode
      newCode = newCode.replace(re, (_m, q1, q2) => q1 + next + q2)
      if (newCode !== before) aliasEdits++
    }
  }
  if (newCode !== code) {
    changedFiles++
    if (!DRY) fs.writeFileSync(cur, newCode)
  }
}

// ---------- 执行 git mv（已搬则跳过）----------
let mvCount = 0
if (!DRY) {
  for (const [from, to] of MOVES) {
    const fromAbs = path.join(ROOT, from)
    const toAbs = path.join(ROOT, to)
    if (!fs.existsSync(fromAbs)) continue // 已搬 → 跳过（幂等）
    fs.mkdirSync(path.dirname(toAbs), { recursive: true })
    execSync(`git mv "${fromAbs}" "${toAbs}"`, { cwd: ROOT, stdio: 'pipe' })
    mvCount++
  }
}

// 阶段 B：相对导入修复（post-mv，基于当前位置；幂等）
if (!DRY) {
  for (const fileAbs of sources) {
    const cur = effPath(fileAbs)
    if (!fs.existsSync(cur)) continue
    const code = fs.readFileSync(cur, 'utf8')
    let newCode = code
    for (const spec of extractSpecs(code)) {
      if (!spec.startsWith('.')) continue
      const next = fixRelative(cur, spec)
      if (next && next !== spec) {
        const esc = spec.replace(/[.*+?^${}()|[\]\\`]/g, '\\$&')
        const re = new RegExp('([\'"`])' + esc + '([\'"`])', 'g')
        const before = newCode
        newCode = newCode.replace(re, (_m, q1, q2) => q1 + next + q2)
        if (newCode !== before) relEdits++
      }
    }
    if (newCode !== code) {
      changedFiles++
      fs.writeFileSync(cur, newCode)
    }
  }
}

// ---------- 报告 ----------
console.log(`\n=== L2 migrate ${DRY ? '(DRY RUN)' : '(EXECUTED)'} ===`)
console.log(`dirs moved (git mv):      ${mvCount}`)
console.log(`files in moved set:       ${MOVED.size}`)
console.log(`@/ alias edits:           ${aliasEdits}`)
console.log(`relative import edits:    ${relEdits}`)
console.log(`total changed files:      ${changedFiles}`)
if (DRY) {
  console.log('\n--- moved entry map ---')
  for (const [from, to] of MOVES) console.log(`  ${from}  →  ${to}`)
}
