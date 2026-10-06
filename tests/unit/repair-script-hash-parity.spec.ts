/**
 * repair-webdav-meta.mjs 哈希复刻 parity 守卫（双代）。
 *
 * `scripts/repair-webdav-meta.mjs` 的「ZIP 内部自洽」校验依赖手写复刻的哈希实现
 * （脚本无法直接 import 仓库 TS）。若 src 侧算法/生成表漂移而脚本未同步，脚本的
 * fail-safe 会把所有表误报「内部不自洽」、拒绝写入 —— 修复路径静默失效。
 * 本 spec 用**独立 oracle**（逐字复刻脚本实现）与真实实现比对，锁住两侧一致；
 * 改 hash-utils.ts（含 HASH_FIELDS_GENERATIONS 生成表）或脚本任一侧时本 spec 必须同步。
 *
 * 覆盖双代：gen-2（当前，含 comment）/ gen-1（≤5.18.0 发布版，无 comment）——
 * 用户云端 ZIP 由历史算法代写入，脚本只认当前代会把完整旧代备份误报「真损坏」。
 */

import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import {
  calculateStoreHash,
  calculateLegacyStoreHash,
  identifyStoreHashGeneration,
  HASH_FIELDS_GENERATIONS,
} from '@/libraries/utils/hash-utils';
import type { StoreRecord } from '@/types';

/** 逐字复刻 scripts/repair-webdav-meta.mjs 的生成表与实现（SSOT 见该文件头注释）。 */
const SCRIPT_GENERATIONS: ReadonlyArray<readonly string[]> = [
  ['status', 'rating', 'linkedIds', 'url'], // gen-1：≤5.18.0 发布版
  ['status', 'rating', 'comment', 'linkedIds', 'url'], // gen-2：ADR-027 起（当前）
];

/** 逐字复刻脚本版 identifyGeneration（按 dataVersion 轴驱动）。 */
function scriptIdentify(
  entries: Array<{ key: string; record: StoreRecord }>,
  zipSelfHash: unknown,
  dataVersion: number,
): number | null {
  if (typeof zipSelfHash !== 'string') return null;
  if (entries.length === 0) return zipSelfHash === 'empty' ? 1 : null;
  const candidates = dataVersion >= 2 ? [dataVersion] : SCRIPT_GENERATIONS.map((_, i) => i + 1);
  for (const gen of candidates) {
    const fields = SCRIPT_GENERATIONS[gen - 1];
    if (!fields) continue;
    if (scriptHashWithFields(entries, fields) === zipSelfHash) return gen;
  }
  return null;
}

function scriptHashWithFields(
  entries: Array<{ key: string; record: StoreRecord }>,
  fields: readonly string[],
): string {
  if (entries.length === 0) return 'empty';
  const sorted = entries.toSorted((a, b) => a.key.localeCompare(b.key));
  const dataToHash = sorted.map(({ key, record }) => {
    const sig: Record<string, unknown> = {};
    const source = record as unknown as Record<string, unknown>;
    for (const field of fields) sig[field] = source[field];
    return { key, ...sig };
  });
  const bytes = new TextEncoder().encode(JSON.stringify(dataToHash));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function makeRecord(i: number): StoreRecord {
  return {
    url: `https://example.com/${i % 3 === 0 ? 'tv' : 'movie'}/${i}`,
    status: i % 4,
    rating: i % 10 === 0 ? 8.5 : 0,
    updatedAt: `2026-0${(i % 9) + 1}-15T10:00:00.000Z`,
    linkedIds: i % 7 === 0 ? { tmdb: `tm-${i}` } : {},
    ...(i % 5 === 0 ? { comment: `中文评论 ${i} ✅` } : {}),
  };
}

test('双代 parity：脚本生成表与扩展 HASH_FIELDS_GENERATIONS 逐字节一致', async () => {
  // 生成表本身必须对齐（新增代次时两侧同步 —— 漏一侧 = 旧代备份误判）。
  expect(SCRIPT_GENERATIONS.length).toBe(HASH_FIELDS_GENERATIONS.length);
  HASH_FIELDS_GENERATIONS.forEach((fields, i) => {
    expect([...fields], `生成表第 ${i + 1} 代字段集`).toEqual([...SCRIPT_GENERATIONS[i]!]);
  });

  const cases: Array<Array<{ key: string; record: StoreRecord }>> = [
    [],
    [{ key: 'movie::1', record: makeRecord(1) }],
    // 无 comment 记录（undefined 键必须被两侧同样剔除；gen-1/gen-2 对此同哈希）
    Array.from({ length: 50 }, (_, i) => ({ key: `movie::${i}`, record: makeRecord(i) })),
    // 非 ASCII 键 + 中文/emoji 内容（UTF-8 → 摘要链路）
    Array.from({ length: 50 }, (_, i) => ({
      key: `番号::TEST-${String(i).padStart(4, '0')}`,
      record: { ...makeRecord(i), comment: `评论 ${i} 🎬` },
    })),
    // 乱序输入（排序归一后必须同哈希）
    Array.from({ length: 100 }, (_, i) => ({
      key: `movie::${999 - i}`,
      record: makeRecord(i),
    })).reverse(),
  ];

  for (const entries of cases) {
    const [realGen2, realGen1, scriptGen2, scriptGen1] = await Promise.all([
      calculateStoreHash(entries),
      calculateLegacyStoreHash(entries),
      Promise.resolve(scriptHashWithFields(entries, SCRIPT_GENERATIONS[1]!)),
      Promise.resolve(scriptHashWithFields(entries, SCRIPT_GENERATIONS[0]!)),
    ]);
    expect(scriptGen2, `${entries.length} 条用例 gen-2 复刻必须一致`).toBe(realGen2);
    expect(scriptGen1, `${entries.length} 条用例 gen-1 复刻必须一致`).toBe(realGen1);
    // 语义锚点：无 comment 的记录两代同哈希（HASH_FIELDS 纳入 comment 的字节不变性）。
    if (entries.every((e) => e.record.comment === undefined) && entries.length > 0) {
      expect(realGen1).toBe(realGen2);
    }
    // 语义锚点：含 comment 的记录两代必不同（否则 gen-1 兼容层形同虚设）。
    if (entries.some((e) => e.record.comment !== undefined) && entries.length > 0) {
      expect(realGen1).not.toBe(realGen2);
    }
  }

  // 乱序归一：同集合不同顺序 ⇒ 同哈希（两侧一致地不敏感）。
  const a = Array.from({ length: 30 }, (_, i) => ({ key: `movie::${i}`, record: makeRecord(i) }));
  expect(scriptHashWithFields([...a].reverse(), SCRIPT_GENERATIONS[1]!)).toBe(
    scriptHashWithFields(a, SCRIPT_GENERATIONS[1]!),
  );
});

test('版本轴识别 parity：dataVersion 驱动的解读规则两侧一致', async () => {
  // gen-2 记录集（当前算法）：v2 只验当前代 ⇒ 命中 2；v1 歧义带 ⇒ 逐代也命中 2。
  const gen2Entries = Array.from({ length: 20 }, (_, i) => ({
    key: `movie::${i}`,
    record: makeRecord(i),
  }));
  const gen2Hash = await calculateStoreHash(gen2Entries);
  const gen1Entries = gen2Entries.map(({ key, record }) => {
    const { comment: _comment, ...rest } = record;
    return { key, record: rest as StoreRecord };
  });
  const gen1Hash = await calculateLegacyStoreHash(gen1Entries);

  for (const [entries, selfHash, label] of [
    [gen2Entries, gen2Hash, 'gen-2 数据集'],
    [gen1Entries, gen1Hash, 'gen-1 数据集'],
  ] as const) {
    // v1 歧义带：逐代尝试 ⇒ 两侧都命中各自代。
    expect(scriptIdentify(entries, selfHash, 1), `v1 歧义带 ${label}`).toBe(
      await identifyStoreHashGeneration(entries, selfHash, 1),
    );
    expect(
      await identifyStoreHashGeneration(entries, selfHash, 1),
      `v1 歧义带 ${label}`,
    ).not.toBeNull();
    // v2 精确轴：gen-2 哈希命中 2；gen-1 哈希在 v2 下被拒（只验当前代 ⇒ null）。
    expect(await identifyStoreHashGeneration(entries, selfHash, 2), `v2 精确轴 ${label}`).toBe(2);
  }

  // v2 精确轴的边界：**含 comment 的数据** + gen-1 哈希 + dataVersion 2 ⇒ 不再逐代
  // ⇒ null（真损坏语义）。注意必须用含评论的数据 —— 无评论记录两代同哈希，
  // gen-1 哈希会被 gen-2 字段集意外命中（字节不变性的推论）。
  const commentedEntries = Array.from({ length: 20 }, (_, i) => ({
    key: `movie::${i}`,
    record: { ...makeRecord(i), comment: `评论 ${i}` },
  }));
  const commentedGen1Hash = await calculateLegacyStoreHash(commentedEntries);
  expect(commentedGen1Hash).not.toBe(await calculateStoreHash(commentedEntries));
  expect(scriptIdentify(commentedEntries, commentedGen1Hash, 2)).toBe(null);
  expect(await identifyStoreHashGeneration(commentedEntries, commentedGen1Hash, 2)).toBe(null);

  // 空数据集：'empty' 哨兵命中；不匹配则 null。
  expect(scriptIdentify([], 'empty', 1)).toBe(1);
  expect(await identifyStoreHashGeneration([], 'empty', 2)).toBe(1);
  expect(await identifyStoreHashGeneration([], 'x', 1)).toBe(null);
});
