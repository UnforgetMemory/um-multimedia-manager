/**
 * Stable-list-key hygiene guard.
 *
 * Contract: a `v-for` key must be derived from ITEM IDENTITY, never from the
 * mutable record state the row displays. Putting status/rating into the key
 * makes every live `record:updated` write tear down and re-create the subtree —
 * which is how a row "appears to refresh" while actually remounting (lazy
 * images re-decode, focus is lost, and the frame cost is concentrated on the
 * write). Wave X31 established the rule and the correct form
 * (`src/scenario/douban/components/umm-rec-section.ts` keys on `subjectId`);
 * the第十轮回访 found four SFCs still interpolating status/rating into `:key`,
 * i.e. the rule held only where it had been written down. This guard is what
 * keeps it repo-wide.
 *
 * Self-check seeds are mandatory: a form guard that silently stops matching is
 * worse than none, because it reports PASS while the pattern regrows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../src');

/** Dirs whose list rendering is driven by live record state. */
const SCAN_DIRS = ['scenario/douban', 'scenario/sehuatang', 'entrypoints/options', 'feature'];

// `:key="..."` (SFC) and `key: ...` inside a Vapor render object.
const KEY_PATTERNS = [/:key\s*=\s*"([^"]*)"/g, /[,{]\s*key:\s*([^,\n]+)/g];

// A key expression that reads record state is a remount trigger.
const STATE_IN_KEY = /\b(status|rating|viewed|isViewed|dimmed)\b|\brecordFor\(|\brecords\.get\(/;

/**
 * Comments are stripped first: the reference implementation
 * `umm-rec-section.ts` documents this very rule in prose, and a guard that
 * flags its own explanation would be silenced within a day.
 */
function stripComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Extract every key expression whose value reads mutable record state. */
export function findStateDerivedKeys(source: string): string[] {
  const text = stripComments(source);
  const bad: string[] = [];
  for (const re of KEY_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const expr = m[1];
      if (expr === undefined) continue;
      if (STATE_IN_KEY.test(expr)) bad.push(expr.trim());
    }
  }
  return bad;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(vue|ts)$/.test(entry.name)) out.push(p);
  }
  return out;
}

test.describe('列表键必须来自条目身份而非可变记录态（防「重挂假装刷新」回潮）', () => {
  test('自检种子：状态进键的写法必被抓，身份键与索引键不得误报', () => {
    // Positive seeds — these are the exact shapes the guard exists to catch.
    const bad = [
      '<div v-for="b in books" :key="`${b.subjectId}-${recordFor(b).status}`">',
      '<div v-for="b in books" :key="`${b.subjectId}-${records.get(b.subjectId)?.rating ?? 0}`">',
      '<li v-for="x in xs" :key="x.subjectId + x.viewed">',
      'return item({ key: `${it.subjectId}-${status}`, it })',
    ];
    for (const src of bad) {
      expect(findStateDerivedKeys(src), `must flag: ${src}`).not.toEqual([]);
    }

    // Negative seeds — legitimate keys must not be reported (a guard that cries
    // wolf gets silenced, and then it silences the real cases too).
    const good = [
      '<div v-for="b in books" :key="b.subjectId">',
      '<div v-for="b in books" :key="b.subjectId || b.href">',
      '<div v-for="(bar, i) in d.ratingBars" :key="i">',
      '<div v-for="st in data.statuses" :key="st.id">',
      'return item({ key: item.subjectId || item.link, it })',
      '// Stable key: including the status here would remount the card to fake refresh',
    ];
    for (const src of good) {
      expect(findStateDerivedKeys(src), `must not flag: ${src}`).toEqual([]);
    }
  });

  test('扫描确实覆盖到文件，不是空跑', () => {
    const files = SCAN_DIRS.flatMap((d) => {
      const abs = path.join(SRC, d);
      return fs.existsSync(abs) ? walk(abs) : [];
    });
    // A narrowed include list, a renamed dir, or a moved file would otherwise
    // turn this guard into a silent PASS over zero files.
    expect(files.length).toBeGreaterThan(100);
    const withLoops = files.filter((f) => fs.readFileSync(f, 'utf8').includes('v-for'));
    expect(withLoops.length).toBeGreaterThan(20);
  });

  test('src 内不存在「记录状态进列表键」的写法', () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      const abs = path.join(SRC, dir);
      if (!fs.existsSync(abs)) continue;
      for (const f of walk(abs)) {
        const bad = findStateDerivedKeys(fs.readFileSync(f, 'utf8'));
        if (bad.length > 0) offenders.push(`${path.relative(SRC, f)}: ${bad.join(' | ')}`);
      }
    }
    expect(offenders, `state-derived list keys:\n${offenders.join('\n')}`).toEqual([]);
  });
});
