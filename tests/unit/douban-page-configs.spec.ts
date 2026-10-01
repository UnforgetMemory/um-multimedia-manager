import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRegisteredCssPresets } from '@/scenario/douban/css-composer';

/**
 * Douban page-config wiring (X46 ②).
 *
 * `mount-factory.ts` cannot be imported by a node-side spec: it pulls
 * `css-map.ts`, whose 45 `?raw` CSS imports are parsed as JavaScript by the node
 * loader (verified: `SyntaxError … tokens.static.css: Unexpected token`). That is
 * also why the factory layer had no unit test at all — not an oversight but an
 * unreachability. So the coverage that IS possible here is the structural
 * contract that the factory depends on, asserted over all 32 page configs:
 *
 *  1. every config's `cssPreset` resolves in `PAGE_CSS_PRESETS` (an unresolvable
 *     preset is swallowed by the factory's try/catch and shows up as a
 *     "component import failed" panel — a misleading diagnosis);
 *  2. the naming convention `cssPreset === <page dir>` holds (it is what makes
 *     preset lookups auditable by eye and by this gate);
 *  3. every config imports its root component lazily. A static `import App from
 *     './App.vue'` would fold 32 page bundles into the content script — the
 *     exact size regression X25/X5 worked to remove;
 *  4. `overlayId` follows the `umm-*` convention (the shell is created at
 *     document_start by id, so a typo silently yields no mount target).
 *
 * `main.ts`'s PAGE_MOUNTS ↔ directory mapping is covered in
 * `douban-page-wiring.spec.ts`; the mount/teardown behavior of `mount-app.ts`
 * in `overlay-mount-failure.spec.ts`.
 */

const PAGES_DIR = path.resolve(process.cwd(), 'src/scenario/douban/pages');

function pageDirs(): string[] {
  return fs
    .readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function configSource(dir: string): string {
  return fs.readFileSync(path.join(PAGES_DIR, dir, 'config.ts'), 'utf8');
}

test.describe('douban 页面 config 的结构契约', () => {
  const presets = new Set<string>(getRegisteredCssPresets());

  test('解析得到足够多的页面与预设（守卫不空转）', () => {
    expect(pageDirs().length).toBeGreaterThanOrEqual(30);
    expect(presets.size, 'css-composer registered no presets').toBeGreaterThanOrEqual(30);
  });

  test('每个 config 都存在且声明了 cssPreset / overlayId', () => {
    const problems: string[] = [];
    for (const dir of pageDirs()) {
      const file = path.join(PAGES_DIR, dir, 'config.ts');
      if (!fs.existsSync(file)) {
        problems.push(`${dir}: 没有 config.ts`);
        continue;
      }
      const src = configSource(dir);
      for (const [field, pattern] of [
        ['cssPreset', /cssPreset:\s*'([^']+)'/],
        ['overlayId', /overlayId:\s*'([^']+)'/],
      ] as const) {
        const value = pattern.exec(src)?.[1];
        if (!value) problems.push(`${dir}: 缺少 ${field}`);
        else if (field === 'overlayId' && !/^umm-[a-z0-9-]+$/.test(value)) {
          problems.push(`${dir}: overlayId 不合约定 → ${value}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test('cssPreset 必须能在 PAGE_CSS_PRESETS 里解析，且与目录同名', () => {
    const problems: string[] = [];
    for (const dir of pageDirs()) {
      const preset = /cssPreset:\s*'([^']+)'/.exec(configSource(dir))?.[1];
      if (!preset) continue; // covered by the previous case
      if (!presets.has(preset)) {
        problems.push(`${dir}: cssPreset '${preset}' 不在 PAGE_CSS_PRESETS 里`);
      }
      if (preset !== dir) {
        problems.push(`${dir}: cssPreset 与目录名不一致 → '${preset}'`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('每个 config 都懒加载根组件（静态 import 会把 32 页打进同一个内容脚本）', () => {
    const eager = pageDirs().filter((dir) => {
      const src = configSource(dir);
      const lazy = /importApp:\s*\(\)\s*=>\s*import\(\s*'\.\/App\.vue'\s*\)/.test(src);
      const staticImport = /^import\s+\w+\s+from\s*'\.\/App\.vue'/m.test(src);
      return !lazy || staticImport;
    });
    expect(eager, `未走懒加载的页面: ${eager.join(', ')}`).toEqual([]);
  });

  test('每个 config 都用 definePageMount 产出挂载函数', () => {
    const offPattern = pageDirs().filter((dir) => {
      const src = configSource(dir);
      return !/export const mount\w+ = definePageMount/.test(src);
    });
    expect(offPattern, `没用 definePageMount 的页面: ${offPattern.join(', ')}`).toEqual([]);
  });
});
