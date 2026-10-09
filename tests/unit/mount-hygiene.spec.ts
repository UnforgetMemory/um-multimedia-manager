import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Mount hygiene for unit specs (X27-A follow-up).
 *
 * A spec that mounts a Vue app into a shared jsdom document and never releases
 * it leaves the app live after its case ends — effects, watchers and any event
 * subscription keep running against a detached tree, and the document piles up
 * nodes a later query can match. Under `fullyParallel` the damage is
 * non-deterministic (a worker may run one case of the file or ten), which is
 * exactly why this is a structural rule rather than a runtime assertion: no
 * single test can witness another case's leak.
 *
 * Release is either `test.afterEach(releaseMounted)` from
 * ./helpers/release-mounted-apps or an explicit `app.unmount()` in the spec.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Specs whose mount belongs to production code, not the test. */
const PRODUCTION_MOUNTED = ['overlay-mount-failure.spec.ts'];

/**
 * Wiring, not vocabulary: an unused `releaseMounted` import must not count as a
 * release (that exact hole made the first version of this guard pass while a
 * spec leaked every app it mounted).
 */
const MOUNTS = /\.mount\(/;
const RELEASES = /test\.afterEach\(\s*releaseMounted\s*\)|\.unmount\(/;

function specFiles(): string[] {
  return fs
    .readdirSync(HERE)
    .filter((name) => name.endsWith('.spec.ts'))
    .sort();
}

function mountingSpecs(): string[] {
  return specFiles().filter((name) => {
    if (PRODUCTION_MOUNTED.includes(name)) return false;
    return MOUNTS.test(fs.readFileSync(path.join(HERE, name), 'utf8'));
  });
}

test.describe('挂载即释放：单测 app 生命周期结构守卫', () => {
  test('扫描确实命中了挂载用例（守卫不能空转）', () => {
    const found = mountingSpecs();
    expect(found.length).toBeGreaterThanOrEqual(10);
    expect(found).toContain('umm-status-badge.spec.ts');
  });

  // Positive/negative seeds: without them a mangled pattern would let every
  // case pass vacuously.
  test('模式能区分挂载与两种释放写法（守卫自证）', () => {
    expect(MOUNTS.test('  app.mount(container);')).toBe(true);
    expect(MOUNTS.test('  // no mount here')).toBe(false);
    expect(RELEASES.test('test.afterEach(releaseMounted);')).toBe(true);
    expect(RELEASES.test('  app?.unmount();')).toBe(true);
    // An import without wiring is the exact hole this guard must catch.
    expect(RELEASES.test("import { releaseMounted } from './helpers/x';")).toBe(false);
    expect(RELEASES.test('  app.mount(container);')).toBe(false);
  });

  test('每个挂载用例都释放它挂上去的 app', () => {
    const leaking = mountingSpecs().filter(
      (name) => !RELEASES.test(fs.readFileSync(path.join(HERE, name), 'utf8')),
    );
    expect(leaking).toEqual([]);
  });

  test('helper 只被登记、不会自己挂载（避免守卫把自身算作用例）', () => {
    const helper = fs.readFileSync(path.join(HERE, 'helpers/release-mounted-apps.ts'), 'utf8');
    expect(helper).not.toMatch(/\.mount\(/);
    expect(helper).toMatch(/export function releaseMounted/);
    expect(helper).toMatch(/export function liveMountCount/);
  });
});
