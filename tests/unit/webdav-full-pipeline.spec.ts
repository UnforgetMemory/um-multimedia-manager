/**
 * WebDAV 三操作全链路深度模拟（失败路径篇）—— 真实规模（≈2.87 万条，复刻用户云端矩阵）。
 *
 * 背景（2026-10-05 用户实测）：点击「云端覆盖本地」后本地数据零变化。安装构建的
 * 预检指纹把空表/设置的 now 占位时间戳算进了指纹 ⇒ 预检与执行之间指纹必然漂移 ⇒
 * 每次执行都 STALE_PLAN 中止、零写入。plan 层已修（meaningfulLatest 收敛），本 spec
 * 把修复钉在**处理器级**：真实 buildLocalMeta + 真 HTTP 往返下，两次预检指纹必须一致。
 *
 * 与既有层的关系（不重复）：
 *  - `webdav-sync-plan.spec.ts`：纯策略层（方向矩阵/指纹/合并代数）；
 *  - `webdav-api*.spec.ts`：传输层（协议形态/真 TCP）;
 *  - **本文件**：A 上传建云 → B 清本地恢复 28,709 条 → C 分叉合并 → D 注入两类损坏
 *    数据验证失败路径（不允许静默吞表）；
 *  - `webdav-full-pipeline-heal.spec.ts`：自愈/收敛篇（E updatedAt 保护 / F 代际偏斜
 *    自愈 / G gen-1 版本兼容 / H sync 收敛），环境装配见 helpers/webdav-pipeline-env.ts。
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { mediaDB, ADULT_AV_ID_INDEX } from '@/engine/database/models';
import type { StoreRecord } from '@/types';
import { packageDataset, unpackageDataset } from '@/libraries/utils/zip-utils';
import { CURRENT_DATASET_VERSION } from '@/libraries/utils/dataset-version';
import * as WebDAV from '@/provider/webdav/api';
import {
  CLOUD_MATRIX,
  callDownload,
  callPreview,
  getDavRoot,
  callSync,
  callUpload,
  CREDS,
  currentRemoteMeta,
  handBuildZip,
  PASS,
  replaceRemoteDataset,
  seedEntry,
  seedStore,
  setupWebdavPipelineEnv,
  sleep,
  teardownWebdavPipelineEnv,
  TOTAL_CLOUD_RECORDS,
  USER,
} from './helpers/webdav-pipeline-env';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

test.beforeAll(setupWebdavPipelineEnv);
test.afterAll(teardownWebdavPipelineEnv);

// ==================== A · 上传（备份） ====================

test('A·upload：全量本地上传 —— 指纹稳定、verified、盘上逐表计数精确且无 .tmp 残留', async () => {
  for (const [store, count] of CLOUD_MATRIX) await seedStore(store, count);

  const p1 = await callPreview('upload');
  expect(p1.success, p1.preview ? '' : 'preview failed').toBe(true);
  const p2 = await callPreview('upload');
  expect(p2.fingerprint, '同状态两次预检指纹必须一致（STALE_PLAN 前置锚点）').toBe(p1.fingerprint);

  const reply = await callUpload(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.errorCode).toBeUndefined();
  expect(reply.verified, '上传后元数据级复核必须通过').toBe(true);
  expect(reply.totalUploaded).toBe(TOTAL_CLOUD_RECORDS);

  // 真 FS 断言：meta + 每 ZIP 解包计数 + 无暂存残留
  const remote = await currentRemoteMeta();
  const files = fs.readdirSync(path.join(getDavRoot(), 'umm-data')).sort();
  expect(
    files.some((f: string) => f.endsWith('.tmp')),
    `盘上不得有暂存残留: ${files.join(',')}`,
  ).toBe(false);
  for (const [store, count] of CLOUD_MATRIX) {
    const entry = remote.datasets.find((d) => d.key === store);
    expect(entry?.recordCount, `${store} meta 计数`).toBe(count);
    const blob = await WebDAV.downloadDataset(CREDS.webdavUrl, USER, PASS, store);
    const { data } = await unpackageDataset(blob);
    expect(Object.keys(data).length, `${store} ZIP 实际记录数`).toBe(count);
  }
});

// ==================== B · 下载（用户场景复现） ====================

test('B·download：清本地仅留 150 条 → 预览 8 下载/3 跳过 → 确认后 28,709 条全部落库', async () => {
  await mediaDB.clearAll();
  // 本地仅 TMDB 117 + Bangumi 2 + YouTube 31 = 150（对齐用户截图），内容与云端有差异
  for (const store of ['tmdb_records', 'bangumi_records', 'youtube_records']) {
    const count = CLOUD_MATRIX.find(([s]) => s === store)![1];
    await seedStore(store, count, { comment: 'local-edit' });
  }

  const p1 = await callPreview('download');
  expect(p1.success).toBe(true);
  expect(p1.preview?.totals.download, '对齐用户对话框「下载 8 个」').toBe(8);
  expect(p1.preview?.totals.skip, '对齐用户对话框「跳过 3 个」').toBe(3);
  const bilibiliRow = p1.preview?.rows.find((r) => r.key === 'bilibili_records');
  expect(bilibiliRow?.localLatest, '空表占位时间戳不得透出（用户截图误导显示的回归锚点）').toBe('');

  // STALE_PLAN 回归锚点：真实 buildLocalMeta + 时间流逝后指纹必须不变。
  // 若空表/设置的 now 占位再次泄进指纹，1.1s 足以让时间戳必然不同 → 此处变红。
  await sleep(1100);
  const p2 = await callPreview('download');
  expect(p2.fingerprint, '预检→确认之间指纹不得自行漂移（用户「零写入」根因）').toBe(
    p1.fingerprint,
  );

  const reply = await callDownload(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.errorCode, '绝不允许 STALE_PLAN 中止').not.toBe('STALE_PLAN');
  expect(reply.verified).toBe(true);
  expect(reply.totalDownloaded, '8 个数据集应全部下载').toBe(TOTAL_CLOUD_RECORDS);

  for (const [store, count] of CLOUD_MATRIX) {
    expect(await mediaDB.count(store), `${store} 恢复后计数`).toBe(count);
  }

  // 字段保真抽查：首/中/尾 + 内容差异覆盖（本地 local-edit 应被云端值覆盖）
  const first = await mediaDB.get('douban_records', seedEntry('douban_records', 0).key);
  expect(first?.status).toBe(0);
  expect(first?.comment).toBe('c-douban_records-1');
  const mid = await mediaDB.get('douban_records', seedEntry('douban_records', 7500).key);
  expect(mid?.url).toBe('https://example.com/douban_records/7501');
  expect(mid?.linkedIds).toEqual(seedEntry('douban_records', 7500).record.linkedIds);
  const last = await mediaDB.get('douban_records', seedEntry('douban_records', 15017).key);
  expect(last?.updatedAt).toBe(seedEntry('douban_records', 15017).record.updatedAt);
  const edited = await mediaDB.get('tmdb_records', seedEntry('tmdb_records', 0).key);
  expect(edited?.comment, '下载以云端为准，本地临时修订被覆盖').toBe('c-tmdb_records-1');

  // 逐条迁移：遗留 schemaVersion 1 的记录恢复后必须升到 2
  const legacy = seedEntry('douban_records', 996);
  const migrated = await mediaDB.get('douban_records', legacy.key);
  expect(migrated?.schemaVersion, '恢复侧逐条迁移必须升到当前版本').toBe(2);

  // 成人表：键形保持 + avId 派生索引字段由写侧补齐（读路径白名单会剥离该字段，
  // 正确的消费面是 L2 索引查询 —— ADULT_AV_CHECK 的真实读法）。
  const javKey = seedEntry('jav_ids', 0).key;
  const jav = await mediaDB.get('jav_ids', javKey);
  expect(jav?.status).toBeDefined();
  const byIndex = await mediaDB.getByIndex('jav_ids', ADULT_AV_ID_INDEX, javKey);
  expect(byIndex.length, 'avId 派生索引必须命中恢复后的记录').toBeGreaterThanOrEqual(1);
});

// ==================== C · 同步（双向合并） ====================

/**
 * 分叉目标选 imdb_records（789）而非 douban_records（15018）：本 spec 的批量覆盖写
 * 走 fake-indexeddb，实测覆盖已有键的成本病态劣化（×789≈0.9ms/条 → ×2000≈21ms/条，
 * ×15000 必然超时），而「全新键」批量写秒级（见 A/B 的 2.87 万条）。真机 IndexedDB
 * 无此问题（生产导入链路同样以 batchPut 全量覆盖 15k 级记录）。合并语义与 store 无关，
 * 缩到 imdb 级即可钉住同样的契约。
 */

test('C·sync：imdb 双向分叉 —— 并集守恒 1039、pushed/pulled 精确、远端含本地独有', async () => {
  // 前置（serial）：B 之后 local == cloud
  const original = await mediaDB.getAll('imdb_records');
  expect(original.length).toBe(789);

  const localNewer = original.slice(0, 50).map(({ key, record }) => ({
    key,
    record: { ...record, rating: 9, updatedAt: '2026-06-01T00:00:00.000Z' },
  }));
  const localOnly = Array.from({ length: 100 }, (_, i) => ({
    key: `movie::local-${i + 1}`,
    record: {
      url: `https://example.com/local/${i + 1}`,
      status: 2,
      rating: 0,
      updatedAt: '2026-06-01T00:00:00.000Z',
      linkedIds: {},
    },
  }));
  await mediaDB.batchPut('imdb_records', [...localNewer, ...localOnly]);

  const remoteNewerKeys = new Set(original.slice(50, 100).map((e) => e.key));
  const remoteNewer = original
    .filter((e) => remoteNewerKeys.has(e.key))
    .map(({ key, record }) => ({
      key,
      record: { ...record, rating: 3, updatedAt: '2026-07-01T00:00:00.000Z' },
    }));
  const remoteOnly = Array.from({ length: 150 }, (_, i) => ({
    key: `movie::remote-${i + 1}`,
    record: {
      url: `https://example.com/remote/${i + 1}`,
      status: 1,
      rating: 0,
      updatedAt: '2026-01-02T00:00:00.000Z',
      linkedIds: {},
    },
  }));
  const forkedRemote = [
    ...original.filter((e) => !remoteNewerKeys.has(e.key)),
    ...remoteNewer,
    ...remoteOnly,
  ];
  const newMeta = await replaceRemoteDataset('imdb_records', forkedRemote);
  const rm = await currentRemoteMeta();
  rm.datasets = rm.datasets.map((d) => (d.key === 'imdb_records' ? newMeta : d));
  await WebDAV.uploadMeta(CREDS.webdavUrl, USER, PASS, rm);

  const p1 = await callPreview('sync');
  const row = p1.preview?.rows.find((r) => r.key === 'imdb_records');
  expect(row?.direction, '两侧都有数据且内容不同 → merge').toBe('merge');
  const p2 = await callPreview('sync');
  expect(p2.fingerprint, 'sync 预检指纹跨调用稳定').toBe(p1.fingerprint);

  const reply = await callSync(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.verified).toBe(true);
  expect(reply.mergedTables).toBe(1);
  expect(reply.uploaded, 'pushed = 仅本地独有的 100 条').toBe(100);
  expect(reply.downloaded, 'pulled = 远端独有 150 + 远端较新 50').toBe(200);
  expect(
    reply.message ?? '',
    'settings 不再被当「非备份数据集」丢弃（遗留 #1 修复锚点）',
  ).not.toContain('非备份数据集');
  expect(reply.skipped, 'settings + 9 张无变化表 = 10').toBe(10);

  expect(await mediaDB.count('imdb_records'), '并集 = 789 + 100 + 150').toBe(1039);
  const rm2 = await currentRemoteMeta();
  expect(rm2.datasets.find((d) => d.key === 'imdb_records')?.recordCount).toBe(1039);
  expect(
    rm2.datasets.find((d) => d.key === '__settings__')?.recordCount,
    '同步后 __settings__ 必须保留在远端 meta（否则下载侧自此不再恢复设置）',
  ).toBe(12);

  const blob = await WebDAV.downloadDataset(CREDS.webdavUrl, USER, PASS, 'imdb_records');
  const { data } = await unpackageDataset(blob);
  expect(data['movie::local-1'], '本地独有必须推上云端（合并不丢本地）').toBeDefined();
  expect(data['movie::remote-1'], '远端独有保留在云端').toBeDefined();

  const keptLocal = await mediaDB.get('imdb_records', original[0]!.key);
  expect(keptLocal?.rating, '本地较新 → 保留本地').toBe(9);
  const tookRemote = await mediaDB.get('imdb_records', original[75]!.key);
  expect(tookRemote?.rating, '远端较新 → 采纳远端').toBe(3);
});

// ==================== D · 下载失败路径（小表注入；不允许静默吞表） ====================

test('D·download 失败路径：数据与自带 manifest 不符 / 版本过新必须显式失败并翻转 verified', async () => {
  // 前置（serial）：C 之后 local == cloud。失败注入选小表（bangumi 2 / imdb 1039）——
  // 覆盖写在 fake-indexeddb 上有病态慢（×15018 ≈ 5 分钟），大表注入会超时；
  // 真机 IndexedDB 无此问题。两种失败都走真 ZIP 级注入（读侧门禁读的是 ZIP 内层
  // meta，改 meta 条目会被 payload 归一化丢弃/无法触达门禁）。
  const youtubeForked = [
    ...(await mediaDB.getAll('youtube_records')),
    ...Array.from({ length: 50 }, (_, i) => ({
      key: `movie::yt-extra-${i + 1}`,
      record: {
        url: `https://example.com/yt-extra/${i + 1}`,
        status: 2,
        rating: 0,
        updatedAt: '2026-02-01T00:00:00.000Z',
        linkedIds: {},
      },
    })),
  ];
  const ytMeta = await replaceRemoteDataset('youtube_records', youtubeForked);

  // bangumi —— 内层 manifest.hash 伪造（数据重算对不上任何一代）+ meta 条目另给一个
  // 不同的错值 ⇒ 「数据与其自带 manifest 不符」= 真损坏，无条件重算识别在此拒绝。
  const bangumiEntries = await mediaDB.getAll('bangumi_records');
  const bangumiCorrupt = await handBuildZip(bangumiEntries, { hash: 'e'.repeat(64) });
  await WebDAV.uploadDataset(
    CREDS.webdavUrl,
    USER,
    PASS,
    'bangumi_records',
    new Blob([bangumiCorrupt.slice()], { type: 'application/zip' }),
  );

  // imdb —— 内层 meta.dataVersion = CURRENT+1 ⇒ 版本门禁直接拒绝（比当前更新 ⇒
  // 旧扩展读不了，正确姿态是提示更新而不是硬解）。数据加一条差异记录使 hash 不等
  // 于本地（否则 hashEqual ⇒ skip，根本走不到版本门禁）。
  const imdbEntries = await mediaDB.getAll('imdb_records');
  const imdbModified = [
    ...imdbEntries,
    {
      key: 'movie::imdb-future-1',
      record: {
        url: 'https://imdb.example/future/1',
        status: 2,
        rating: 0,
        updatedAt: '2026-02-01T00:00:00.000Z',
        linkedIds: {},
      } as StoreRecord,
    },
  ];
  const imdbFuture = await handBuildZip(imdbModified, {
    dataVersion: CURRENT_DATASET_VERSION + 1,
  });
  const { meta: imdbFutureMeta } = await packageDataset('imdb_records', imdbModified);
  await WebDAV.uploadDataset(
    CREDS.webdavUrl,
    USER,
    PASS,
    'imdb_records',
    new Blob([imdbFuture.slice()], { type: 'application/zip' }),
  );

  const rm = await currentRemoteMeta();
  rm.datasets = rm.datasets.map((d) => {
    if (d.key === 'youtube_records') return ytMeta;
    if (d.key === 'bangumi_records') return { ...d, hash: 'f'.repeat(64) };
    if (d.key === 'imdb_records') return imdbFutureMeta;
    return d;
  });
  await WebDAV.uploadMeta(CREDS.webdavUrl, USER, PASS, rm);

  const p1 = await callPreview('download');
  expect(p1.preview?.rows.find((r) => r.key === 'bangumi_records')?.direction).toBe('download');
  expect(p1.preview?.rows.find((r) => r.key === 'imdb_records')?.direction).toBe('download');

  const reply = await callDownload(p1.fingerprint!);
  expect(reply.success, reply.message ?? reply.error).toBe(true);
  expect(reply.verified, '整表失败必须翻转 verified（恢复不完整不能报成功）').toBe(false);
  expect(reply.message ?? '', '失败表必须显式出现在回报里').toContain('2 张表下载失败');
  expect(reply.message ?? '').toContain('bangumi_records');
  expect(reply.message ?? '').toContain('imdb_records');
  // 执行消费预检方向矩阵（遗留 #2 修复）：jav/bilibili/tmdb/neodb/douban hash 相等
  // → 无变化跳过，不重拉重写；实际下载的只有 youtube（31 覆盖 + 50 新增）。
  expect(reply.totalDownloaded, 'hash 相等的表不再重拉，只有分叉的 youtube 落库').toBe(81);
  expect(reply.message ?? '').toContain('5 个数据集无变化');

  expect(await mediaDB.count('bangumi_records'), '真损坏的表绝不允许吞进本地').toBe(2);
  expect(await mediaDB.count('imdb_records'), '版本过新的表绝不允许吞进本地').toBe(1039);
  expect(await mediaDB.count('youtube_records'), '未受损的表照常恢复').toBe(81);
  expect(await mediaDB.count('jav_ids'), '无变化表必须原样跳过（不重拉重写）').toBe(9668);

  // 收尾修复：把 bangumi/imdb 的云端 blob+meta 恢复为一致状态（后续用例依赖干净云端）。
  const bangMeta = await replaceRemoteDataset('bangumi_records', bangumiEntries);
  const imdbMeta = await replaceRemoteDataset('imdb_records', imdbEntries);
  const rm2 = await currentRemoteMeta();
  rm2.datasets = rm2.datasets.map((d) => {
    if (d.key === 'bangumi_records') return bangMeta;
    if (d.key === 'imdb_records') return imdbMeta;
    return d;
  });
  await WebDAV.uploadMeta(CREDS.webdavUrl, USER, PASS, rm2);
});
