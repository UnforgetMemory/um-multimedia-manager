import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initFileSandbox, defineGlobals } from './helpers/global-sandbox';
import {
  callSite,
  collectGraph,
  contentEntries as entriesOf,
  declares,
  makeDiskReader,
  memoryReader,
  stripComments,
  type Reader,
} from './helpers/entry-graph';
import locales, { type Locale } from '@/entrypoints/content/i18n/locales';
import { initI18n, startLocaleSync, t } from '@/entrypoints/content/i18n';
import { STORAGE_KEYS } from '@/libraries/config';

/**
 * 「入口消费 locale 却从不初始化」守卫（Douban overlay 中文硬编码事故的回归锁）。
 *
 * 缺陷形态：`t()` 读模块级 `currentLocale`（默认 zh-CN），只有 `initI18n()` /
 * `initI18nSync()` 会把它校正到用户语言。legacy 管线、Sehuatang 三页都调了，
 * Douban 入口一个都没调 —— 于是 douban.com 上整片 overlay 无视用户语言恒为简体，
 * Options 页改语言也不回填已开标签页。`i18n:check` 看不见这类缺陷：它查的是**缺键**，
 * 这里坏的是**缺调用**。同理，早期壳的 31 条硬编码简体在 X60/X62 正文 i18n 化时漏网。
 *
 * 三道锁：
 *  1. 图可达性（派生，不手写清单）：从文件系统枚举所有 `defineContentScript` 入口，
 *     沿静态 + 动态 import 走图；图里只要有模块消费 locale（import `t` 或直接 `t('…')`），
 *     该入口就必须能走到初始化调用。`document_start` 入口允许用同步版（异步 IPC 会
 *     推迟遮罩首帧），`document_idle` 必须是异步 `initI18n()`。
 *  2. 壳内禁止中文硬编码：`scenario/douban/early.ts` 的**代码**（剥注释后）不得含汉字，
 *     且其 `SUBTITLE_KEY` 表必须 ≥31 条并能在四本词典里解析出来。
 *  3. 行为断言：真实 `initI18n()` + `startLocaleSync()` 改变 `t()` 输出，含
 *     「Options 页改语言 → onChanged 回填」这一路。
 *
 * 棘轮：已知缺口（色花堂入口，本次由并行 agent 持有，不在我可改文件内）登记在
 * `LIVE_SYNC_GAPS` / `UNINITIALIZED_GAPS`，只能缩小；补好了不删基线也红。
 *
 * 自检种子（本仓规矩：会静默空转的守卫比没有守卫更坏）：探针在合成图上必须
 * 分别对「缺 init」「有 init 无 live sync」「只有函数声明没有调用」「`emit(`/`split(`
 * 噪声」「注释里的汉字」五种情况给出正确答案，任一失守即红。
 *
 * `t()` 的 locale 是 worker 级共享状态：本文件用 `serial` 模式跑，结束时复位 zh-CN。
 */

initFileSandbox();
test.describe.configure({ mode: 'serial' });

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const diskReader = makeDiskReader(REPO);
const contentEntriesOf = (reader: Reader): string[] => entriesOf(reader, REPO);

/** 真正的 locale 消费：从 i18n（或 legacy-bridge）import 了 `t`，或直接 `t('…')`。 */
function consumesLocale(reader: Reader, file: string): boolean {
  const src = reader.read(file);
  if (declares(src, 't')) return false;
  const re = /(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*(?:from\s*)?['"]([^'"]*)['"]/g;
  for (const match of src.matchAll(re)) {
    const named = match[1] ?? '';
    const specifier = match[2] ?? '';
    if (
      /(?:^|\/)i18n$|legacy-bridge$/.test(specifier) &&
      /(^|[,{\s])t(\s+as\s+\w+)?\s*[,\s}]/.test(`${named},`)
    )
      return true;
  }
  return /(?:^|[^A-Za-z0-9_$.])t\(\s*['"`]/.test(src);
}

type Verdict = {
  entry: string;
  runAt: string;
  graphSize: number;
  consumers: string[];
  hasAsyncInit: boolean;
  hasSyncInit: boolean;
  hasLiveSync: boolean;
};

function analyzeEntry(reader: Reader, entry: string): Verdict {
  const src = reader.read(entry);
  const graph = collectGraph(reader, entry);
  const consumers = graph.filter((f) => f !== entry && consumesLocale(reader, f));
  return {
    entry,
    runAt: /runAt:\s*'([^']+)'/.exec(src)?.[1] ?? 'document_idle',
    graphSize: graph.length,
    consumers,
    hasAsyncInit: callSite(reader, graph, 'initI18n'),
    hasSyncInit: callSite(reader, graph, 'initI18nSync'),
    hasLiveSync: callSite(reader, graph, 'startLocaleSync'),
  };
}

function findViolations(verdicts: Verdict[]): string[] {
  const out: string[] = [];
  for (const v of verdicts) {
    if (v.consumers.length === 0) continue;
    const initOk = v.runAt === 'document_start' ? v.hasAsyncInit || v.hasSyncInit : v.hasAsyncInit;
    if (!initOk) {
      out.push(
        `${v.entry}: 图内 ${v.consumers.length} 个模块消费 locale（如 ${v.consumers[0]}），` +
          `却走不到 initI18n()/initI18nSync()（${v.runAt}）——t() 会恒落 zh-CN`,
      );
    } else if (v.runAt !== 'document_start' && !v.hasLiveSync) {
      out.push(`${v.entry}: 初始化了 locale 却没注册 startLocaleSync()——改语言不回填已开标签页`);
    }
  }
  return out;
}

// 已知缺口基线（只能缩小；补好却不删基线也判红）。
// sehuatang-early：它 import 了浮岛构建器（内含 `t('sht.search_placeholder')`）只为画首帧
//   背景，document_start 路径不执行那条函数——静态可达性的保守高估，非实际渲染中文。
// （原登记于此的 sehuatang-main 缺 startLocaleSync() 已在 X103 补上，基线随之删除。）
const UNINITIALIZED_GAPS = ['src/entrypoints/sehuatang-early.content/index.ts'];
const LIVE_SYNC_GAPS: string[] = [];

const HAN = /[\u3400-\u4dbf\u4e00-\u9fff]/;

function hanLiterals(src: string): string[] {
  return stripComments(src)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => HAN.test(line));
}

const EARLY_FILE = 'src/scenario/douban/early.ts';

function subtitleKeys(reader: Reader): string[] {
  const src = reader.read(EARLY_FILE);
  const block = src.slice(src.indexOf('SUBTITLE_KEY'), src.indexOf('DEFAULT_SUBTITLE_KEY'));
  return [...block.matchAll(/'(douban\.loading\.[a-z-]+)'/g)].map((m) => m[1] as string);
}

// ---------------------------------------------------------------------------
// 锁 1：入口 → 初始化调用的可达性（派生枚举）
// ---------------------------------------------------------------------------

const verdicts = contentEntriesOf(diskReader).map((e) => analyzeEntry(diskReader, e));

test.describe('内容入口 locale 初始化守卫', () => {
  test('枚举确实扫到全部入口，图遍历也真的展开到下游模块（探针不空转）', () => {
    expect(verdicts.length, 'no content entries enumerated').toBeGreaterThanOrEqual(8);
    const doubanMain = verdicts.find(
      (v) => v.entry === 'src/entrypoints/douban-main.content/index.ts',
    );
    expect(doubanMain, 'douban-main entry not enumerated').toBeDefined();
    expect(doubanMain?.graphSize).toBeGreaterThan(100);
    expect(doubanMain?.consumers.length).toBeGreaterThan(3);
    const rendering = verdicts.filter((v) => v.consumers.length > 0);
    expect(rendering.length).toBeGreaterThanOrEqual(4);
  });

  test('每个消费 locale 的入口都能走到初始化调用；无未知新增缺口', () => {
    const violations = findViolations(verdicts);
    const fresh = violations.filter(
      (v) =>
        !UNINITIALIZED_GAPS.some((g) => v.startsWith(`${g}:`)) &&
        !LIVE_SYNC_GAPS.some((g) => v.startsWith(`${g}:`)),
    );
    expect(fresh, `未登记的 locale 缺口：\n${fresh.join('\n')}`).toEqual([]);
  });

  test('基线棘轮：登记过的缺口必须仍然存在（补好了就删基线，不许空转）', () => {
    const violations = findViolations(verdicts);
    for (const gap of UNINITIALIZED_GAPS) {
      expect(
        violations.some((v) => v.startsWith(`${gap}: `)),
        `${gap} 已无缺口，请把它从 UNINITIALIZED_GAPS 删掉`,
      ).toBe(true);
    }
    for (const gap of LIVE_SYNC_GAPS) {
      expect(
        violations.some((v) => v.startsWith(`${gap}: `)),
        `${gap} 已补 startLocaleSync()，请把它从 LIVE_SYNC_GAPS 删掉`,
      ).toBe(true);
    }
  });

  test('Douban 主入口与早期入口具体在位（事故本体，逐条钉死）', () => {
    const main = verdicts.find((v) => v.entry === 'src/entrypoints/douban-main.content/index.ts');
    expect(main?.hasAsyncInit, 'douban-main 走不到 initI18n()').toBe(true);
    expect(main?.hasLiveSync, 'douban-main 走不到 startLocaleSync()').toBe(true);
    const early = verdicts.find((v) => v.entry === 'src/entrypoints/douban-early.content/index.ts');
    expect(early?.consumers.length, 'douban-early 应以 t() 消费 locale').toBeGreaterThan(0);
    expect(early?.runAt).toBe('document_start');
    expect(early?.hasSyncInit, 'douban-early 需同步定调 initI18nSync()').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 锁 1b：自检种子——探针坏了必须响亮地失败
// ---------------------------------------------------------------------------

const SEED_I18N = 'src/entrypoints/content/i18n/index.ts';
const SEED_ENTRY = 'src/entrypoints/seed.content/index.ts';
const SEED_WIDGET = 'src/entrypoints/seed.content/widget.ts';

function seedFiles(opts: { init: boolean; liveSync: boolean }): Record<string, string> {
  const imported = [opts.init ? 'initI18n' : null, opts.liveSync ? 'startLocaleSync' : null].filter(
    Boolean,
  );
  const called = [
    opts.init ? 'await initI18n();' : null,
    opts.liveSync ? 'startLocaleSync();' : null,
  ]
    .filter(Boolean)
    .join(' ');
  return {
    [SEED_I18N]:
      'export async function initI18n(): Promise<void> {}\nexport function initI18nSync(): void {}\nexport function startLocaleSync(): void {}\nexport function t(key: string): string { return key; }\n',
    [SEED_WIDGET]:
      "import { t } from '../i18n';\nexport const label = (): string => t('Widget');\n",
    'src/entrypoints/seed.content/index.ts': `import { defineContentScript } from 'wxt/utils/define-content-script';\nimport { label } from '@/entrypoints/seed.content/widget';\n${imported.length > 0 ? `import { ${imported.join(', ')} } from '@/entrypoints/content/i18n';` : ''}\nexport default defineContentScript({ runAt: 'document_idle', main() { label(); ${called} } });\n`,
  };
}

test.describe('守卫自检种子', () => {
  test('缺 init 的合成入口 → 必须判红', () => {
    const reader = memoryReader(seedFiles({ init: false, liveSync: false }));
    const verdict = analyzeEntry(reader, SEED_ENTRY);
    expect(verdict.consumers).toContain(SEED_WIDGET);
    expect(verdict.hasAsyncInit).toBe(false);
    expect(findViolations([verdict])).toEqual([expect.stringContaining('却走不到 initI18n()')]);
  });

  test('有 init 但无 startLocaleSync → 必须判红（改语言不回填这一路）', () => {
    const verdict = analyzeEntry(
      memoryReader(seedFiles({ init: true, liveSync: false })),
      SEED_ENTRY,
    );
    expect(verdict.hasAsyncInit).toBe(true);
    expect(verdict.hasLiveSync).toBe(false);
    expect(findViolations([verdict]).join('\n')).toContain('startLocaleSync');
  });

  test('接线完整的合成入口 → 判绿（否则守卫只会乱叫）', () => {
    const verdict = analyzeEntry(
      memoryReader(seedFiles({ init: true, liveSync: true })),
      SEED_ENTRY,
    );
    expect(verdict.hasAsyncInit).toBe(true);
    expect(verdict.hasLiveSync).toBe(true);
    expect(findViolations([verdict])).toEqual([]);
  });

  test('只有函数声明、没有调用点 → 仍判红（声明不能冒充初始化）', () => {
    const reader = memoryReader(seedFiles({ init: false, liveSync: false }));
    expect(callSite(reader, [SEED_I18N], 'initI18n'), 'definer must not count as caller').toBe(
      false,
    );
    expect(callSite(reader, [SEED_ENTRY], 'initI18n')).toBe(false);
  });

  test('噪声不误报：`emit(` / `split(` / `.t(` 都不算 locale 消费', () => {
    const noise = memoryReader({
      [SEED_ENTRY]:
        "const emit = (k: string): void => {};\nexport const f = (s: string): void => { emit('x'); s.split('a'); obj.t('b'); };",
    });
    expect(consumesLocale(noise, SEED_ENTRY)).toBe(false);
    const real = memoryReader({
      [SEED_ENTRY]: "import { t } from '@/entrypoints/content/i18n';\nconst a = t('Menu Title');",
    });
    expect(consumesLocale(real, SEED_ENTRY)).toBe(true);
  });

  test('汉字探针：注释里的中文放行，代码里的中文硬编码必抓', () => {
    expect(hanLiterals("// 加载照片…\n/* 中文注释 */\nexport const a = 'ok';")).toEqual([]);
    expect(hanLiterals("export const a = '加载照片...';")).toEqual([
      "export const a = '加载照片...';",
    ]);
    expect(hanLiterals('const url = "https://cdn.example/x"; // 注释')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 锁 2：早期壳不再中文硬编码
// ---------------------------------------------------------------------------

test.describe('Douban document_start 壳文案本地化', () => {
  test('early.ts 代码里零汉字（注释除外）——31 条硬编码简体的回归锁', () => {
    expect(hanLiterals(diskReader.read(EARLY_FILE)), '早期壳又出现硬编码中文文案').toEqual([]);
  });

  test('SUBTITLE_KEY 覆盖全部壳文案，且四本词典都能解析', () => {
    const refs = subtitleKeys(diskReader);
    const unique = [...new Set(refs)];
    expect(refs.length, '壳副标题键数量异常（原来 31 条硬编码）').toBeGreaterThanOrEqual(31);
    expect(unique.length, '仅 trailer/video 允许共用一键').toBe(refs.length - 1);
    for (const locale of Object.keys(locales) as Locale[]) {
      for (const key of [...unique, 'douban.loading.default']) {
        expect(locales[locale][key], `${locale} 缺 ${key}`).toBeDefined();
        expect(locales[locale][key], `${locale} 的 ${key} 为空`).not.toBe('');
      }
    }
    const en = unique.map((k) => locales['en-US'][k] as string);
    expect(
      en.filter((v) => HAN.test(v)),
      'en-US 词典里混进了汉字',
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 锁 3：行为——initI18n / startLocaleSync 真的改变 t() 输出
// ---------------------------------------------------------------------------

type ChangesCb = (
  changes: Record<string, { oldValue?: string; newValue?: string }>,
  area: string,
) => void;

type ChromeStub = {
  storage: {
    local: {
      get: (
        keys?: unknown,
        cb?: (res: Record<string, string>) => void,
      ) => Promise<Record<string, string>>;
    };
    onChanged: { addListener: (cb: ChangesCb) => void; removeListener: (cb: ChangesCb) => void };
  };
  runtime: { id: string; lastError: undefined };
};

function stubChrome(locale: Locale): { chrome: ChromeStub; fire: (next: Locale) => void } {
  const listeners: ChangesCb[] = [];
  const chrome: ChromeStub = {
    storage: {
      local: { get: async () => ({ [STORAGE_KEYS.LANGUAGE]: locale }) },
      onChanged: {
        addListener: (cb: ChangesCb) => {
          listeners.push(cb);
        },
        removeListener: (cb: ChangesCb) => {
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
    runtime: { id: 'test-ext', lastError: undefined },
  };
  return {
    chrome,
    fire: (next) => {
      for (const cb of listeners)
        cb({ [STORAGE_KEYS.LANGUAGE]: { oldValue: locale, newValue: next } }, 'local');
    },
  };
}

const PROBE_KEY = 'douban.loading.photos';

test.describe('locale 初始化与在线同步（行为）', () => {
  test('initI18n() 把存储语言灌进 t()', async () => {
    const stub = stubChrome('en-US');
    defineGlobals({ chrome: stub.chrome });
    await initI18n();
    expect(t(PROBE_KEY)).toBe(locales['en-US'][PROBE_KEY]);
    expect(t(PROBE_KEY)).not.toBe(locales['zh-CN'][PROBE_KEY]);
  });

  test('startLocaleSync() 让已开页面跟随 Options 页改语言', async () => {
    const stub = stubChrome('en-US');
    defineGlobals({ chrome: stub.chrome });
    await initI18n();
    startLocaleSync();
    expect(t(PROBE_KEY)).toBe(locales['en-US'][PROBE_KEY]);
    stub.fire('zh-TW');
    expect(t(PROBE_KEY)).toBe(locales['zh-TW'][PROBE_KEY]);
    stub.fire('zh-HK');
    expect(t(PROBE_KEY)).toBe(locales['zh-HK'][PROBE_KEY]);
    stub.fire('nonsense' as Locale);
    expect(t(PROBE_KEY), '未知语言不得改写 currentLocale').toBe(locales['zh-HK'][PROBE_KEY]);
  });

  test('壳的每条键在四种语言下都解析为各自词典文案（不落回键名）', async () => {
    for (const locale of ['zh-CN', 'en-US', 'zh-TW', 'zh-HK'] as Locale[]) {
      defineGlobals({ chrome: stubChrome(locale).chrome });
      await initI18n();
      for (const key of [...subtitleKeys(diskReader), 'douban.loading.default']) {
        expect(t(key), `${locale}/${key} 未解析`).toBe(locales[locale][key]);
      }
    }
  });
});

test.afterAll(async () => {
  // currentLocale 是 worker 级共享状态：本文件之后的 spec 仍假定仓库默认 zh-CN。
  defineGlobals({ chrome: stubChrome('zh-CN').chrome });
  await initI18n();
});
