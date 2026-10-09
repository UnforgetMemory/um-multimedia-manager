import { test, expect } from '@playwright/test';
import {
  buildPreview,
  fingerprintPlan,
  judgeDatasetHash,
  mergeDatasetEntries,
  type DatasetEntry,
} from '@/provider/webdav/plan';
import type { DatasetMeta, RemoteMeta, StoreRecord } from '@/types';

/**
 * ADR-027 — WebDAV 预检与并集合并的纯策略契约。
 *
 * 本 spec 锁三件事：
 * 1. `buildPreview` 的方向矩阵与风险估算（含三种模式的语义差异）；
 * 2. `sync` 模式的**不变量**：lossEstimate 恒 0、无孤儿、无回退风险
 *    （这三条是「覆盖式丢失」不再可能的机器可验证表述）；
 * 3. `mergeDatasetEntries` 的并集代数性质：守恒 / 幂等 / 键集可交换 ——
 *    当前实现（整表较新者胜 + 上传覆盖）三条全不满足，是本 ADR 的核心修复对象。
 */

function meta(
  key: string,
  recordCount: number,
  hash: string,
  updatedAt = '2026-01-01T00:00:00.000Z',
): DatasetMeta {
  return { key, hash, updatedAt, recordCount, dataVersion: 1 };
}

function remote(datasets: DatasetMeta[]): RemoteMeta {
  return {
    schema: 'umm-meta',
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    datasets,
  };
}

function entry(key: string, updatedAt: string, over: Partial<StoreRecord> = {}): DatasetEntry {
  return {
    key,
    record: { url: 'u', status: 0, rating: 0, updatedAt, linkedIds: {}, ...over },
  };
}

/** 键 → 内容签名，用于集合级等价断言（顺序无关）。 */
function asMap(entries: DatasetEntry[]): Map<string, string> {
  return new Map(entries.map((e) => [e.key, JSON.stringify(e.record)]));
}

test.describe('buildPreview — sync 模式方向矩阵', () => {
  const local = remote([
    meta('douban_records', 5, 'h1'),
    meta('jav_ids', 3, 'h2'),
    meta('usav_ids', 4, 'h3'),
  ]);

  test('仅本地 → upload；仅远端 → download；两侧空 → skip', () => {
    const p = buildPreview(
      local,
      remote([meta('douban_records', 5, 'h1'), meta('youtube_records', 7, 'h9')]),
      'sync',
    );
    const byKey = new Map(p.rows.map((r) => [r.key, r]));
    expect(byKey.get('douban_records')?.direction).toBe('skip'); // hash 相等
    expect(byKey.get('jav_ids')?.direction).toBe('upload'); // 仅本地
    expect(byKey.get('usav_ids')?.direction).toBe('upload');
    expect(byKey.get('youtube_records')?.direction).toBe('download'); // 仅远端
  });

  test('两侧都有且 hash 不同 → merge（不再有「较新者胜」整表覆盖）', () => {
    const p = buildPreview(local, remote([meta('douban_records', 9, 'hX')]), 'sync');
    const row = p.rows.find((r) => r.key === 'douban_records');
    expect(row?.direction).toBe('merge');
    expect(row?.localCount).toBe(5);
    expect(row?.remoteCount).toBe(9);
  });

  test('计数为 0 的行一律 skip（含两侧都缺）', () => {
    const p = buildPreview(
      remote([meta('douban_records', 0, 'empty')]),
      remote([meta('douban_records', 0, 'empty')]),
      'sync',
    );
    expect(p.rows[0]?.direction).toBe('skip');
    expect(p.totals.skip).toBe(1);
  });

  test('skipKeys（__settings__ 等非记录数据集）强制 skip，永不进入合并', () => {
    const p = buildPreview(
      remote([meta('__settings__', 12, 's1', '2026-02-01T00:00:00.000Z')]),
      remote([meta('__settings__', 11, 's2', '2026-01-01T00:00:00.000Z')]),
      'sync',
      { skipKeys: new Set(['__settings__']) },
    );
    expect(p.rows[0]?.direction).toBe('skip');
  });

  test('sync 不变量：无丢失估算、无孤儿、无回退风险（覆盖式丢失的不可能证明）', () => {
    const p = buildPreview(
      local,
      remote([
        meta('douban_records', 100, 'hX', '2030-01-01T00:00:00.000Z'),
        meta('jav_ids', 99, 'hY', '2020-01-01T00:00:00.000Z'),
      ]),
      'sync',
    );
    expect(p.totals.lossEstimate).toBe(0);
    expect(p.totals.orphaned).toBe(0);
    expect(p.totals.revertsNewer).toBe(0);
    for (const r of p.rows) {
      expect(r.lossEstimate).toBe(0);
      expect(r.orphansRemote).toBe(false);
      expect(r.revertsNewer).toBe(false);
    }
  });

  test('totals 逐方向计数与行一致', () => {
    const p = buildPreview(
      local,
      remote([
        meta('douban_records', 100, 'hX'), // merge
        meta('youtube_records', 7, 'h9'), // download
      ]),
      'sync',
    );
    expect(p.totals.merge).toBe(1);
    expect(p.totals.upload).toBe(2); // jav_ids + usav_ids
    expect(p.totals.download).toBe(1);
    expect(p.totals.skip).toBe(0);
  });
});

test.describe('buildPreview — upload / download 模式的显式风险', () => {
  test('upload：本地为空而远端有数据 → 高危孤儿行，且按远端全量估算丢失', () => {
    const p = buildPreview(remote([]), remote([meta('douban_records', 100, 'hX')]), 'upload');
    const row = p.rows[0];
    expect(row?.direction).toBe('skip');
    expect(row?.orphansRemote).toBe(true);
    expect(row?.lossEstimate).toBe(100);
    expect(p.totals.orphaned).toBe(1);
    expect(p.totals.lossEstimate).toBe(100);
  });

  test('upload：本地少云端多 → 差值即估算丢失；本地多则无风险', () => {
    const shrink = buildPreview(
      remote([meta('douban_records', 2, 'h1')]),
      remote([meta('douban_records', 100, 'hX')]),
      'upload',
    );
    expect(shrink.rows[0]?.direction).toBe('upload');
    expect(shrink.rows[0]?.lossEstimate).toBe(98);

    const grow = buildPreview(
      remote([meta('douban_records', 100, 'h1')]),
      remote([meta('douban_records', 2, 'hX')]),
      'upload',
    );
    expect(grow.rows[0]?.lossEstimate).toBe(0);
  });

  test('download：本地 latest 更晚 → 提示回退风险；更早则无', () => {
    const revert = buildPreview(
      remote([meta('douban_records', 5, 'h1', '2030-01-01T00:00:00.000Z')]),
      remote([meta('douban_records', 9, 'hX', '2020-01-01T00:00:00.000Z')]),
      'download',
    );
    expect(revert.rows[0]?.direction).toBe('download');
    expect(revert.rows[0]?.revertsNewer).toBe(true);
    expect(revert.totals.revertsNewer).toBe(1);
    // 下载是逐记录 upsert，不删本地记录 ⇒ 不计入 lossEstimate
    expect(revert.totals.lossEstimate).toBe(0);

    const noRevert = buildPreview(
      remote([meta('douban_records', 5, 'h1', '2020-01-01T00:00:00.000Z')]),
      remote([meta('douban_records', 9, 'hX', '2030-01-01T00:00:00.000Z')]),
      'download',
    );
    expect(noRevert.rows[0]?.revertsNewer).toBe(false);
  });

  test('远端缺失（remoteMeta=null）→ 仅本地行按模式判定，不抛错', () => {
    const p = buildPreview(remote([meta('douban_records', 5, 'h1')]), null, 'sync');
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]?.direction).toBe('upload');
  });
});

test.describe('fingerprintPlan — TOCTOU 指纹', () => {
  const base = () => remote([meta('douban_records', 5, 'h1'), meta('jav_ids', 3, 'h2')]);

  test('相同输入 → 相同指纹（稳定）', async () => {
    const a = await fingerprintPlan(buildPreview(base(), remote([]), 'sync'));
    const b = await fingerprintPlan(buildPreview(base(), remote([]), 'sync'));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test('任一计数/时间/方向变化 → 指纹变化（预检过期可检出）', async () => {
    const before = await fingerprintPlan(buildPreview(base(), remote([]), 'sync'));
    const countChanged = await fingerprintPlan(
      buildPreview(
        remote([meta('douban_records', 6, 'h1'), meta('jav_ids', 3, 'h2')]),
        remote([]),
        'sync',
      ),
    );
    expect(countChanged).not.toBe(before);

    const timeChanged = await fingerprintPlan(
      buildPreview(
        remote([
          meta('douban_records', 5, 'h1', '2026-03-01T00:00:00.000Z'),
          meta('jav_ids', 3, 'h2'),
        ]),
        remote([]),
        'sync',
      ),
    );
    expect(timeChanged).not.toBe(before);
  });

  test('模式不同 → 指纹不同（上传计划不可用于执行同步）', async () => {
    const sync = await fingerprintPlan(buildPreview(base(), remote([]), 'sync'));
    const upload = await fingerprintPlan(buildPreview(base(), remote([]), 'upload'));
    expect(sync).not.toBe(upload);
  });

  test('计数为 0 的一侧的 now 占位时间戳不参与指纹（TOCTOU 假阳性的单测锚点）', async () => {
    // buildLocalMeta 对空表用 new Date().toISOString() 占位，每次构建都不同 ——
    // 若参与指纹，预检与执行会必然失配，UI 上任何同步都报 STALE_PLAN。
    const emptyAt = (latest: string) => remote([meta('douban_records', 0, 'empty', latest)]);
    const a = await fingerprintPlan(
      buildPreview(emptyAt('2026-01-01T00:00:00.000Z'), remote([]), 'sync'),
    );
    const b = await fingerprintPlan(
      buildPreview(emptyAt('2099-12-31T23:59:59.000Z'), remote([]), 'sync'),
    );
    expect(a).toBe(b);
  });

  test('计数 > 0 的一侧 latest 变化仍然改变指纹（规则不吞真实变更）', async () => {
    const at = (latest: string) => remote([meta('jav_ids', 3, 'h2', latest)]);
    const a = await fingerprintPlan(
      buildPreview(at('2026-01-01T00:00:00.000Z'), remote([]), 'sync'),
    );
    const b = await fingerprintPlan(
      buildPreview(at('2027-01-01T00:00:00.000Z'), remote([]), 'sync'),
    );
    expect(a).not.toBe(b);
  });

  test('非合并数据集（__settings__）的 latest 被收敛为空串 ⇒ 不参与指纹、也不误导 UI', async () => {
    const opts = { skipKeys: new Set(['__settings__']) };
    const at = (ts: string) => remote([meta('__settings__', 12, 's1', ts)]);
    const p1 = buildPreview(at('2026-01-01T00:00:00.000Z'), remote([]), 'sync', opts);
    const p2 = buildPreview(at('2099-12-31T23:59:59.000Z'), remote([]), 'sync', opts);
    expect(p1.rows[0]?.localLatest, 'settings 的时间戳无含义，必须空串').toBe('');
    expect(await fingerprintPlan(p1)).toBe(await fingerprintPlan(p2));
  });

  test('计数为 0 的一侧的 latest 也被收敛为空串（UI 不得显示「本地最新 = 刚刚」）', async () => {
    // 用户实测截图里出现过：本地 0 条却显示「本地最新 2026-10-05 00:05」（now 占位）。
    const p = buildPreview(
      remote([meta('douban_records', 0, 'empty', '2026-10-05T00:05:00.000Z')]),
      remote([meta('douban_records', 15018, 'r1', '2026-10-04T23:50:00.000Z')]),
      'download',
    );
    const row = p.rows[0];
    expect(row?.localCount).toBe(0);
    expect(row?.localLatest, '空表的占位时间戳不得透出').toBe('');
    expect(row?.remoteLatest, '有记录的一侧必须保留真实时间').toBe('2026-10-04T23:50:00.000Z');
  });

  test('download：两侧时间戳相同但内容不同 ⇒ 同样标为「本地会被云端覆盖」', () => {
    // 原实现只在「本地更晚」时告警，等时间戳 + 内容有别（典型是注释）会被静默回退。
    const same = '2026-10-02T22:50:00.000Z';
    const p = buildPreview(
      remote([meta('tmdb_records', 117, 'local-hash', same)]),
      remote([meta('tmdb_records', 117, 'remote-hash', same)]),
      'download',
    );
    expect(p.rows[0]?.hashEqual).toBe(false);
    expect(p.rows[0]?.revertsNewer, '等时间戳 + 内容不同必须告警').toBe(true);
  });

  test('download：两侧完全一致（hash 相同）⇒ 不误报覆盖风险', () => {
    const same = '2026-10-02T22:50:00.000Z';
    const p = buildPreview(
      remote([meta('tmdb_records', 117, 'same-hash', same)]),
      remote([meta('tmdb_records', 117, 'same-hash', same)]),
      'download',
    );
    expect(p.rows[0]?.direction).toBe('skip');
    expect(p.rows[0]?.revertsNewer).toBe(false);
  });
});

test.describe('judgeDatasetHash — R2 代际偏斜裁决', () => {
  const hash = (c: string) => c.repeat(64);

  test('非 64-hex 期望值不参与（旧格式与 empty/unknown 哨兵的兼容口径不回退）', () => {
    for (const expected of [undefined, 'empty', 'unknown', '', 'ABC']) {
      expect(judgeDatasetHash(expected, 'x', true)).toBe('accept');
    }
  });

  test('一致 ⇒ accept；ZIP 连自带 manifest 都对不上（代际表全不中）⇒ 拒绝（真损坏）', () => {
    expect(judgeDatasetHash(hash('a'), hash('a'), true)).toBe('accept');
    expect(judgeDatasetHash(hash('a'), hash('b'), false)).toBe('refuse-corrupt-zip');
  });

  test('ZIP 自洽但 meta 陈旧 ⇒ 一律自愈采纳（覆盖=显式 cloud-wins 幂等；sync=并集安全）', () => {
    expect(judgeDatasetHash(hash('a'), hash('b'), true)).toBe('accept-stale-generation');
  });
});

test.describe('mergeDatasetEntries — 并集 + 逐记录较新者胜', () => {
  test('两侧独有键全部保留（守恒：结果不小于任一侧）', () => {
    const local = [entry('a', '2026-01-01T00:00:00.000Z'), entry('b', '2026-01-01T00:00:00.000Z')];
    const remote2 = [
      entry('b', '2020-01-01T00:00:00.000Z'),
      entry('c', '2026-01-01T00:00:00.000Z'),
    ];
    const out = mergeDatasetEntries(local, remote2);
    expect(out.merged.map((e) => e.key).sort()).toEqual(['a', 'b', 'c']);
    expect(out.merged.length).toBeGreaterThanOrEqual(Math.max(local.length, remote2.length));
    expect(out.keptLocal).toContain('a');
    expect(out.fromRemote).toEqual(['c']);
  });

  test('同键取较新者：远端更新则采纳远端，本地更新则保留本地', () => {
    const localNewer = mergeDatasetEntries(
      [entry('a', '2030-01-01T00:00:00.000Z', { status: 2 })],
      [entry('a', '2020-01-01T00:00:00.000Z', { status: 1 })],
    );
    expect(localNewer.merged[0]?.record.status).toBe(2);
    expect(localNewer.keptLocal).toEqual(['a']);
    expect(localNewer.takenRemoteNewer).toEqual([]);

    const remoteNewer = mergeDatasetEntries(
      [entry('a', '2020-01-01T00:00:00.000Z', { status: 1 })],
      [entry('a', '2030-01-01T00:00:00.000Z', { status: 2 })],
    );
    expect(remoteNewer.merged[0]?.record.status).toBe(2);
    expect(remoteNewer.takenRemoteNewer).toEqual(['a']);
  });

  test('同时间同内容 → 等价，不记冲突', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const out = mergeDatasetEntries(
      [entry('a', ts, { rating: 8 })],
      [entry('a', ts, { rating: 8 })],
    );
    expect(out.conflicts).toEqual([]);
    expect(out.merged).toHaveLength(1);
  });

  test('同时间不同内容 → 保留本地并登记冲突（不静默丢弃任一侧）', () => {
    const ts = '2026-01-01T00:00:00.000Z';
    const out = mergeDatasetEntries(
      [entry('a', ts, { rating: 8 })],
      [entry('a', ts, { rating: 3 })],
    );
    expect(out.conflicts).toEqual(['a']);
    expect(out.merged[0]?.record.rating).toBe(8);
  });

  test('时间不可解析 → 视为同时间，退化为内容比较（不抛错、不误判更新）', () => {
    const out = mergeDatasetEntries(
      [entry('a', 'not-a-date', { rating: 8 })],
      [entry('a', '', { rating: 3 })],
    );
    expect(out.conflicts).toEqual(['a']);
    expect(out.merged[0]?.record.rating).toBe(8);
  });

  test('幂等：merge(merge(a,b), b) 与 merge(a,b) 逐键一致', () => {
    const local = [
      entry('a', '2030-01-01T00:00:00.000Z', { status: 2 }),
      entry('b', '2026-01-01T00:00:00.000Z'),
    ];
    const remote2 = [
      entry('a', '2020-01-01T00:00:00.000Z', { status: 1 }),
      entry('c', '2026-01-01T00:00:00.000Z'),
      entry('d', '2026-01-01T00:00:00.000Z'),
    ];
    const once = mergeDatasetEntries(local, remote2);
    const twice = mergeDatasetEntries(once.merged, remote2);
    expect(asMap(twice.merged)).toEqual(asMap(once.merged));
  });

  test('键集可交换：两侧顺序互换不改变并集键集合', () => {
    const a = [entry('a', '2026-01-01T00:00:00.000Z'), entry('b', '2026-01-01T00:00:00.000Z')];
    const b = [entry('b', '2027-01-01T00:00:00.000Z'), entry('c', '2026-01-01T00:00:00.000Z')];
    const ab = mergeDatasetEntries(a, b);
    const ba = mergeDatasetEntries(b, a);
    expect([...asMap(ab.merged).keys()].sort()).toEqual([...asMap(ba.merged).keys()].sort());
  });

  test('任一侧为空 → 原样返回另一侧全部', () => {
    const local = [entry('a', '2026-01-01T00:00:00.000Z'), entry('b', '2026-01-01T00:00:00.000Z')];
    expect(asMap(mergeDatasetEntries(local, []).merged)).toEqual(asMap(local));
    expect(asMap(mergeDatasetEntries([], local).merged)).toEqual(asMap(local));
  });

  test('不修改入参数组（纯函数）', () => {
    const local = [entry('a', '2026-01-01T00:00:00.000Z')];
    const remote2 = [
      entry('a', '2030-01-01T00:00:00.000Z'),
      entry('z', '2026-01-01T00:00:00.000Z'),
    ];
    mergeDatasetEntries(local, remote2);
    expect(local).toHaveLength(1);
    expect(remote2).toHaveLength(2);
    expect(local[0]?.record.status).toBe(0);
  });
});
