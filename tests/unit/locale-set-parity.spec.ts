import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import contentLocales from '@/entrypoints/content/i18n/locales';
import {
  EXTENSION_LOCALES,
  type ExtensionLocale,
  SPA_LOCALE_FALLBACK,
} from '@/libraries/locale-sets';
import { messages, resolveSpaLocale, SPA_MESSAGE_LOCALES } from '@/libraries/locales';
import { filterValidSettings } from '@/entrypoints/background/handlers/webdav-restore';

/**
 * 规则 33 的回归锁：「这个扩展一共有哪几种语言」散在三个集合里，必须有一条断言
 * 把它们的关系写出来。三处清单分别是——
 *   H  注入层 locale（`src/entrypoints/content/i18n/locales/index.ts`，4 种含粤语）
 *   E  全扩展可持有清单（`src/libraries/locale-sets.ts` 的 `EXTENSION_LOCALES`）
 *   D  SPA 有词典的 locale（`SPA_MESSAGE_LOCALES`，派生自 `messages`，3 种）
 *   R  备份恢复准入（`filterValidSettings({language})` 实际接受的集合，行为读出）
 *
 * 声明的关系：H == E == R ⊇ D，且差集 E\D 的每个成员都必须在
 * `SPA_LOCALE_FALLBACK` 里降级到一本**真实存在**的词典；D 已收录的语言不得再挂
 * 降级条目。两侧都是结构式检查（正/反向各一遍），所以：
 *   - 新增第五种语言而不登记降级 → 红（且 type-check 同时红，见 SPA_LOCALE_FALLBACK 的
 *     `Exclude<ExtensionLocale, Locale>` 键型）；
 *   - 给 zh-HK 补齐词典却忘了删降级条目 → 同样红（缺口不许静默留存或静默闭合）。
 *
 * `npm run i18n:check:strict` 看不见这一类缺陷：它比对的是**同一系统内各 locale 的
 * 键集**是否对称，从不比较「有哪些 locale」这个集合本身（见 scripts/check-i18n.js 的
 * getLocaleFiles / extractContentBlocks —— 两个目录各自独立循环）。
 *
 * 自检种子（本仓规矩：会静默空转的守卫比没有守卫更坏）：下面的 `onlyIn` /
 * `findUncoveredLocales` / `localesRejectedByRestore` / 目录扫描在合成输入上必须
 * 分别给出正确答案，任一失守即红；每条真实断言前都先 assert 来源非空。
 */

type LocaleId = string;
type Assert<T extends true> = T;

/** E 的键型必须恰好是那 4 个 id（改了数组字面量而没改这张关系图 → 编译失败）。 */
type THeldWithinFourIds = Assert<
  ExtensionLocale extends 'en-US' | 'zh-CN' | 'zh-HK' | 'zh-TW' ? true : false
>;
type THeldCoversFourIds = Assert<
  'en-US' | 'zh-CN' | 'zh-HK' | 'zh-TW' extends ExtensionLocale ? true : false
>;
/** 唯一合法例外必须恰好是 zh-HK（多一种缺口语言即编译期红，须连带更新本 spec）。 */
type TGapIsExactlyZhHK = Assert<keyof typeof SPA_LOCALE_FALLBACK extends 'zh-HK' ? true : false>;

/** 探针用的文案键（三本词典都有，值本身不写死，见 imdb-dynamic.spec 的教训）。 */
const PROBE_KEY = 'appearance.language' as const;

const toSet = (ids: readonly LocaleId[]): Set<string> => new Set(ids);

/** 在 a 而不在 b 的元素（逐元素包含检查的最小件）。 */
function onlyIn(a: readonly LocaleId[], b: readonly LocaleId[]): LocaleId[] {
  const have = toSet(b);
  return a.filter((id) => !have.has(id));
}

/** a == b 的反证：两个方向的多/缺一次列出（只查单向会漏「被单独放宽」的一侧）。 */
function symmetricDiff(a: readonly LocaleId[], b: readonly LocaleId[]): LocaleId[] {
  return [...onlyIn(a, b), ...onlyIn(b, a)];
}

/**
 * 「有偏好、无词典、又没有可用降级」的语言清单 —— 空集才算关系成立。
 * 正向保证每个缺口都有出路，反向保证补了词典就撤掉例外条目。
 */
function findUncoveredLocales(
  held: readonly LocaleId[],
  dictionary: readonly LocaleId[],
  fallback: Readonly<Record<string, LocaleId>>,
): LocaleId[] {
  const dict = toSet(dictionary);
  const uncovered: LocaleId[] = [];
  for (const id of onlyIn(held, dictionary)) {
    const target = fallback[id];
    if (!target || !dict.has(target)) uncovered.push(id);
  }
  for (const id of Object.keys(fallback)) {
    if (dict.has(id)) uncovered.push(id);
  }
  return uncovered;
}

/** 恢复路径实际**不**接受的 locale —— 读行为（filterValidSettings）而不是读常量。 */
function localesRejectedByRestore(ids: readonly LocaleId[]): LocaleId[] {
  const rejected: LocaleId[] = [];
  for (const id of ids) {
    const { valid, dropped } = filterValidSettings({ language: id });
    if (dropped.length > 0 || valid.language !== id) rejected.push(id);
  }
  return rejected;
}

const CONTENT_LOCALES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/entrypoints/content/i18n/locales',
);

/** 内容脚本目录里真实存在的词典文件名（除聚合入口）——派生，不手写清单。 */
function scannedContentLocaleIds(): LocaleId[] {
  return fs
    .readdirSync(CONTENT_LOCALES_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
}

const heldIds = (): LocaleId[] => [...EXTENSION_LOCALES].sort();
const contentIds = (): LocaleId[] => Object.keys(contentLocales).sort();
const dictionaryIds = (): LocaleId[] => [...SPA_MESSAGE_LOCALES].sort();

test.describe('locale 集合关系 · 规则 33', () => {
  test('编译期断言：清单成员与缺口键型被钉住（漂移即 type-check 失败）', () => {
    const typeChecks: [THeldWithinFourIds, THeldCoversFourIds, TGapIsExactlyZhHK] = [
      true,
      true,
      true,
    ];
    expect(typeChecks.every((v) => v === true)).toBe(true);
  });

  test('四道来源全部非空（扫描器空转不得绿）', () => {
    expect(EXTENSION_LOCALES.length, '可持有清单').toBeGreaterThanOrEqual(4);
    expect(Object.keys(contentLocales).length, '注入层 locale').toBeGreaterThanOrEqual(4);
    expect(SPA_MESSAGE_LOCALES.length, 'SPA 词典 locale').toBeGreaterThanOrEqual(3);
    expect(Object.keys(SPA_LOCALE_FALLBACK).length, '降级表').toBeGreaterThanOrEqual(1);
    expect(scannedContentLocaleIds().length, '内容脚本词典文件').toBeGreaterThanOrEqual(4);
    // 无重复：有重复时逐元素比较会被去重掩盖
    expect(new Set<string>(EXTENSION_LOCALES).size).toBe(EXTENSION_LOCALES.length);
  });

  test('注入层 locale == 可持有清单（双向逐元素相等）', () => {
    expect(symmetricDiff(contentIds(), heldIds()), 'H 与 E 不一致').toEqual([]);
  });

  test('内容脚本目录里的词典文件 == 可持有清单（漏挂聚合入口也红）', () => {
    expect(scannedContentLocaleIds(), '词典文件名与清单不一致').toEqual(heldIds());
  });

  test('SPA 词典 ⊆ 可持有；差集恰为已登记的降级例外（结构式，非白名单文本）', () => {
    expect(onlyIn(dictionaryIds(), heldIds()), 'SPA 词典里有清单外的语言').toEqual([]);
    expect(
      findUncoveredLocales(heldIds(), dictionaryIds(), SPA_LOCALE_FALLBACK),
      '缺口未登记可用降级',
    ).toEqual([]);
    // 唯一合法例外就是 zh-HK（popup/options 无粤语文案，见下 describe 的显式降级）。
    expect(onlyIn(heldIds(), dictionaryIds()), 'SPA 无词典的语言集合').toEqual(['zh-HK']);
  });

  test('恢复准入 == 可持有清单（行为读出），陌生语言仍照旧被拒（fail-closed 未削弱）', () => {
    expect(localesRejectedByRestore(heldIds()), '备份恢复丢掉的 locale').toEqual([]);
    // 降级表覆盖的语言也必须能过恢复（它是「可持有」的一部分，上一行已覆盖，此处显式留痕）
    expect(localesRejectedByRestore(Object.keys(SPA_LOCALE_FALLBACK))).toEqual([]);
    expect(localesRejectedByRestore(['fr-FR', 'yy', '']), '恢复不该接受的陌生值').toEqual([
      'fr-FR',
      'yy',
      '',
    ]);
  });
});

test.describe('SPA 对 zh-HK 的解析 · 故意留的缺口必须显式落地', () => {
  test('zh-HK 解析为 zh-TW 文案（不是偶然落到 fallbackLocale 或浏览器语言）', () => {
    expect(resolveSpaLocale('zh-HK')).toBe('zh-TW');
    // 粤语用户不得看到简体：降级目标是繁体，且存储值本身不被改写（见 persistLocale）
    expect(messages['zh-TW'][PROBE_KEY]).not.toBe(messages['zh-CN'][PROBE_KEY]);
  });

  test('zh-HK 确实没有 SPA 词典（补齐词典后这条会红 → 连同降级条目与缺口断言一起删）', () => {
    expect('zh-HK' in messages).toBe(false);
  });

  test('每种可持有语言都解析到一本有该键文案的真实词典', () => {
    for (const id of EXTENSION_LOCALES) {
      const rendered = resolveSpaLocale(id);
      expect(rendered, `${id} 解析不出可渲染 locale`).toBeDefined();
      if (rendered) {
        expect(SPA_MESSAGE_LOCALES, `${id} → ${rendered} 不在词典清单里`).toContain(rendered);
        expect(messages[rendered][PROBE_KEY], `${id} → ${rendered} 缺文案`).not.toBe('');
      }
    }
  });

  test('清单外的值一律交回调用方（不得被解析成任何 locale）', () => {
    for (const junk of ['fr-FR', 'zh', 'en', '', undefined, null]) {
      expect(resolveSpaLocale(junk), `junk=${String(junk)} 不该被解析`).toBeUndefined();
    }
  });
});

test.describe('自检种子 · 扫描器/关系判定坏掉时不得绿', () => {
  const withKorea = [...EXTENSION_LOCALES, 'ko-KR'];

  test('种子：第五种语言无词典且无降级 → 必须报出它', () => {
    expect(findUncoveredLocales(withKorea, SPA_MESSAGE_LOCALES, SPA_LOCALE_FALLBACK)).toEqual([
      'ko-KR',
    ]);
  });

  test('种子：第五种语言登记了可用降级 → 关系成立（不得误报）', () => {
    expect(
      findUncoveredLocales(withKorea, SPA_MESSAGE_LOCALES, {
        ...SPA_LOCALE_FALLBACK,
        'ko-KR': 'en-US',
      }),
    ).toEqual([]);
  });

  test('种子：降级指向不存在的词典 → 必须报出（降级不是自由文本）', () => {
    expect(
      findUncoveredLocales(withKorea, SPA_MESSAGE_LOCALES, {
        ...SPA_LOCALE_FALLBACK,
        'ko-KR': 'zz-ZZ',
      }),
    ).toEqual(['ko-KR']);
  });

  test('种子：补了词典却留着降级条目 → 必须报出（缺口不得静默闭合）', () => {
    expect(
      findUncoveredLocales(
        EXTENSION_LOCALES,
        [...SPA_MESSAGE_LOCALES, 'zh-HK'],
        SPA_LOCALE_FALLBACK,
      ),
    ).toEqual(['zh-HK']);
  });

  test('种子：逐元素比较两个方向都能咬（只查单向会漏被放宽的一侧）', () => {
    expect(symmetricDiff(['a', 'b'], ['b', 'c'])).toEqual(['a', 'c']);
    expect(symmetricDiff(['a', 'b'], ['a', 'b'])).toEqual([]);
    expect(onlyIn(['a'], ['a', 'b'])).toEqual([]);
  });

  test('种子：恢复准入探针可区分（恒空或恒非空都会在这里红）', () => {
    // zh-HK 必须通过、清单外必须被拒：探针若退化成 () => [] 或 (ids) => ids 都红
    expect(localesRejectedByRestore(['zh-HK', 'qq-QQ'])).toEqual(['qq-QQ']);
  });

  test('种子：目录扫描真的读到文件且剔除了聚合入口', () => {
    const scanned = scannedContentLocaleIds();
    expect(scanned).toContain('zh-HK');
    expect(scanned).not.toContain('index');
    expect(symmetricDiff(scanned, contentIds()), '文件与 locale 键集不一致').toEqual([]);
  });
});
