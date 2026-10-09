import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * Shared entrypoint-import graph walker + assembly detectors (audit rule 32).
 *
 * Assembly-class defects — a context consumes something but never initialises it
 * (`t()` without `initI18n()`, `warnLog()` without reading the user's log
 * settings) — are invisible to key-by-key gates like `i18n:check`. The only guard
 * that can see them is: enumerate the real `defineContentScript` entries from the
 * filesystem, walk each entry's static + dynamic import graph, and require the
 * initialiser to be *called* somewhere reachable.
 *
 * This module is the single detector implementation. Specs consume it (i18n-init-wiring,
 * x26e-entry-init-parity); a copied detector would let "what the local test measured"
 * and "what CI measures" drift apart, which is the failure mode this helper exists
 * to prevent. x26e-specific judgements (`calledInOwnFile` / `countLogCalls` /
 * theme+logging verdicts) live here too, and its 6 self-check seeds travel with
 * them via `registerEntryDetectorSelfSeeds()` so the merged detector can still
 * self-prove.
 *
 * `Reader` is injectable so each guard can carry self-check seeds over a synthetic
 * file set — a guard that silently finds nothing is worse than no guard.
 *
 * Strip-comments is the stronger semantics and is applied uniformly: entry
 * enumeration (`defineContentScript`), import-graph edges, and call-site
 * detection all read comment-stripped source. A comment saying
 * `startThemeAttrSync()` / `initI18n()` / `import { x } from 'y'` must not count.
 */

export type Reader = { exists: (file: string) => boolean; read: (file: string) => string };

export const toPosix = (p: string): string => p.replace(/\\/g, '/');

export function makeDiskReader(repo: string): Reader {
  return {
    exists: (file) => {
      const abs = path.join(repo, file);
      return fs.existsSync(abs) && !fs.statSync(abs).isDirectory();
    },
    read: (file) => fs.readFileSync(path.join(repo, file), 'utf8'),
  };
}

export function memoryReader(files: Record<string, string>): Reader {
  return {
    exists: (file) => file in files,
    read: (file) => files[file] ?? '',
  };
}

const ASSET_RE = /\.(css|scss|less|svg|png|jpg|jpeg|gif|woff2?)($|\?)/;

/** `@/x` and relative specifiers → repo-relative posix paths; bare packages / assets yield null. */
export function resolveSpec(reader: Reader, spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('.')) base = toPosix(path.posix.join(path.dirname(from), spec));
  else return null;
  if (ASSET_RE.test(spec)) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, `${base}/index.ts`]) {
    if (reader.exists(candidate)) return candidate;
  }
  return null;
}

/** Static imports, re-exports and `import('literal')` all count as edges (pages mount dynamically). */
export function importsOf(src: string): string[] {
  const re = /(?:from|import)\s+(?:type\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    const spec = match[1] ?? match[2];
    if (spec && !spec.includes('?raw')) out.push(spec);
  }
  return out;
}

/**
 * Strip `//` and `/* *\/` comments, string- and regex-aware (a comment saying
 * "这里没调 bootstrapLogging()" must not read as a call site — the guard would
 * otherwise be satisfiable by prose; a regex like `/\/\//` must not swallow the
 * rest of the line as if it were a comment). Block comments keep a newline so
 * line-oriented probes stay stable. Template `${}` expressions are scanned as
 * code so comments inside them are stripped too.
 */
export function stripComments(src: string): string {
  type Mode = 'code' | 'sq' | 'dq' | 'template';
  const stack: Mode[] = ['code'];
  let out = '';
  let i = 0;
  const n = src.length;
  /** Last non-space code char — drives regex-vs-division. */
  let prevCode = '';
  /** Brace depth inside the current `${}` expression (so object `{}` does not close it). */
  let exprBrace = 0;

  const canStartRegex = (): boolean => {
    if (prevCode === '') return true;
    if (/[({[,;:=!&|?+\-*/%~^<>]/.test(prevCode)) return true;
    return /\b(return|typeof|case|in|of|new|delete|void|throw|do|else)$/.test(
      out.slice(-12).replace(/\s+/g, ' '),
    );
  };

  while (i < n) {
    const mode = stack[stack.length - 1] as Mode;
    const ch = src[i] as string;

    if (mode === 'sq' || mode === 'dq') {
      out += ch;
      if (ch === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if ((mode === 'sq' && ch === "'") || (mode === 'dq' && ch === '"')) stack.pop();
      i++;
      continue;
    }

    if (mode === 'template') {
      if (ch === '\\') {
        out += ch + (src[i + 1] ?? '');
        i += 2;
        continue;
      }
      if (ch === '`') {
        out += ch;
        stack.pop();
        i++;
        continue;
      }
      if (ch === '$' && src[i + 1] === '{') {
        out += '${';
        i += 2;
        stack.push('code');
        exprBrace = 0;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    // code mode (also the body of a `${…}` expression)
    if (ch === '"' || ch === "'") {
      stack.push(ch === '"' ? 'dq' : 'sq');
      out += ch;
      i++;
      continue;
    }
    if (ch === '`') {
      stack.push('template');
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      out += '\n';
      continue;
    }
    if (ch === '/' && canStartRegex() && src[i + 1] !== '=') {
      out += ch;
      i++;
      let inClass = false;
      while (i < n) {
        const c = src[i] as string;
        if (c === '\\') {
          out += c + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (c === '\n') break;
        out += c;
        i++;
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
      }
      while (i < n && /[a-z]/i.test(src[i] as string)) {
        out += src[i];
        i++;
      }
      prevCode = '/';
      continue;
    }
    if (ch === '{') {
      exprBrace++;
      out += ch;
      prevCode = ch;
      i++;
      continue;
    }
    if (ch === '}') {
      if (exprBrace === 0 && stack.length > 1) {
        // Closing the `${` that pushed this code mode.
        out += ch;
        i++;
        stack.pop();
        prevCode = ch;
        continue;
      }
      exprBrace = Math.max(0, exprBrace - 1);
      out += ch;
      prevCode = ch;
      i++;
      continue;
    }
    out += ch;
    if (!/\s/.test(ch)) prevCode = ch;
    i++;
  }
  return out;
}

const codeCache = new WeakMap<Reader, Map<string, string>>();

/** Comment-stripped source of `file`, cached per Reader. */
export function codeOf(reader: Reader, file: string): string {
  let perReader = codeCache.get(reader);
  if (!perReader) {
    perReader = new Map();
    codeCache.set(reader, perReader);
  }
  let code = perReader.get(file);
  if (code === undefined) {
    code = stripComments(reader.read(file));
    perReader.set(file, code);
  }
  return code;
}

export function collectGraph(reader: Reader, root: string): string[] {
  const seen = new Set<string>();
  const stack = [root];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file) || !reader.exists(file)) continue;
    seen.add(file);
    for (const spec of importsOf(codeOf(reader, file))) {
      const resolved = resolveSpec(reader, spec, file);
      if (resolved && !seen.has(resolved)) stack.push(resolved);
    }
  }
  return [...seen];
}

/** A declaration is not a call site — otherwise "the module defines it" would satisfy the guard. */
export function declares(src: string, name: string): boolean {
  return new RegExp(`(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${name}\\b`).test(
    src,
  );
}

export function calls(src: string, name: string): boolean {
  return new RegExp(`(?:^|[^A-Za-z0-9_$.])${name}\\s*\\(`, 'm').test(src);
}

/** Files (among `files`) that CALL `name` — declaration sites and comments excluded. */
export function callSites(reader: Reader, files: string[], name: string): string[] {
  return files.filter((f) => {
    const code = codeOf(reader, f);
    return calls(code, name) && !declares(code, name);
  });
}

export function callSite(reader: Reader, files: string[], name: string): boolean {
  return callSites(reader, files, name).length > 0;
}

/** Any of `names` is called somewhere in the file set. */
export function reaches(reader: Reader, files: string[], names: readonly string[]): boolean {
  return names.some((name) => callSites(reader, files, name).length > 0);
}

/**
 * Call sites in the entry's OWN file. Logging init is a per-context duty —
 * handing it to a module the entry merely imports is not enough: an entry that
 * only imports `bootstrapLogging` still has `configureLogging` in its graph
 * (the bootstrap module calls it), so graph reachability would wrongly pass.
 */
export function calledInOwnFile(reader: Reader, entry: string, names: readonly string[]): boolean {
  const code = codeOf(reader, entry);
  return names.some((name) => calls(code, name) && !declares(code, name));
}

/**
 * Does this file consume one of `names` as a CALL (not merely import it)?
 * Used to decide whether an entry graph needs its initialiser wired at all.
 */
export function consumesCall(reader: Reader, file: string, names: readonly string[]): boolean {
  return calledInOwnFile(reader, file, names);
}

/** `runAt:` of a content-script entry; entries that do not state one run at document_idle. */
export function runAtOf(src: string): string {
  return /runAt:\s*'([^']+)'/.exec(src)?.[1] ?? 'document_idle';
}

/** Every file under `src/entrypoints` that declares a WXT content script (comment-stripped). */
export function contentEntries(reader: Reader, repo: string): string[] {
  const dir = path.join(repo, 'src/entrypoints');
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|vue)$/.test(e.name)) files.push(toPosix(path.relative(repo, p)));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return files
    .filter((f) => reader.exists(f) && /defineContentScript/.test(codeOf(reader, f)))
    .sort();
}

// ---------------------------------------------------------------------------
// x26e assembly judgements (theme + logging) — shared so seeds can self-prove
// ---------------------------------------------------------------------------

export const LOGGER_FNS = ['debugLog', 'infoLog', 'warnLog', 'errorLog'] as const;
export const LOGGING_INITIALIZERS = ['configureLogging', 'bootstrapLogging'] as const;
export const THEME_APPLICATORS = ['startThemeAttrSync', 'subscribeTheme'] as const;
export const THEME_CONSUMER = 'injectGlobalStyles';

/** Logger export calls in a graph file (definition site and comments excluded). */
export function countLogCalls(reader: Reader, file: string): number {
  if (file === 'src/libraries/utils/logger.ts') return 0;
  const code = codeOf(reader, file);
  let n = 0;
  for (const name of LOGGER_FNS) {
    n += calls(code, name) && !declares(code, name) ? 1 : 0;
  }
  return n;
}

export type Verdict = {
  entry: string;
  graphSize: number;
  logConsumers: number;
  hasLoggingInit: boolean;
  styleInjectors: string[];
  hasThemeSync: boolean;
};

export function analyzeEntry(reader: Reader, entry: string): Verdict {
  const graph = collectGraph(reader, entry);
  const logConsumers = graph.reduce((n, f) => n + countLogCalls(reader, f), 0);
  const injectors = callSites(reader, graph, THEME_CONSUMER);
  return {
    entry,
    graphSize: graph.length,
    logConsumers,
    hasLoggingInit: calledInOwnFile(reader, entry, LOGGING_INITIALIZERS),
    styleInjectors: injectors,
    hasThemeSync: reaches(reader, graph, THEME_APPLICATORS),
  };
}

export function findViolations(verdicts: Verdict[]): { logging: string[]; theme: string[] } {
  const logging: string[] = [];
  const theme: string[] = [];
  for (const v of verdicts) {
    if (v.logConsumers > 0 && !v.hasLoggingInit) {
      logging.push(
        `${v.entry}: 图内 ${v.logConsumers} 个模块调 logger（debug/info/warn/error），` +
          '入口自身却不调 configureLogging()/bootstrapLogging()（只 import 不算）——' +
          'Options「调试日志」在该上下文恒无效',
      );
    }
    if (v.styleInjectors.length > 0 && !v.hasThemeSync) {
      theme.push(
        `${v.entry}: 注入 global.ts 样式（${v.styleInjectors[0]}），` +
          '却走不到 startThemeAttrSync()/subscribeTheme()——html[data-umm-theme] 不落，' +
          '暗色用户拿到亮色调色板',
      );
    }
  }
  return { logging, theme };
}

// ---------------------------------------------------------------------------
// Detector self-check seeds (migrated from x26e-entry-init-parity.spec.ts)
// ---------------------------------------------------------------------------

export const SEED_LOGGER = 'src/libraries/utils/logger.ts';
export const SEED_STYLES = 'src/entrypoints/content/styles/global.ts';
export const SEED_THEME = 'src/scenario/douban/overlay/theme-sync.ts';
export const SEED_ENTRY = 'src/entrypoints/seed.content/index.ts';

export function seedFiles(opts: {
  logs: boolean;
  injects: boolean;
  init: boolean;
  theme: boolean;
  /** 只 import 不调用 —— 规则 1 必须按入口自身调用点判定的原因。 */
  importOnly?: boolean;
}): Record<string, string> {
  const imports = [
    opts.logs ? `import { infoLog } from '@/libraries/utils/logger';` : '',
    opts.injects ? `import { injectGlobalStyles } from '@/entrypoints/content/styles/global';` : '',
    opts.init || opts.importOnly
      ? `import { bootstrapLogging } from '@/entrypoints/content/bootstrap/logging';`
      : '',
    opts.theme ? `import { startThemeAttrSync } from '@/scenario/douban/overlay/theme-sync';` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const body = [
    opts.logs ? 'infoLog("loaded");' : '',
    opts.injects ? 'injectGlobalStyles();' : '',
    opts.init && !opts.importOnly ? 'await bootstrapLogging();' : '',
    opts.theme ? 'startThemeAttrSync({ background: false });' : '',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    [SEED_LOGGER]:
      'export function infoLog(...a: unknown[]): void { void a; }\nexport function configureLogging(o: unknown): void { void o; }\n',
    [SEED_STYLES]: 'export function injectGlobalStyles(): void {}\n',
    [SEED_THEME]: 'export function startThemeAttrSync(): void {}\n',
    // 引导模块内部调用 configureLogging：按图判定的规则 1 会被「只 import 不调用」
    // 的入口骗过（反向验证实测），故规则 1 只看入口自身。
    'src/entrypoints/content/bootstrap/logging.ts':
      "import { configureLogging } from '@/libraries/utils/logger';\nexport async function bootstrapLogging(): Promise<void> { configureLogging({ enabled: true }); }\n",
    [SEED_ENTRY]: `export default { main() {\n${imports}\n${body}\n} };\n`,
  };
}

function seed(entry: string, files: Record<string, string>): Verdict {
  return analyzeEntry(memoryReader(files), entry);
}

/**
 * Register the 6 detector self-check seeds. Call from the owning spec so a
 * broken probe fails loudly instead of silently passing (a guard that finds
 * nothing is worse than no guard).
 */
export function registerEntryDetectorSelfSeeds(): void {
  test.describe('守卫自检种子', () => {
    test('消费 logger 但无日志初始化 → 判红', () => {
      const v = seed(
        SEED_ENTRY,
        seedFiles({ logs: true, injects: false, init: false, theme: false }),
      );
      expect(v.logConsumers).toBeGreaterThan(0);
      expect(v.hasLoggingInit).toBe(false);
      expect(findViolations([v]).logging).toEqual([expect.stringContaining('configureLogging()')]);
      expect(findViolations([v]).theme).toEqual([]);
    });

    test('注入 global.ts 但无主题同步 → 判红', () => {
      const v = seed(
        SEED_ENTRY,
        seedFiles({ logs: false, injects: true, init: true, theme: false }),
      );
      expect(v.styleInjectors).toContain(SEED_ENTRY);
      expect(v.hasThemeSync).toBe(false);
      expect(findViolations([v]).theme).toEqual([expect.stringContaining('data-umm-theme')]);
      expect(
        findViolations([v]).logging,
        'rule 1 is entry-own-file; this seed has no logger consumers so logging must stay clear',
      ).toEqual([]);
    });

    test('接线完整的合成入口 → 判绿（否则守卫只会乱叫）', () => {
      const v = seed(SEED_ENTRY, seedFiles({ logs: true, injects: true, init: true, theme: true }));
      expect(findViolations([v])).toEqual({ logging: [], theme: [] });
    });

    test('只有函数声明、没有调用点 → 仍判红（定义不能冒充初始化）', () => {
      const reader = memoryReader(
        seedFiles({ logs: true, injects: true, init: false, theme: false }),
      );
      expect(callSites(reader, [SEED_LOGGER], 'infoLog'), 'definer is not a caller').toEqual([]);
      expect(callSites(reader, [SEED_STYLES], 'injectGlobalStyles')).toEqual([]);
      expect(callSites(reader, [SEED_ENTRY], 'infoLog')).toEqual([SEED_ENTRY]);
    });

    test('只 import 不调用引导函数 → 仍判红（入口自身的义务）', () => {
      const v = seed(
        SEED_ENTRY,
        seedFiles({ logs: true, injects: false, init: false, theme: false, importOnly: true }),
      );
      expect(v.logConsumers).toBeGreaterThan(0);
      expect(v.hasLoggingInit, 'import 不能冒充调用').toBe(false);
      expect(findViolations([v]).logging).toEqual([expect.stringContaining('bootstrapLogging()')]);
    });

    test('噪声不误报：`.infoLog(` / `// infoLog(` 之外的属性访问不算调用', () => {
      const noise = memoryReader({
        [SEED_ENTRY]:
          'obj.infoLog("x");\n// infoLog("y")\nconst t = { errorLog: 1 };\nexport const a = t.errorLog;',
      });
      expect(countLogCalls(noise, SEED_ENTRY)).toBe(0);
      const real = memoryReader({ [SEED_ENTRY]: 'infoLog("x");\nerrorLog("y");' });
      expect(countLogCalls(real, SEED_ENTRY)).toBe(2);
    });

    test('正则字面量里的 // 不吞掉后续代码（stripComments 回归）', () => {
      // Without regex-aware stripping the `//` inside `/\//` starts a line
      // comment and `infoLog("after")` disappears — the probe would go blind.
      const files = {
        [SEED_LOGGER]: 'export function infoLog(...a: unknown[]): void { void a; }\n',
        [SEED_ENTRY]:
          'import { infoLog } from "@/libraries/utils/logger";\n' +
          'const re = /\\/\\//;\n' +
          'infoLog("after");\n',
      };
      expect(stripComments(files[SEED_ENTRY] as string)).toContain('infoLog("after")');
      expect(callSites(memoryReader(files), [SEED_ENTRY], 'infoLog')).toEqual([SEED_ENTRY]);
    });

    test('模板 ${/* 注释 */} 内的调用不算真调用', () => {
      // The comment sits inside a template expression. If stripComments leaves
      // it, `calls()` would count `initI18n()` from prose — a false green.
      const files = {
        [SEED_ENTRY]: 'const label = `x ${/* initI18n() */ 1} y`;\nexport const z = label;\n',
      };
      expect(callSites(memoryReader(files), [SEED_ENTRY], 'initI18n')).toEqual([]);
    });
  });
}
