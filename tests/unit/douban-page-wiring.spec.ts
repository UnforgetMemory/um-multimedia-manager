import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MountRegistry } from '@/scenario/douban/page-registry';

/**
 * Douban page wiring (X46).
 *
 * Two halves, because the two failure modes are different:
 *  1. `MountRegistry` semantics — the map behind the old 19-case switch: registering
 *     the same page type must replace, an unknown type must yield undefined
 *     (a silent `undefined` dispatch is how a page ends up never mounting).
 *  2. `main.ts`'s PAGE_MOUNTS table must agree with the page directories on disk.
 *     The historical bug here was a mis-keyed entry (book-authors dispatching the
 *     wrong module) — a name/path mismatch that no runtime test in the repo would
 *     notice, because each config mounts happily on its own.
 *
 * Half 2 is a text-level structural pass on purpose: importing all 32 configs
 * would drag WXT + Vue entry machinery into a node worker for no added signal.
 */

const PAGES_DIR = path.resolve(process.cwd(), 'src/scenario/douban/pages');
const MAIN_FILE = path.resolve(process.cwd(), 'src/scenario/douban/main.ts');

function pageDirs(): string[] {
  return fs
    .readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function camel(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

test.describe('MountRegistry', () => {
  test('registered page types resolve, unknown ones stay undefined (no silent dispatch)', async () => {
    const registry = new MountRegistry();
    const detail = async (): Promise<void> => undefined;
    registry.register('detail', detail);

    expect(registry.getMountFn('detail')).toBe(detail);
    expect(registry.getMountFn('search')).toBeUndefined();
  });

  test('re-registering a page type replaces it (a second mount for one type is a bug, not a queue)', async () => {
    const registry = new MountRegistry();
    const first = async (): Promise<void> => undefined;
    const second = async (): Promise<void> => undefined;
    registry.register('detail', first);
    registry.register('detail', second);

    expect(registry.getMountFn('detail')).toBe(second);
  });
});

test.describe('main.ts PAGE_MOUNTS ↔ 页面目录', () => {
  const source = fs.readFileSync(MAIN_FILE, 'utf8');
  const table = source.slice(source.indexOf('const PAGE_MOUNTS = {'));

  /** `mount<Camel>` identifier a page dir's config is expected to export. */
  const mountName = (dir: string): string =>
    `mount${camel(dir).replace(/^./, (c) => c.toUpperCase())}`;

  test('表确实被解析到（守卫不空转）', () => {
    expect(table.length, 'PAGE_MOUNTS block not found').toBeGreaterThan(100);
    expect(pageDirs().length).toBeGreaterThanOrEqual(30);
  });

  test('每个页面目录都被 import、被注册，且两边指向同一个标识符', () => {
    const problems: string[] = [];
    for (const dir of pageDirs()) {
      const key = new RegExp(
        `^\\s*'${dir}'\\s*:\\s*([A-Za-z0-9_]+)|^\\s*${dir}\\s*:\\s*([A-Za-z0-9_]+)`,
        'm',
      ).exec(table);
      if (!key) {
        problems.push(`${dir}: PAGE_MOUNTS 里没有 '${dir}' 这一键`);
        continue;
      }
      const identifier = key[1] ?? key[2] ?? '';
      if (identifier !== mountName(dir)) {
        problems.push(`${dir}: 注册的函数是 ${identifier}，按约定应为 ${mountName(dir)}`);
      }
      const importLine = new RegExp(
        `import\\s*\\{[^}]*\\b${identifier}\\b[^}]*\\}\\s*from\\s*'([^']+)'`,
      ).exec(source);
      if (!importLine) {
        problems.push(`${dir}: main.ts 没有 import ${identifier}`);
        continue;
      }
      const specifier = importLine[1] ?? '';
      if (!specifier.includes(`/pages/${dir}/`)) {
        problems.push(`${dir}: ${identifier} 来自 ${specifier}，应为 ./pages/${dir}/…`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('注册表里没有目录之外的多余键', () => {
    const dirs = new Set(pageDirs());
    const keys = [...table.matchAll(/^\s*'?([a-zA-Z0-9-]+)'?\s*:\s*[A-Za-z0-9_]+/gm)].map(
      (match) => match[1] ?? '',
    );
    expect(keys.length, 'no table entries parsed — the regex is wrong').toBeGreaterThan(30);
    expect(
      keys.filter((key) => !dirs.has(key)),
      '多余的注册键',
    ).toEqual([]);
  });
});
