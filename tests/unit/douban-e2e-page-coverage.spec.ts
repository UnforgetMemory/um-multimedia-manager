/**
 * Douban page-type E2E coverage ratchet.
 *
 * Requirement 8 says "real browser interaction tests", and the requirement
 * object is the PAGE TYPE, not the spec-file count (revisit audit rules 7 and
 * 28). Without a resident guard the numerator can only fall silently: a spec
 * deleted, a host URL mistyped, or a `match` rule broken would just mean one
 * fewer page type is ever opened in Chromium, with every gate still green.
 *
 * HOW THE NUMERATOR IS DERIVED (deliberately not a hand-maintained list):
 * every URL literal in tests/e2e is resolved through the PRODUCTION
 * classifier (detectPageType) after substituting the spec's own host
 * constants. A hand-maintained "which spec covers which page" table rots the
 * moment a spec changes; deriving it means the guard tracks actual navigation.
 *
 * SELF-CHECK SEEDS (a form guard that breaks silently is worse than none):
 *  - the scan must find a known-covered page type, else the probe itself is
 *    blind and the ratchet would "pass" by reporting nothing covered;
 *  - a phantom page type must never appear as covered;
 *  - the uncovered set must be a subset of the declared baseline, and the
 *    baseline must contain only real page types.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { detectPageType } from '@/scenario/douban/shared/url-detector';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const E2E_DIR = path.join(ROOT, 'tests', 'e2e');
const PAGES_DIR = path.join(ROOT, 'src', 'scenario', 'douban', 'pages');

/**
 * Page types NOT opened by any e2e spec. Shrink-only: delete an entry when you
 * add the coverage, never add one. Emptied by X86 (book-profile overlay wiring +
 * the /video/ → trailer alias), which is what this ratchet was built to detect.
 */
const UNCOVERED_BASELINE: string[] = [];

// 'video' is a PageType with no page dir: main.ts redirects it to the trailer
// mount, so it is counted in the denominator even though it has no directory.
const ALL_PAGE_TYPES: string[] = [...new Set([...fs.readdirSync(PAGES_DIR).sort(), 'video'])];

function hostConstants(src: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*['"`]([^'"`\n]+)['"`]/g)) {
    const name = m[1];
    const value = m[2];
    if (name !== undefined && value !== undefined && !map.has(name)) map.set(name, value);
  }
  return map;
}

/** Page types reachable from the URLs an e2e spec navigates to. */
function typesNavigatedBy(specSource: string, shared: Map<string, string>): Set<string> {
  const local = hostConstants(specSource);
  const types = new Set<string>();
  for (const m of specSource.matchAll(/https?:\/\/(?:[^'"`\\\n]|\$\{[^}]*\})+/g)) {
    let url = m[0];
    for (let pass = 0; pass < 3; pass++) {
      url = url.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name: string) => {
        return local.get(name) ?? shared.get(name) ?? '';
      });
      if (!url.includes('${')) break;
    }
    if (url.includes('${')) continue; // unresolved placeholder: skip, never guess
    let detected: ReturnType<typeof detectPageType> = null;
    try {
      detected = detectPageType(url);
    } catch {
      continue; // synthetic URL fragment the classifier cannot parse
    }
    if (detected?.type) types.add(detected.type);
  }
  return types;
}

function collect(): { covered: Set<string>; scannedFiles: number; urls: number } {
  const shared = new Map<string, string>();
  const harness = path.join(E2E_DIR, 'fixtures', 'host-mocks.ts');
  if (fs.existsSync(harness)) {
    for (const [k, v] of hostConstants(fs.readFileSync(harness, 'utf8'))) shared.set(k, v);
  }
  const covered = new Set<string>();
  const files = fs.readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));
  let urls = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(E2E_DIR, f), 'utf8');
    urls += (src.match(/https?:\/\//g) || []).length;
    for (const t of typesNavigatedBy(src, shared)) covered.add(t);
  }
  return { covered, scannedFiles: files.length, urls };
}

const scan = collect();
const uncovered = ALL_PAGE_TYPES.filter((t) => !scan.covered.has(t));

test.describe('Douban 页型真实浏览器覆盖棘轮（分母=PageType，分子=生产分类器解析出的导航 URL）', () => {
  test('扫描确实跑到了东西：spec 数 / URL 数 / 已知覆盖页型', () => {
    // A guard whose probe broke would report "nothing covered" and could then
    // only fail; these seeds fail loudly when the scan itself goes blind.
    expect(scan.scannedFiles).toBeGreaterThanOrEqual(35);
    expect(scan.urls).toBeGreaterThan(50);
    for (const known of ['detail', 'search', 'homepage', 'personage', 'photos']) {
      expect(scan.covered.has(known), `known-covered page type lost: ${known}`).toBe(true);
    }
    expect(scan.covered.has('not-a-real-page-type')).toBe(false);
  });

  test('分母由目录与 PageType 别名枚举，而非硬清单', () => {
    // 32 page dirs + 'video' alias. If a page dir is added, the denominator
    // grows automatically and this guard demands coverage for it.
    expect(ALL_PAGE_TYPES.length).toBe(33);
    expect(ALL_PAGE_TYPES).toContain('book-profile');
    expect(ALL_PAGE_TYPES).toContain('video');
    expect(ALL_PAGE_TYPES).not.toContain('trailer-and-unknown');
  });

  test('未覆盖集合必须是基线子集（棘轮只可缩小，不可新增）', () => {
    const extra = uncovered.filter((t) => !UNCOVERED_BASELINE.includes(t));
    expect(extra, `page types no longer opened in a real browser: ${extra.join(', ')}`).toEqual([]);
  });

  test('基线只列真实页型，且不得把已覆盖项留在里面', () => {
    for (const b of UNCOVERED_BASELINE) {
      expect(ALL_PAGE_TYPES, `baseline names a non-existent page type: ${b}`).toContain(b);
    }
    const stale = UNCOVERED_BASELINE.filter((b) => scan.covered.has(b));
    expect(
      stale,
      `baseline is larger than reality — delete these entries: ${stale.join(', ')}`,
    ).toEqual([]);
  });

  test('每个页型都有夹具可用，或明确登记为夹具缺口', () => {
    // Distinguishes the two kinds of gap, because the honest remediation
    // differs: a missing e2e is just work, while a missing FIXTURE cannot be
    // closed by inventing host markup (that would only self-prove the
    // extractor — the repo refused to do exactly this in wave X65).
    const fixtureDir = path.join(ROOT, 'tests', 'fixtures', 'douban');
    const fixtures = fs.readdirSync(fixtureDir).map((f) => f.replace(/\.html$/, ''));
    const missingFixture = ALL_PAGE_TYPES.filter(
      (t) => !fixtures.some((f) => f === t || f.startsWith(`${t}-`)),
    );
    // 'video' reuses the trailer page mount, so it has no fixture of its own.
    expect(missingFixture).toEqual(['video']);
    // And every uncovered page type that DOES have a fixture is a test gap
    // that must stay named in UNCOVERED_BASELINE until someone closes it.
    const testGaps = uncovered.filter((t) => !missingFixture.includes(t));
    expect(testGaps).toEqual(UNCOVERED_BASELINE.filter((b) => !missingFixture.includes(b)));
  });
});
