import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 架构分层守卫自身的双向验证（umpp W1 · ADR-026 D6）
 *
 * 守卫类工具最常见的失效形态是「永不失败」——看起来在跑，实则规则没生效，
 * 于是给出虚假的安全感。本 spec 用**合成夹具**证明守卫三个方向都成立：
 *   ① 合法输入 → PASS（exit 0）
 *   ② 违规输入 → FAIL（exit 1），且能逐条命中预期规则
 *   ③ 负向对照 → 合法形态不误报（且显式断言守卫确实跑起来了）
 *
 * 夹具写入 os.tmpdir()，不污染仓库；通过 ARCH_SRC 环境变量把守卫指向夹具根。
 *
 * 维护提示：`--json` 输出与应用层规则的回归不在本 spec（属 2026-09-25 umreview
 * 的必改项），已由守卫内部的语法覆盖夹具覆盖 —— 见 VIOLATING_TREE 中的
 * bad-require / bad-import-equals / bad-template 三条。
 */

// 从本文件位置上溯到仓库根，避免依赖 process.cwd()（换 cwd 运行即失效）
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GUARD = path.join(REPO, 'scripts', 'check-architecture.cjs')

function writeTree(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(base, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf8')
  }
}

function runGuard(srcDir: string, args: string[] = []): { status: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [GUARD, ...args], {
      cwd: REPO,
      env: { ...process.env, ARCH_SRC: srcDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, out: String(out) }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    // 注意：脚本缺失（ENOENT）与真实违规都表现为非零退出，此处不区分；
    // 因此调用方必须同时断言输出内容，不能只看 status。
    return { status: typeof err.status === 'number' ? err.status : -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

/** 合法夹具：依赖方向全部向下（app→feature→store→scenario→provider→engine→libraries）。 */
const LEGAL_TREE: Record<string, string> = {
  'utils/pure.ts': 'export const pure = 1\n',
  'domain/entity.ts': "import { pure } from '@/utils/pure'\nexport const entity = pure\n",
  'features/database/models.ts': "import { pure } from '@/utils/pure'\nexport const db = pure\n",
  'features/webdav/api.ts':
    "import { db } from '@/features/database/models'\nexport const api = db\n",
  // 内容脚本必须经「数据库门面」bare 导入，不得走 models/api 深路径
  'content/page.ts':
    "import { Store } from '@/features/database'\nimport { api } from '@/features/webdav/api'\nexport const page = Store + api\n",
  'stores/app.ts': "import { page } from '@/content/page'\nexport const app = page\n",
  'shared/ui/button/Button.vue':
    "<script setup lang=\"ts\">\nimport { pure } from '@/utils/pure'\n</script>\n\n<template><button>{{ pure }}</button></template>\n",
  'entrypoints/content/handlers/ok.ts':
    "import { Store } from '@/features/database'\nexport const s = Store\n",
  'entrypoints/background.ts':
    "import { api } from '@/features/webdav/api'\nexport const bg = api\n",
}

/** 违规夹具：在合法树基础上逐个注入已知违规形态。 */
const VIOLATING_TREE: Record<string, string> = {
  ...LEGAL_TREE,
  // C 类：纯层（libraries）依赖业务层（engine）
  'utils/bad-lib.ts': "import { db } from '@/features/database/models'\nexport const bad = db\n",
  // D 类：domain 依赖业务层（store）
  'domain/bad-domain.ts': "import { app } from '@/stores/app'\nexport const bad = app\n",
  // B 类：向上依赖（engine → app）—— 三种曾被漏检的导入写法
  'features/database/bad-up.ts': "import { bg } from '@/entrypoints/background'\nexport const bad = bg\n",
  'features/database/bad-import-equals.ts':
    "import bg = require('@/entrypoints/background')\nexport const bad = bg\n",
  'features/database/bad-template.ts':
    "export async function load() {\n  return import(`@/entrypoints/background`)\n}\n",
  // E1 类：内容脚本直连 IndexedDB
  'content/bad-raw.ts': "export function boom() {\n  return indexedDB.open('probe')\n}\n",
  // E2 类：内容脚本深路径绕过 database 门面 —— 含 require 写法
  'entrypoints/content/handlers/bad-facade.ts':
    "import { db } from '@/features/database/models'\nexport const bad = db\n",
  'entrypoints/content/handlers/bad-facade-require.ts':
    "const db = require('@/features/database/models')\nexport const bad = db\n",
}

/**
 * 规则 F 夹具：同一文件内两处 `unpackageDataset` 调用，只有一处带版本校验。
 * 回归 2026-09-25 重审实测的 MUT-ONE 漏检——文件级共存断言无法发现
 * 「删除单个调用点的校验」这种退化，故断言粒度必须落在调用点。
 */
const PARTIAL_VALIDATION_TREE: Record<string, string> = {
  ...LEGAL_TREE,
  'utils/zip-utils.ts': [
    'export async function unpackageDataset(blob) {',
    '  return { data: {}, meta: blob }',
    '}',
  ].join('\n'),
  'features/webdav/loader.ts': [
    "import { unpackageDataset } from '@/utils/zip-utils'",
    "import { validateDatasetVersion } from '@/features/migration/models'",
    'export async function a(blob) {',
    '  const { data, meta } = await unpackageDataset(blob)',
    '  validateDatasetVersion(meta.dataVersion)',
    '  return data',
    '}',
    'export async function b(blob) {',
    '  const { data } = await unpackageDataset(blob)',
    '  return data',
    '}',
  ].join('\n'),
}

test.describe('架构分层守卫 · 双向验证', () => {
  test('合法夹具 → PASS（exit 0）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-arch-legal-'))
    writeTree(dir, LEGAL_TREE)

    const { status, out } = runGuard(dir)
    expect(out).toContain('A. 层映射完备')
    expect(out).toContain('PASS')
    expect(status).toBe(0)

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('违规夹具 → FAIL（exit 1）且逐条命中预期规则', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-arch-bad-'))
    writeTree(dir, VIOLATING_TREE)

    const { status, out } = runGuard(dir)

    expect(status).toBe(1)
    expect(out).toContain('FAIL')

    // B 向上依赖
    expect(out).toContain('B. 向上依赖')
    expect(out).toContain('features/database/bad-up.ts')

    // C libraries 纯度
    expect(out).toContain('C. libraries 纯度')
    expect(out).toContain('utils/bad-lib.ts')

    // D domain 纯度
    expect(out).toContain('D. domain 纯度')
    expect(out).toContain('domain/bad-domain.ts')

    // E1 内容脚本直连 IndexedDB
    expect(out).toContain('E. 内容脚本直连 IndexedDB')
    expect(out).toContain('content/bad-raw.ts')

    // E2 内容脚本绕过 database 门面
    expect(out).toContain('E. 内容脚本绕过 database 门面')
    expect(out).toContain('entrypoints/content/handlers/bad-facade.ts')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('导入语法覆盖：import= / 模板字面量动态导入 / require 均能被识别', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-arch-syntax-'))
    writeTree(dir, VIOLATING_TREE)

    const { out } = runGuard(dir)

    // 这三条是 2026-09-25 umreview 抓到的假阴性（当时全部漏检）
    expect(out).toContain('features/database/bad-import-equals.ts')
    expect(out).toContain('features/database/bad-template.ts')
    expect(out).toContain('entrypoints/content/handlers/bad-facade-require.ts')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('负向对照：合法形态不误报，且守卫确实运行（防「守卫失效即通过」）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-arch-negative-'))
    writeTree(dir, LEGAL_TREE)

    const { status, out } = runGuard(dir)

    // 先证明守卫真的跑起来了——否则下面的 not.toContain 在守卫整体失效
    // （如脚本被删）时也会通过，形成假安全。
    expect(status).toBe(0)
    expect(out).toContain('PASS')

    // 经门面 bare 导入是允许的；只有深路径才算绕过
    expect(out).not.toContain('绕过 database 门面')
    // 合法的 shared/ui → utils 也不会被判为 libraries 纯度违规
    expect(out).not.toContain('libraries 纯度')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('规则 F 粒度：同文件内单处调用点缺校验必须被发现（MUT-ONE 回归）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-arch-rulef-'))
    writeTree(dir, PARTIAL_VALIDATION_TREE)

    const { status, out } = runGuard(dir)

    expect(status).toBe(1)
    expect(out).toContain('F. unpackageDataset 调用点(第 9 行)缺少版本校验')
    expect(out).toContain('features/webdav/loader.ts')
    // 带校验的第一处调用点不得被误报
    expect(out).not.toContain('第 4 行')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('--json 输出为单一合法 JSON（进度行不得污染 stdout）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'umm-arch-json-'))
    writeTree(dir, LEGAL_TREE)

    const { status, out } = runGuard(dir, ['--json'])
    expect(status).toBe(0)

    const parsed = JSON.parse(out) as { failures: unknown[]; warnings: unknown[] }
    expect(parsed.failures).toEqual([])
    expect(Array.isArray(parsed.warnings)).toBe(true)

    fs.rmSync(dir, { recursive: true, force: true })
  })
})
