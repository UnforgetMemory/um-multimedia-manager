/**
 * WebDAV 同步预检与并集合并 —— 纯策略，零 I/O（ADR-027）。
 *
 * 定位与 `./mapping` 相同：只放**确定性规则**，不触网络/存储，便于单测。
 * 传输在 `./api`，编排在 `src/entrypoints/background/handlers/webdav-*`。
 *
 * 三个职责：
 * 1. `buildPreview` —— 由两侧 meta 推导逐表同步计划（方向、计数、风险），**不读 ZIP**；
 * 2. `fingerprintPlan` —— 计划指纹，供执行侧做 TOCTOU 校验（预检后被改写则中止）；
 * 3. `mergeDatasetEntries` —— 并集 + 逐记录较新者胜，保证「同步永不减少记录数」。
 *
 * 行/汇总的类型契约在 `@/types`（wire 面），本模块只提供纯函数。
 */

import type {
  RemoteMeta,
  StoreRecord,
  SyncPlanDirection,
  SyncPlanMode,
  SyncPlanRow,
  SyncPlanTotals,
  SyncPreview,
} from '@/types';
import { recordSignature } from '@/libraries/utils/hash-utils';

/** ISO 时间串的新旧比较；不可解析视为「未知」→ 返回 0（退化为内容签名判定）。 */
function compareRecency(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return ta === tb ? 0 : ta > tb ? 1 : -1;
}

/** 预检选项。 */
export interface PreviewOptions {
  /**
   * 强制判为 `skip` 的键（不参与合并的虚拟数据集，如 `__settings__` ——
   * 其内容是标量 JSON 而非 StoreRecord，走合并路径会破坏数据；ADR-016 决策 5）。
   */
  skipKeys?: ReadonlySet<string>;
}
/**
 * 依据两侧 meta 推导同步计划。
 *
 * 注意：预检**只读 meta**，因此 `lossEstimate` / `revertsNewer` 均为计数级估算
 * （无 ZIP 内容可比）。`sync` 模式下二者按定义不可达，取值恒为 0/false，由实测 spec 锁定。
 */
export function buildPreview(
  localMeta: RemoteMeta,
  remoteMeta: RemoteMeta | null,
  mode: SyncPlanMode,
  opts: PreviewOptions = {},
): SyncPreview {
  const localMap = new Map(localMeta.datasets.map((d) => [d.key, d]));
  const remoteMap = new Map((remoteMeta?.datasets ?? []).map((d) => [d.key, d]));

  const keys = [...new Set([...localMap.keys(), ...remoteMap.keys()])].toSorted((a, b) =>
    a.localeCompare(b),
  );

  const rows: SyncPlanRow[] = [];
  for (const key of keys) {
    const local = localMap.get(key);
    const remote = remoteMap.get(key);
    const localCount = local?.recordCount ?? 0;
    const remoteCount = remote?.recordCount ?? 0;
    // 时间戳只在「该侧确有记录、且该数据集参与合并」时才有含义：本地空表由
    // `buildLocalMeta` 用 now 占位，`__settings__` 更是每次构建都取 now。直接透出会让
    // 预览矩阵显示「本地最新 = 刚刚」这类误导信息（用户实测截图里就出现了）。
    // 规则收敛到这一处 —— 于是指纹无需再单独判「计数为 0 的一侧不参与」。
    const meaningfulLatest = (ts: string, count: number): string =>
      count > 0 && opts.skipKeys?.has(key) !== true ? ts : '';
    const localLatest = meaningfulLatest(local?.updatedAt ?? '', localCount);
    const remoteLatest = meaningfulLatest(remote?.updatedAt ?? '', remoteCount);
    const hashEqual = local !== undefined && remote !== undefined && local.hash === remote.hash;
    const bothEmpty = localCount === 0 && remoteCount === 0;

    let direction: SyncPlanDirection;
    let lossEstimate = 0;
    let orphansRemote = false;
    let revertsNewer = false;

    if (bothEmpty || hashEqual || opts.skipKeys?.has(key) === true) {
      direction = 'skip';
    } else if (mode === 'sync') {
      // 并集合并：两侧都有数据即合并（永不减少），单侧独有即该侧方向。
      direction = remoteCount === 0 ? 'upload' : localCount === 0 ? 'download' : 'merge';
    } else if (mode === 'upload') {
      // 显式覆盖语义：本地为空时编排层不写 blob、仅把 meta 计为 0 —— 既有云端 blob
      // 由此变成不可达孤儿，等价于丢失，故一并计入 `lossEstimate`。
      orphansRemote = localCount === 0 && remoteCount > 0;
      direction = orphansRemote ? 'skip' : 'upload';
      lossEstimate = Math.max(0, remoteCount - localCount);
    } else {
      direction = remoteCount === 0 ? 'skip' : 'download';
      // 本地版本会被云端覆盖的两种情况：本地更晚，或**同时间戳但内容不同**
      // （下载按既有语义以云端为准）。后者原先不告警 ⇒ 注释类本地修订被静默回退。
      revertsNewer =
        direction === 'download' &&
        localCount > 0 &&
        (localLatest > remoteLatest || (localLatest === remoteLatest && !hashEqual));
    }

    rows.push({
      key,
      localCount,
      remoteCount,
      localLatest,
      remoteLatest,
      hashEqual,
      direction,
      lossEstimate,
      orphansRemote,
      revertsNewer,
    });
  }

  const totals: SyncPlanTotals = {
    upload: 0,
    download: 0,
    merge: 0,
    skip: 0,
    lossEstimate: 0,
    orphaned: 0,
    revertsNewer: 0,
  };
  for (const r of rows) {
    if (r.direction !== 'skip') totals[r.direction]++;
    else totals.skip++;
    totals.lossEstimate += r.lossEstimate;
    if (r.orphansRemote) totals.orphaned++;
    if (r.revertsNewer) totals.revertsNewer++;
  }

  return { mode, rows, totals };
}

/**
 * 计划指纹 —— 执行侧据其检测「预检之后、执行之前」的第三方改写（TOCTOU）。
 *
 * 覆盖范围 = 决定方向与执行量的字段：键、两侧计数、两侧时间戳、hash 是否相等、方向。
 * 时间戳在此**无需**再做「计数为 0 的一侧不参与」的判断：`buildPreview` 已把无含义的
 * 时间戳收敛为空串（单一规则），因此同一状态下两次构建必然得到同一指纹。
 */
export async function fingerprintPlan(preview: SyncPreview): Promise<string> {
  const payload = {
    mode: preview.mode,
    rows: preview.rows.map((r) => ({
      key: r.key,
      localCount: r.localCount,
      remoteCount: r.remoteCount,
      localLatest: r.localLatest,
      remoteLatest: r.remoteLatest,
      hashEqual: r.hashEqual,
      direction: r.direction,
    })),
  };
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface DatasetEntry {
  key: string;
  record: StoreRecord;
}

/**
 * 校验远端 meta 声明的 dataset hash 与 ZIP 自述的 hash 是否一致（ADR-027 R2 兜底）。
 *
 * 只在**期望值形态可信**（64 位 hex）时判定：`'empty'` / `'unknown'`（旧格式归一化
 * 的兜底值）与任意非 64-hex 值都不参与 —— 否则旧备份会被整表误拒。
 * 不一致即抛错：宁可拒绝把一份与 meta 不符的记录集吞进本地，也不静默接受混装状态。
 */
export type DatasetHashVerdict = 'accept' | 'accept-stale-generation' | 'refuse-corrupt-zip';

/**
 * R2 修正（2026-10-05，代际偏斜自愈）：远端 meta 声明 hash 与 ZIP 自述 hash 不一致
 * 有两种成因 —— (a) ZIP 数据与其自带 manifest 都不符（截断/篡改，真损坏）；
 * (b) ZIP 是某次上传的**完整一代**（数据与自带 manifest 由 `packageDataset` 原子写出，
 * 内部必然自洽），只是远端 meta 陈旧 —— 旧版上传无原子交换、中途中断即产生这种状态，
 * 由产品自身历史版本写入，不是用户数据问题。因此：
 *   - ZIP 连自带 manifest 都对不上（哈希代际表全不中）⇒ 拒绝（真损坏）；
 *   - ZIP 自洽 ⇒ 采纳（download = 显式 cloud-wins 覆盖，幂等可重复；sync = 逐记录
 *     较新者胜的并集，永不盲目丢失）。本地是否为空**不参与**裁决 —— 「云端覆盖本地」
 *     的语义就是以云端为准，用户重复点击必须可收敛（真机实证：恢复后本地非空即拒绝，
 *     用户反复点击覆盖被两头困死）。
 * expectedHash 非 64-hex（'empty'/'unknown'/旧格式）不参与判定，维持旧兼容口径。
 * ZIP 内部自洽的判定（含哈希算法生成表的版本兼容）在调用方：`identifyStoreHashGeneration`。
 */
export function judgeDatasetHash(
  expectedHash: string | undefined,
  zipSelfHash: unknown,
  zipInternallyConsistent: boolean,
): DatasetHashVerdict {
  if (expectedHash === undefined || !/^[0-9a-f]{64}$/.test(expectedHash)) return 'accept';
  if (zipSelfHash === expectedHash) return 'accept';
  if (!zipInternallyConsistent) return 'refuse-corrupt-zip';
  return 'accept-stale-generation';
}

export interface MergeOutcome {
  /** 并集结果：本地顺序在前，远端独有键追加在后。 */
  merged: DatasetEntry[];
  /** 本地独有或本地更新，保留本地值。 */
  keptLocal: string[];
  /** 本地缺失，采纳远端值。 */
  fromRemote: string[];
  /** 同键且远端更新，采纳远端值。 */
  takenRemoteNewer: string[];
  /** 同键同时间但内容不同 —— 保留本地并登记（ADR-027 冲突策略）。 */
  conflicts: string[];
}

/**
 * 并集合并：**结果的行数不会少于任一侧**，因而同步永不减少记录。
 *
 * 逐键规则：本地缺失 → 采纳远端；远端缺失 → 保留本地；两侧都有 → `updatedAt`
 * 较新者胜，时间相同看内容签名，内容也相同则等价、内容不同则保留本地并记冲突。
 *
 * 幂等性由「同时间保留本地」保证：`merge(merge(a,b), b)` 的每个键取值与
 * `merge(a,b)` 一致（已被采纳的远端值在第二轮成为本地值且时间相同）。
 */
export function mergeDatasetEntries(local: DatasetEntry[], remote: DatasetEntry[]): MergeOutcome {
  const remoteMap = new Map(remote.map((e) => [e.key, e.record]));
  const seen = new Set<string>();
  const merged: DatasetEntry[] = [];
  const keptLocal: string[] = [];
  const fromRemote: string[] = [];
  const takenRemoteNewer: string[] = [];
  const conflicts: string[] = [];

  for (const { key, record } of local) {
    seen.add(key);
    const remoteRecord = remoteMap.get(key);
    if (remoteRecord === undefined) {
      keptLocal.push(key);
      merged.push({ key, record });
      continue;
    }
    const recency = compareRecency(record.updatedAt, remoteRecord.updatedAt);
    if (recency > 0) {
      keptLocal.push(key);
      merged.push({ key, record });
    } else if (recency < 0) {
      takenRemoteNewer.push(key);
      merged.push({ key, record: remoteRecord });
    } else if (recordSignature(record) === recordSignature(remoteRecord)) {
      keptLocal.push(key);
      merged.push({ key, record });
    } else {
      conflicts.push(key);
      merged.push({ key, record });
    }
  }

  for (const { key, record } of remote) {
    if (seen.has(key)) continue;
    fromRemote.push(key);
    merged.push({ key, record });
  }

  return { merged, keptLocal, fromRemote, takenRemoteNewer, conflicts };
}
